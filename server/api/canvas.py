import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from api.schemas import CanvasEdge, CanvasNode, CanvasOut, CanvasPut, CanvasViewport
from db import Edge, Node, Project, get_db

router = APIRouter(prefix="/api/projects/{project_id}/canvas", tags=["canvas"])


def _get_project_or_404(db: Session, project_id: str) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p


def _load_canvas(db: Session, project_id: str) -> CanvasOut:
    """从库里读出整画布。"""
    nodes = db.scalars(select(Node).where(Node.project_id == project_id)).all()
    edges = db.scalars(select(Edge).where(Edge.project_id == project_id)).all()
    project = db.get(Project, project_id)

    viewport = None
    if project.viewport:
        try:
            viewport = CanvasViewport.model_validate(json.loads(project.viewport))
        except Exception:
            viewport = None   # viewport 数据损坏时静默降级，画布用默认视角打开

    return CanvasOut(
        nodes=[
            CanvasNode(id=n.id, type=n.type, x=n.x, y=n.y, width=n.width,
                       data=json.loads(n.data))
            for n in nodes
        ],
        edges=[
            CanvasEdge(id=e.id, source=e.source_id, target=e.target_id)
            for e in edges
        ],
        viewport=viewport,
    )


@router.get("", response_model=CanvasOut)
def get_canvas(project_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(db, project_id)
    return _load_canvas(db, project_id)


@router.put("", response_model=CanvasOut)
def put_canvas(project_id: str, body: CanvasPut, db: Session = Depends(get_db)):
    """整画布保存：前端提交当前完整快照，一个事务里落库。"""
    project = _get_project_or_404(db, project_id)

    # ---- 前置校验：问题数据直接 400，不碰数据库 ----
    payload_ids: set[str] = set()
    for n in body.nodes:
        if n.id in payload_ids:
            raise HTTPException(status_code=400, detail=f"节点 id 重复：{n.id}")
        payload_ids.add(n.id)
    for e in body.edges:
        if e.source not in payload_ids:
            raise HTTPException(status_code=400, detail=f"连线 {e.id} 的起点节点不存在")
        if e.target not in payload_ids:
            raise HTTPException(status_code=400, detail=f"连线 {e.id} 的终点节点不存在")

    # ---- 一个事务里完成替换 ----
    try:
        existing = {
            n.id: n
            for n in db.scalars(select(Node).where(Node.project_id == project_id)).all()
        }

        # 1) 删除快照里已不存在的节点
        #    数据库级联会带走它挂着的 edges 和 tasks——节点都没了，历史任务也该删
        for nid, row in existing.items():
            if nid not in payload_ids:
                db.delete(row)

        # 2) 边全量替换：删光旧边（边没有任何下游数据引用，删光重建最简单）
        db.execute(delete(Edge).where(Edge.project_id == project_id))

        db.flush()   # 把上面的 DELETE 先发出去，避免和后面的 INSERT 主键冲突

        # 3) 节点：存在则原地更新（保住 tasks 等下游数据），不存在则新增
        for n in body.nodes:
            if n.id in existing:
                row = existing[n.id]
                row.type = n.type
                row.x, row.y, row.width = n.x, n.y, n.width
                row.data = json.dumps(n.data, ensure_ascii=False)
            else:
                db.add(Node(
                    id=n.id, project_id=project_id, type=n.type,
                    x=n.x, y=n.y, width=n.width,
                    data=json.dumps(n.data, ensure_ascii=False),
                ))
        db.flush()
        # 4) 插入新边
        for e in body.edges:
            db.add(Edge(
                id=e.id, project_id=project_id,
                source_id=e.source, target_id=e.target,
            ))

        # 5) viewport 存在 project 行上（顺带触发 updated_at 刷新）
        project.viewport = body.viewport.model_dump_json() if body.viewport else "{}"

        db.commit()
    except Exception:
        db.rollback()
        raise

    return _load_canvas(db, project_id)