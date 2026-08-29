"""进程内任务执行器：提交 → 轮询/同步等待 → 下载落盘 → 登记 files。
图像按模型自动分流：qwen-image-2.x → 同步通道；qwen-image-3.x → 异步通道。
D6：参考图走 Base64 直传（文档证实 I2I 支持此格式，无需临时存储）。
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

# 这些前缀的图像模型只支持同步接口（文档：qwen-image-2.0 系仅支持同步）
SYNC_IMAGE_MODELS = ("qwen-image-2",)


def is_sync_model(model_id: str) -> bool:
    return model_id.startswith(SYNC_IMAGE_MODELS)


class TaskRunner:
    def __init__(self):
        self.gw = get_gateway()
        self.sem = asyncio.Semaphore(MAX_CONCURRENT)
        self.inflight: set[str] = set()

    async def run(self):
        """主循环：扫库捞任务。"""
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
            except Exception as e:   # noqa: BLE001 —— 主循环绝不能死
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
                # 重启恢复：百炼侧任务还在跑，直接续查（不占新并发额度）
                await self._poll(task_id)
            else:
                async with self.sem:   # 并发额度覆盖提交→完成的整段
                    ok = await self._submit(task_id)
                    if ok:
                        await self._poll(task_id)
        except Exception as e:   # noqa: BLE001
            await self._mark_failed(task_id, f"内部错误: {e}")
        finally:
            self.inflight.discard(task_id)

    async def _submit(self, task_id: str) -> bool:
        """读 params → 按模型分流提交 → 更新任务状态。
        返回 True = 异步任务已提交，需继续 _poll；
        返回 False = 生命周期已结束（同步完成/失败），不要 _poll。"""
        with SessionLocal() as db:
            t = db.get(Task, task_id)
            if not t or t.status != "queued":
                return False
            params = json.loads(t.params)
            model = t.model
            prompt = params.get("prompt", "")
            kind = t.kind
            ref_file_ids = params.get("ref_file_ids", [])   # D6：参考图

        size = params.get("size", "1328*1328")
        if "x" in size:
            size = size.replace("x", "*")   # 兼容历史数据/注册表里的 x 写法

        # D6：本地文件 → data:base64 编码（百炼 I2I 直接收这个格式）
        ref_images: list[str] = []
        for fid in ref_file_ids[:3]:   # 文档：I2I 最多 3 张
            encoded = self._encode_ref_image(fid)
            if encoded:
                ref_images.append(encoded)

        try:
            if kind == "image" and is_sync_model(model):
                # ==== 同步通道（qwen-image-2.0 系）====
                with SessionLocal() as db:
                    t = db.get(Task, task_id)
                    if not t:
                        return False
                    t.status = "running"   # 先点亮状态，前端可见
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
                # ==== 异步通道（qwen-image-3.0 系 / 视频）====
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
        """files 表查记录 → 读本地文件 → data:base64 编码。
        文件缺失/超大返回 None（跳过该参考，不让整个任务挂掉）。"""
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

        # 文档要求：参考图不超过 10MB
        if len(raw) > 10 * 1024 * 1024:
            return None

        return f"data:{mime};base64,{base64.b64encode(raw).decode()}"

    async def _poll(self, task_id: str):
        """轮询直到终态（异步通道）。每轮检查任务行还在不在。"""
        while True:
            await asyncio.sleep(POLL_INTERVAL)
            with SessionLocal() as db:
                t = db.get(Task, task_id)
                if not t:
                    return   # 节点被删→级联删行→退出
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
        """立刻下载结果（远端 URL 会过期）→ data/generated/ → files 表。"""
        ids: list[str] = []
        for url in urls:
            file_id = str(uuid.uuid4())
            ext = Path(url.split("?")[0]).suffix or (
                mimetypes.guess_extension("image/png") or ".png"
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
    """挂在 FastAPI lifespan 里的入口。"""
    runner = TaskRunner()
    return asyncio.create_task(runner.run())