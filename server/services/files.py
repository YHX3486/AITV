import mimetypes
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from core.config import UPLOAD_MAX_MB
from db import DATA_DIR, FileRecord, SessionLocal

UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# 只允许这些类型进库（按需求 FS-01：图片/视频/音频三类）
ALLOWED = {
    "image": {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "video": {"video/mp4", "video/webm", "video/quicktime"},
    "audio": {"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"},
}


def kind_from_mime(mime: str | None) -> str:
    """mime → kind（image/video/audio），认不出就 400。"""
    if not mime:
        raise HTTPException(status_code=400, detail="无法识别文件类型")
    for kind, mimes in ALLOWED.items():
        if mime in mimes:
            return kind
    raise HTTPException(status_code=400, detail=f"不支持的文件类型：{mime}")


async def save_upload(file: UploadFile) -> FileRecord:
    """
    上传落盘 + 登记 files 表。
    存储路径：data/uploads/<uuid>.<原扩展名>
    """
    kind = kind_from_mime(file.content_type)
    ext = Path(file.filename or "").suffix.lower() or (
        mimetypes.guess_extension(file.content_type or "") or ""
    )
    file_id = str(uuid.uuid4())
    rel_path = f"uploads/{file_id}{ext}"          # 相对 data/ 的路径（DB 里存这个）
    abs_path = UPLOADS_DIR / f"{file_id}{ext}"

    size = 0
    max_bytes = UPLOAD_MAX_MB * 1024 * 1024
    try:
        with abs_path.open("wb") as f:
            while chunk := await file.read(1024 * 1024):   # 1MB 分块，大文件也不爆内存
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"文件超过大小上限（{UPLOAD_MAX_MB}MB），已拒绝",
                    )
                f.write(chunk)
    except HTTPException:
        abs_path.unlink(missing_ok=True)   # 删掉写了一半的文件
        raise

    record = FileRecord(
        id=file_id,
        kind=kind,
        path=rel_path,
        mime=file.content_type,
        size=size,
        source="upload",
    )
    with SessionLocal() as db:
        db.add(record)
        db.commit()
        db.refresh(record)

    return record