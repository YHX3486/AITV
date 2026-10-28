"""生成入口：LLM 流式（SSE）+ 图像/视频/音频任务提交（含每日预算熔断）。"""
import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.stats import check_daily_budget
from db import FileRecord, Node, SessionLocal, Task
from services.model_gateway import get_gateway

router = APIRouter(prefix="/api/generate", tags=["generate"])


def _validate_ref_files(db, ref_file_ids: list[str], expected_kind: str):
    """参考素材必须真实存在且类型匹配。

    图生图 / 图生视频（首帧）都只接受图片素材；
    否则任务会一直跑到 model_gateway 提交阶段才失败，报错难懂且白占队列。
    """
    for fid in ref_file_ids:
        f = db.get(FileRecord, fid)
        if not f:
            raise HTTPException(status_code=400, detail=f"参考素材不存在：{fid}")
        if f.kind != expected_kind:
            raise HTTPException(
                status_code=400,
                detail=f"参考素材 {fid} 类型是 {f.kind}，"
                       f"{expected_kind} 生成只接受 {expected_kind} 参考素材",
            )


class TextGenerateRequest(BaseModel):
    model: str
    prompt: str = Field(min_length=1, max_length=8000)


@router.post("/text")
async def generate_text(body: TextGenerateRequest):
    gw = get_gateway()

    # 与媒体通道共用每日预算闸门：预算耗尽后文本也拒绝（全局停用，防漏网烧钱）。
    # ⚠️ 局限：LLM 按 token 计费，PRICES 目前没有文本模型价格，
    # 这里只做"花超即熔断"，文本本身暂不计入 today_cost——
    # 待拿到官方 token 价格表后再补精确计量（见 core/config.py PRICES 注释）。
    with SessionLocal() as db:
        allowed, spent = check_daily_budget(db)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"已达每日预算上限（今日已花费 ¥{spent:.2f}）",
            )

    async def event_stream():
        try:
            async for delta in gw.stream_text(body.model, body.prompt):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:   # noqa: BLE001
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class ImageGenerateRequest(BaseModel):
    node_id: str
    model: str
    prompt: str = Field(min_length=1, max_length=8000)
    ref_file_ids: list[str] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)


@router.post("/image")
async def generate_image(body: ImageGenerateRequest):
    with SessionLocal() as db:
        allowed, spent = check_daily_budget(db)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"已达每日预算上限（今日已花费 ¥{spent:.2f}）",
            )
        node = db.get(Node, body.node_id)
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        _validate_ref_files(db, body.ref_file_ids, "image")
        task = Task(
            id=str(uuid.uuid4()),
            node_id=body.node_id,
            kind="image",
            model=body.model,
            params=json.dumps({
                "prompt": body.prompt,
                "ref_file_ids": body.ref_file_ids,
                **body.params,
            }),
            status="queued",
        )
        db.add(task)
        db.commit()
        return {"task_id": task.id}


class VideoGenerateRequest(BaseModel):
    node_id: str
    model: str
    prompt: str = Field(min_length=1, max_length=8000)
    ref_file_ids: list[str] = Field(default_factory=list)
    params: dict = Field(default_factory=dict)


@router.post("/video")
async def generate_video(body: VideoGenerateRequest):
    with SessionLocal() as db:
        allowed, spent = check_daily_budget(db)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"已达每日预算上限（今日已花费 ¥{spent:.2f}）",
            )
        node = db.get(Node, body.node_id)
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        # 图生视频用第一张上游图做首帧；这里要求全部参考素材都是图片
        _validate_ref_files(db, body.ref_file_ids, "image")
        task = Task(
            id=str(uuid.uuid4()),
            node_id=body.node_id,
            kind="video",
            model=body.model,
            params=json.dumps({
                "prompt": body.prompt,
                "ref_file_ids": body.ref_file_ids[:1],
                **body.params,
            }),
            status="queued",
        )
        db.add(task)
        db.commit()
        return {"task_id": task.id}


class AudioGenerateRequest(BaseModel):
    node_id: str
    model: str
    prompt: str = Field(min_length=1, max_length=8000)   # 待合成文本
    params: dict = Field(default_factory=dict)            # voice 等


@router.post("/audio")
async def generate_audio(body: AudioGenerateRequest):
    """TTS 任务提交。TaskRunner 走同步通道（SDK + to_thread），秒级完成。"""
    with SessionLocal() as db:
        allowed, spent = check_daily_budget(db)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"已达每日预算上限（今日已花费 ¥{spent:.2f}）",
            )
        node = db.get(Node, body.node_id)
        if not node:
            raise HTTPException(status_code=404, detail="节点不存在")
        task = Task(
            id=str(uuid.uuid4()),
            node_id=body.node_id,
            kind="audio",
            model=body.model,
            params=json.dumps({
                "prompt": body.prompt,
                **body.params,
            }),
            status="queued",
        )
        db.add(task)
        db.commit()
        return {"task_id": task.id}