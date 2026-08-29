from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint, DateTime, Float, ForeignKey, Index,
    Integer, String, Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)   # uuid
    name: Mapped[str] = mapped_column(String(200), default="未命名项目")
    viewport: Mapped[str] = mapped_column(Text, default="{}")        # JSON：缩放/平移位置
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Node(Base):
    __tablename__ = "nodes"
    __table_args__ = (
        CheckConstraint("type IN ('text','image','video','audio','script')"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)   # 前端 React Flow 节点 id
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    width: Mapped[float] = mapped_column(Float, default=360)
    data: Mapped[str] = mapped_column(Text, default="{}")            # JSON：内容+生成器配置+当前 file_id
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Edge(Base):
    __tablename__ = "edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    source_id: Mapped[str] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    target_id: Mapped[str] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))


class FileRecord(Base):
    """表名 files。类名不叫 File，是为了避免以后和 fastapi 的 File 上传函数重名。"""
    __tablename__ = "files"
    __table_args__ = (
        CheckConstraint("kind IN ('image','video','audio')"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(Text)                          # 相对 data/ 的路径
    mime: Mapped[str | None] = mapped_column(Text)
    size: Mapped[int | None] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(20), default="upload")  # upload | generated
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("kind IN ('text','image','video','audio')"),
        CheckConstraint("status IN ('queued','running','succeeded','failed','cancelled')"),
        Index("idx_tasks_node", "node_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    model: Mapped[str] = mapped_column(String(100))
    params: Mapped[str] = mapped_column(Text, default="{}")          # JSON：prompt、参考 file_ids 等
    status: Mapped[str] = mapped_column(String(20), default="queued")
    provider_task_id: Mapped[str | None] = mapped_column(Text)       # 百炼侧任务 id（重启续查的关键）
    result_file_ids: Mapped[str | None] = mapped_column(Text)        # JSON: [file_id,...]
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)