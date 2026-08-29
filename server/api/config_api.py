from fastapi import APIRouter

from core.config import MODEL_REGISTRY

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/models")
def get_models():
    """前端模型下拉的唯一数据源（不含 API Key）。"""
    return MODEL_REGISTRY