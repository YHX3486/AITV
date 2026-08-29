from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import FileRecord, get_db
from services.files import save_upload

router = APIRouter(prefix="/api/files", tags=["files"])


class FileOut(BaseModel):
    id: str
    kind: str
    path: str
    mime: str | None
    size: int | None
    url: str          # 前端直接可用的静态地址

    model_config = {"from_attributes": True}

    @classmethod
    def from_record(cls, r: FileRecord) -> "FileOut":
        return cls(
            id=r.id, kind=r.kind, path=r.path, mime=r.mime, size=r.size,
            url=f"/files/{r.path}",
        )


@router.post("", response_model=FileOut, status_code=201)
async def upload(file: UploadFile, db: Session = Depends(get_db)):
    """multipart 上传：form 字段名必须是 file。"""
    record = await save_upload(file)
    _ = db  # db 依赖暂未用到（record 已在 service 里入库），保留依赖注入的形状
    return FileOut.from_record(record)


@router.get("", response_model=list[FileOut])
def list_files(kind: str | None = None, db: Session = Depends(get_db)):
    from sqlalchemy import select
    q = select(FileRecord)
    if kind:
        q = q.where(FileRecord.kind == kind)
    return [FileOut.from_record(r) for r in db.scalars(q).all()]


@router.get("/{file_id}", response_model=FileOut)
def get_file(file_id: str, db: Session = Depends(get_db)):
    r = db.get(FileRecord, file_id)
    if not r:
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileOut.from_record(r)