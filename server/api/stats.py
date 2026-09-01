"""花费统计：今日/累计 生成数与花费（按 tasks 计数 × PRICES）。"""
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.config import DAILY_BUDGET, PRICES
from db import Task, get_db

router = APIRouter(prefix="/api/stats", tags=["stats"])


class UsageOut(BaseModel):
    today_count: int
    today_cost: float
    total_count: int
    total_cost: float
    daily_budget: float
    remaining_budget: float


def _cost_of(rows: list[Task]) -> float:
    """只按成功任务计费（失败不产生费用——百炼计费规则）。"""
    return sum(PRICES.get(t.model, 0.0) for t in rows if t.status == "succeeded")


@router.get("/usage", response_model=UsageOut)
def usage(db: Session = Depends(get_db)):
    rows = db.scalars(select(Task)).all()
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    today_rows = [t for t in rows if t.created_at >= today_start]
    today_cost = _cost_of(today_rows)
    total_cost = _cost_of(rows)

    return UsageOut(
        today_count=len([t for t in today_rows if t.status == "succeeded"]),
        today_cost=round(today_cost, 2),
        total_count=len([t for t in rows if t.status == "succeeded"]),
        total_cost=round(total_cost, 2),
        daily_budget=DAILY_BUDGET,
        remaining_budget=round(DAILY_BUDGET - today_cost, 2),
    )


def check_daily_budget(db: Session) -> tuple[bool, float]:
    """提交前熔断检查：返回 (是否允许, 今日已花费)。"""
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.scalars(
        select(Task).where(Task.created_at >= today_start)
    ).all()
    cost = _cost_of(rows)
    return cost < DAILY_BUDGET, cost