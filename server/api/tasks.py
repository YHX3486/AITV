"""任务查询接口：active（轮询，带排队位次）+ 节点历史（版本切换/对账）。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import FileRecord, Node, Task, get_db

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


class TaskOut(BaseModel):
    id: str
    node_id: str
    kind: str
    model: str
    status: str
    error: str | None = None
    created_at: datetime
    finished_at: str | None = None
    result_files: list[dict] = []
    queue_position: int | None = None   # D8：排队位次（1 = 下一个执行；非排队态为 None）

    model_config = {"from_attributes": True}


def _to_out(t: Task, db: Session) -> TaskOut:
    import json

    files: list[dict] = []
    if t.result_file_ids:
        for fid in json.loads(t.result_file_ids):
            f = db.get(FileRecord, fid)
            if f:
                files.append({"id": f.id, "url": f"/files/{f.path}"})
    return TaskOut(
        id=t.id, node_id=t.node_id, kind=t.kind, model=t.model,
        status=t.status, error=t.error, created_at=t.created_at,
        finished_at=t.finished_at.isoformat() if t.finished_at else None,
        result_files=files,
    )


@router.get("/active", response_model=list[TaskOut])
def active_tasks(db: Session = Depends(get_db)):
    """活动任务 + 最近 60 秒内终结的任务（终态窗口，回填转变检测用）。

    D8：queued 任务带 queue_position——按创建时间排序后，
    减去当前 running 数（它们占着并发额度），剩下的就是排队位次。

    时区注意：finished_at 在 SQLite 里是 naive UTC，
    cutoff 必须同样用 naive 的 utcnow()（踩过：aware 比较错位导致永不回填）。
    """
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    rows = db.execute(
        select(Task).where(
            Task.status.in_(("queued", "running"))
            | (
                Task.status.in_(("succeeded", "failed"))
                & (Task.finished_at >= cutoff)
            )
        )
        .order_by(Task.created_at)
    ).scalars().all()

    # 并发额度内正在跑的数量
    running_count = sum(1 for t in rows if t.status == "running")

    out: list[TaskOut] = []
    queued_seen = 0
    for t in rows:
        item = _to_out(t, db)
        if t.status == "queued":
            # 位次 = 当前排队序号。前面若还有 running 占位则不消耗排队序号——
            # 简化模型：第 N 个 queued = 前面 queued 数 + 1，
            # 若 running 不满额度，它实际马上就能跑（位次就是它）
            queued_seen += 1
            item.queue_position = queued_seen
        out.append(item)
    return out


@router.get("/node/{node_id}", response_model=list[TaskOut])
def node_tasks(node_id: str, limit: int = 20, db: Session = Depends(get_db)):
    """某节点的任务历史（新→旧）。版本历史列表 + 离场对账的数据源。

    注意：这条必须注册在 /api/tasks/{task_id} 这类通配路由之前——
    FastAPI 按注册顺序匹配，node/ 前缀和 {task_id} 会撞。
    """
    node = db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="节点不存在")
    rows = db.execute(
        select(Task)
        .where(Task.node_id == node_id)
        .order_by(Task.created_at.desc())
        .limit(min(limit, 50))
    ).scalars().all()
    return [_to_out(t, db) for t in rows]