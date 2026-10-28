"""进程内任务执行器：提交 → 轮询/同步等待 → 下载落盘 → 登记 files。
分流：图像2.0→同步；图像3.0/wan/happyhorse→异步轮询；音频TTS→同步（SDK+to_thread）。
"""
import asyncio
import base64
import httpx
import json
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from core.config import MAX_CONCURRENT
from db import DATA_DIR, FileRecord, SessionLocal, Task
from services.model_gateway import get_gateway

GENERATED_DIR = DATA_DIR / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

POLL_INTERVAL = 5

SYNC_IMAGE_MODELS = ("qwen-image-2",)


def is_sync_model(model_id: str) -> bool:
    return model_id.startswith(SYNC_IMAGE_MODELS)


class TaskRunner:
    def __init__(self):
        self.gw = get_gateway()
        self.sem = asyncio.Semaphore(MAX_CONCURRENT)
        self.inflight: set[str] = set()

    def _recover_stale_tasks(self):
        """启动时回收僵尸任务。

        状态 = running 但没有 provider_task_id 的任务，说明进程是在同步通道
        （图像2.0 / TTS，先置 running 再调用百炼）执行中途被杀：
        上游尚未返回可续查的任务 id，永远等不到 _poll 的终态。
        把它们重置回 queued 让本轮重新提交；
        （running + 有 provider_task_id 的走 _lifecycle 的 is_recovery 续查，不动。）

        已知取舍：若崩溃前上游其实已成功（同步图像已扣费但本地没登记），
        重跑会重复计费一次——比起永久卡死的僵尸任务，宁可重试，注释留档。"""
        with SessionLocal() as db:
            rows = db.scalars(
                select(Task).where(
                    Task.status == "running",
                    Task.provider_task_id.is_(None),
                )
            ).all()
            for t in rows:
                print(
                    f"[TaskRunner] 回收僵尸任务 {t.id}（{t.kind}）："
                    f"running 且无 provider_task_id → 重置为 queued"
                )
                t.status = "queued"
            db.commit()

    async def run(self):
        self._recover_stale_tasks()
        while True:
            try:
                with SessionLocal() as db:
                    rows = db.execute(
                        select(Task).where(
                            Task.status.in_(("queued", "running"))
                        )
                    ).scalars().all()
                for t in rows:
                    if t.id in self.inflight:
                        continue
                    self.inflight.add(t.id)
                    asyncio.create_task(self._lifecycle(t.id))
            except Exception as e:   # noqa: BLE001
                print(f"[TaskRunner] 主循环异常（忽略继续）: {e}")
            await asyncio.sleep(3)

    async def _lifecycle(self, task_id: str):
        try:
            with SessionLocal() as db:
                t = db.get(Task, task_id)
                if not t:
                    return
                is_recovery = t.status == "running" and t.provider_task_id

            if is_recovery:
                await self._poll(task_id)
            else:
                async with self.sem:
                    ok = await self._submit(task_id)
                    if ok:
                        await self._poll(task_id)
        except Exception as e:   # noqa: BLE001
            await self._mark_failed(task_id, f"内部错误: {e}")
        finally:
            self.inflight.discard(task_id)

    async def _submit(self, task_id: str) -> bool:
        """读 params → 按类型/模型分流提交 → 更新任务状态。
        返回 True = 需继续 _poll；False = 生命周期已结束。"""
        with SessionLocal() as db:
            t = db.get(Task, task_id)
            if not t or t.status != "queued":
                return False
            params = json.loads(t.params)
            model = t.model
            prompt = params.get("prompt", "")
            kind = t.kind
            ref_file_ids = params.get("ref_file_ids", [])

        size = params.get("size", "1328*1328")
        if "x" in size:
            size = size.replace("x", "*")

        ref_images: list[str] = []
        for fid in ref_file_ids[:3]:
            encoded = self._encode_ref_image(fid)
            if encoded:
                ref_images.append(encoded)

        try:
            if kind == "audio":
                # ==== 音频 TTS：同步通道（SDK 阻塞调用包 to_thread）====
                with SessionLocal() as db:
                    t = db.get(Task, task_id)
                    if not t:
                        return False
                    t.status = "running"
                    db.commit()

                audio_bytes = await self.gw.generate_audio(
                    model=model,
                    voice=params.get("voice", "longanhuan_v3.6"),
                    text=prompt,
                )
                file_id = self._save_audio_bytes(audio_bytes)
                with SessionLocal() as db:
                    t = db.get(Task, task_id)
                    if not t:
                        return False
                    t.status = "succeeded"
                    t.result_file_ids = json.dumps([file_id])
                    t.finished_at = datetime.now(timezone.utc)
                    db.commit()
                return False
            elif kind == "image" and is_sync_model(model):
                # ==== 图像同步通道（qwen-image-2.0 系）====
                with SessionLocal() as db:
                    t = db.get(Task, task_id)
                    if not t:
                        return False
                    t.status = "running"
                    db.commit()

                urls = await self.gw.generate_image_sync(
                    model=model, prompt=prompt, size=size,
                    n=int(params.get("n", 1)),
                    ref_images=ref_images,
                )
                file_ids = await self._save_results(urls, kind)
                with SessionLocal() as db:
                    t = db.get(Task, task_id)
                    if not t:
                        return False
                    t.status = "succeeded"
                    t.result_file_ids = json.dumps(file_ids)
                    t.finished_at = datetime.now(timezone.utc)
                    db.commit()
                return False
            else:
                # ==== 异步通道：图像 3.0 / wan / happyhorse 视频 ====
                if kind == "video":
                    first_frame = ref_images[0] if ref_images else None
                    pid = await self.gw.submit_video(
                        model=model,
                        prompt=prompt,
                        resolution=params.get("resolution", "720P"),
                        duration=int(params.get("duration", 5)),
                        first_frame=first_frame,
                        ratio=params.get("ratio"),
                    )
                else:
                    pid = await self.gw.submit_image(
                        model=model, prompt=prompt, size=size,
                        n=int(params.get("n", 1)),
                        ref_images=ref_images,
                    )
        except httpx.HTTPError as e:
            body = ""
            if hasattr(e, "response") and e.response is not None:
                body = e.response.text
            await self._mark_failed(task_id, f"提交百炼失败: {body or e}")
            return False
        except Exception as e:   # noqa: BLE001
            await self._mark_failed(task_id, f"生成失败: {e}")
            return False

        with SessionLocal() as db:
            t = db.get(Task, task_id)
            if not t:
                return False
            t.provider_task_id = pid
            t.status = "running"
            db.commit()
        return True

    def _encode_ref_image(self, file_id: str) -> str | None:
        """files 表查记录 → 读本地文件 → data:base64 编码。"""
        with SessionLocal() as db:
            f = db.get(FileRecord, file_id)
            if not f:
                return None
            path = DATA_DIR / f.path
            mime = f.mime or "image/png"

        try:
            raw = path.read_bytes()
        except OSError:
            return None

        if len(raw) > 10 * 1024 * 1024:
            return None

        return f"data:{mime};base64,{base64.b64encode(raw).decode()}"

    def _save_audio_bytes(self, audio_bytes: bytes) -> str:
        """TTS 结果是原始字节（无 URL），直接落盘登记。"""
        file_id = str(uuid.uuid4())
        rel = f"generated/{file_id}.mp3"
        (GENERATED_DIR / f"{file_id}.mp3").write_bytes(audio_bytes)

        with SessionLocal() as db:
            db.add(FileRecord(
                id=file_id, kind="audio", path=rel,
                mime="audio/mpeg", source="generated",
                size=len(audio_bytes),
            ))
            db.commit()
        return file_id

    async def _poll(self, task_id: str):
        while True:
            await asyncio.sleep(POLL_INTERVAL)
            with SessionLocal() as db:
                t = db.get(Task, task_id)
                if not t:
                    return
                pid = t.provider_task_id
                kind = t.kind

            try:
                st = await self.gw.fetch(pid)
            except Exception as e:   # noqa: BLE001
                print(f"[TaskRunner] 查询任务 {task_id} 失败（下轮重试）: {e}")
                continue

            if st.status == "SUCCEEDED":
                file_ids = await self._save_results(st.urls, kind)
                with SessionLocal() as db:
                    t = db.get(Task, task_id)
                    if not t:
                        return
                    t.status = "succeeded"
                    t.result_file_ids = json.dumps(file_ids)
                    t.finished_at = datetime.now(timezone.utc)
                    db.commit()
                return
            if st.status == "failed":
                await self._mark_failed(task_id, st.error or "生成失败")
                return

    async def _save_results(self, urls: list[str], kind: str) -> list[str]:
        """立刻下载结果 → data/generated/ → files 表。"""
        ids: list[str] = []
        for url in urls:
            file_id = str(uuid.uuid4())
            ext = Path(url.split("?")[0]).suffix
            if not ext:
                ext = (
                    mimetypes.guess_extension(f"{kind}/mp4")
                    if kind == "video"
                    else (mimetypes.guess_extension("image/png") or ".png")
                )
            rel = f"generated/{file_id}{ext}"
            await self.gw.download_file(url, GENERATED_DIR / f"{file_id}{ext}")

            with SessionLocal() as db:
                db.add(FileRecord(
                    id=file_id, kind=kind, path=rel,
                    mime=mimetypes.guess_type(rel)[0], source="generated",
                ))
                db.commit()
            ids.append(file_id)
        return ids

    async def _mark_failed(self, task_id: str, error: str):
        with SessionLocal() as db:
            t = db.get(Task, task_id)
            if not t:
                return
            t.status = "failed"
            t.error = error[:2000]
            t.finished_at = datetime.now(timezone.utc)
            db.commit()


def start_task_runner():
    runner = TaskRunner()
    return asyncio.create_task(runner.run())