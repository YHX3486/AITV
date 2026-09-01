"""集中配置：.env 加载、模型注册表、价格表。换模型只改这里。"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY")
if not DASHSCOPE_API_KEY:
    raise RuntimeError(
        "缺少 DASHSCOPE_API_KEY：请在 server/.env 里配置（参考 .env.example）"
    )

DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1"
LLM_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"
TTS_WS_BASE = "wss://dashscope.aliyuncs.com/api-ws/v1/inference"   # TTS WebSocket

MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT", "3"))
DAILY_BUDGET = float(os.getenv("DAILY_BUDGET", "50"))

# 通道说明：
# LLM 流式（openai SDK）/ 图像同步+异步（httpx）/ 视频异步（httpx）
# 音频 TTS（dashscope SDK，WebSocket 协议 httpx 不支持——唯一例外，见 M2 总结）
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
            "id": "happyhorse-1.1-i2v",
            "label": "图生视频 · HappyHorse",
            "media": "first_frame",
            "resolutions": ["480P", "720P", "1080P"],
            "durations": [5, 10],
            "ratios": [],
        },
        {
            "id": "wan2.7-t2v-2026-06-12",
            "label": "文生视频",
            "media": None,
            "resolutions": ["720P", "1080P"],
            "durations": [2, 5, 10],
            "ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
        },
    ],
    "audio": [
        {
            "id": "qwen-audio-3.0-tts-flash",
            "label": "语音合成 · Flash（快）",
            "voices": [
                {"id": "longanhuan_v3.6", "label": "龙暗桓"},
            ],
        },
        {
            "id": "qwen-audio-3.0-tts-plus",
            "label": "语音合成 · Plus（高质量）",
            "voices": [
                {"id": "longanhuan_v3.6", "label": "龙暗桓"},
            ],
        },
    ],
}

# ---- 价格表（元/次）：⚠️ 占位值，务必按官方价目表核对 ----
PRICES = {
    "qwen-image-2.0-pro-2026-06-22": 0.3,
    "qwen-image-3.0": 0.25,
    "happyhorse-1.1-i2v": 1.0,
    "wan2.7-t2v-2026-06-12": 1.0,
    "qwen-audio-3.0-tts-flash": 0.1,
    "qwen-audio-3.0-tts-plus": 0.2,
}