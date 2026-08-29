from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from .models import Base

# data 目录固定为 server/data
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{DATA_DIR / 'app.db'}",
    # FastAPI 的同步接口跑在线程池里，连接可能跨线程使用
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """每个新连接都执行：SQLite 这两项默认是关的，必须手动开。"""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")   # 写入不阻塞读取，自动保存时不卡
    cursor.execute("PRAGMA foreign_keys=ON")    # 不开的话 ON DELETE CASCADE 完全不生效！
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False,
                            expire_on_commit=False)


def init_db() -> None:
    """建表（已存在的表自动跳过）。单人本地工具，先不上 Alembic 迁移。"""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI 依赖：每个请求一个 session，用完自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()