from fastapi import APIRouter

from .canvas import router as canvas_router
from .config_api import router as config_router
from .files import router as files_router
from .generate import router as generate_router
from .projects import router as projects_router
from .stats import router as stats_router
from .tasks import router as tasks_router

api_router = APIRouter()
api_router.include_router(projects_router)
api_router.include_router(canvas_router)
api_router.include_router(files_router)
api_router.include_router(config_router)
api_router.include_router(generate_router)
api_router.include_router(tasks_router)
api_router.include_router(stats_router)