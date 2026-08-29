"""生成入口：LLM 流式（SSE）+ 图像任务提交。"""
import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from db import Node, Project, SessionLocal, Task
from services.model_gateway import get_gateway

router = APIRouter(prefix="/api/generate", tags=["generate"])


class TextGenerateRequest(BaseModel):
    model: str
    prompt: str = Field(min_length=1, max_length=8000)


@router.post("/text")
async def generate_text(body: TextGenerateRequest):
    """LLM 流式生成，SSE 格式返回。

    事件协议（前端按行解析）：
      data: {"delta": "文"}      增量文本
      data: {"done": true}        结束标记
      data: {"error": "信息"}     出错
    """
    gw = get_gateway()

    async def event_stream():
        try:
            async for delta in gw.stream_text(body.model, body.prompt):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:   # noqa: BLE001 —— 错误原样透传给前端展示
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


class ImageGenerateRequest(BaseModel):
    node_id: str
    model: str
    prompt: str = Field(min_length=1, max_length=8000)
    ref_file_ids: list[str] = Field(default_factory=list)   # D6：参考图
    params: dict = Field(default_factory=dict)


@router.post("/image")
async def generate_image(body: ImageGenerateRequest):
    """创建任务行返回 task_id。实际提交由 TaskRunner 异步做（排队/并发都在那）。"""
    with SessionLocal() as db:
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