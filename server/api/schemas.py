from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------- projects ----------

class ProjectCreate(BaseModel):
    """POST /api/projects 的请求体。name 可以不传，默认「未命名项目」。"""
    name: str | None = Field(default=None, max_length=200)


class ProjectRename(BaseModel):
    """PATCH /api/projects/{id} 的请求体。"""
    name: str = Field(min_length=1, max_length=200)


class ProjectOut(BaseModel):
    """所有 project 接口的统一返回格式。"""
    id: str
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------- canvas ----------

NodeType = Literal["text", "image", "video", "audio", "script"]


class CanvasNode(BaseModel):
    """画布节点。id 由前端生成（React Flow 节点 id）。"""
    id: str
    type: NodeType
    x: float
    y: float
    width: float = Field(default=360, gt=0)
    data: dict = Field(default_factory=dict)      # 前端 node.data 原样存


class CanvasEdge(BaseModel):
    """画布连线。source/target 用节点 id。"""
    id: str
    source: str
    target: str


class CanvasViewport(BaseModel):
    """React Flow 的 viewport：{x, y, zoom}。"""
    x: float
    y: float
    zoom: float


class CanvasOut(BaseModel):
    """GET /canvas 的返回格式。"""
    nodes: list[CanvasNode]
    edges: list[CanvasEdge]
    viewport: CanvasViewport | None = None


class CanvasPut(BaseModel):
    """PUT /canvas 的请求体：整画布快照。"""
    nodes: list[CanvasNode] = Field(default_factory=list)
    edges: list[CanvasEdge] = Field(default_factory=list)
    viewport: CanvasViewport | None = None