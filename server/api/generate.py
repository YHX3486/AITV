"""生成入口：LLM 流式（SSE）+ 图像/视频任务提交（含每日预算熔断）。"""
import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from api.stats import check_daily_budget
from db import Node, SessionLocal, Task
from services.model_gateway import get_gateway

router = APIRouter(prefix="/api/generate", tags=["generate"])


class TextGenerateRequest(BaseModel):
    model: str
    prompt: str = Field(min_length=1, max_length=8000)


@router.post("/text")
async def generate_text(body: TextGenerateRequest):
    """LLM 流式生成（SSE）。LLM 便宜且快，不进熔断。"""
    gw = get_gateway()

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
    ref_file_ids: list[str] = Field(default_factory=list)   # 第一张作首帧
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