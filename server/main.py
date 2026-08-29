from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api import api_router
from db import DATA_DIR, init_db
from services.task_runner import start_task_runner


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    runner_task = start_task_runner()      # TaskRunner 与 init_db 同一个 lifespan
    yield
    runner_task.cancel()                   # 关闭时取消后台协程


app = FastAPI(title="libtv-lite", lifespan=lifespan)
app.include_router(api_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.mount("/files", StaticFiles(directory=DATA_DIR), name="files")

_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="web")