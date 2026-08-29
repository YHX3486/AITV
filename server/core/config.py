"""集中配置：.env 加载、模型注册表、价格表。换模型只改这里。"""
import os
from pathlib import Path

from dotenv import load_dotenv

# 显式定位 server/.env，与启动目录无关
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ---- API Key：缺失直接启动报错，不静默 ----
DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY")
if not DASHSCOPE_API_KEY:
    raise RuntimeError(
        "缺少 DASHSCOPE_API_KEY：请在 server/.env 里配置（参考 .env.example）"
    )

# ---- 端点 ----
DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1"          # 图/视频 REST
LLM_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"    # LLM 兼容模式

# ---- 运行参数 ----
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT", "3"))
DAILY_BUDGET = float(os.getenv("DAILY_BUDGET", "50"))

# ---- 模型注册表（按当前账号控制台校准）----
# mode: sync = 同步接口（POST 挂住等结果，2.0 系只支持这个）
#       async = 异步接口（提交拿 task_id → 轮询，3.0 支持）
# ⚠️ 尺寸分隔符必须是 *（星号）
MODEL_REGISTRY = {
    "text": [
        {"id": "qwen3.7-flash-2026-07-15", "label": "Qwen3.7 Flash · 快"},
        {"id": "qwen3.8-27b", "label": "Qwen3.8 27B · 强"},
    ],
    "image": [
        {
            "id": "qwen-image-2.0-pro-2026-06-22",
            "label": "图像 2.0 Pro",
            "mode": "sync",
            "max_refs": 3,
            "sizes": {
                "1:1": "2048*2048", "16:9": "2688*1536", "9:16": "1536*2688",
                "4:3": "2368*1728", "3:4": "1728*2368",
            },
        },
        {
            "id": "qwen-image-3.0",
            "label": "文生图 3.0",
            "mode": "async",
            "max_refs": 3,
            "sizes": {
                "1:1": "1328*1328", "16:9": "1664*928", "9:16": "928*1664",
                "4:3": "1472*1104", "3:4": "1104*1472",
            },
        },
    ],
    "video": [
        {
            "id": "wan2.7-tzv-2026-06-12",
            "label": "文生视频 · TZV",
            "durations": [5],
        },
    ],
    "audio": [],   # TTS 是 P1，本账号暂无 cosyvoice，D13 再定
}

# ---- 价格表（元/次）：⚠️ 占位值，务必按官方价目表核对 ----
PRICES = {
    "qwen-image-2.0-pro-2026-06-22": 0.3,
    "qwen-image-3.0": 0.25,
    "wan2.7-tzv-2026-06-12": 1.0,
}