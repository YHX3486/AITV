"""所有百炼调用的唯一入口。
通道：LLM 流式 / 图像同步 / 图像异步 / 视频异步（以上 httpx）+ 音频 TTS（dashscope SDK）。
TTS 走 WebSocket 协议是唯一用 SDK 的通道——httpx 不支持 WS，SDK 一次 call 拿完整音频。
"""
import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import httpx
from openai import AsyncOpenAI

from core.config import DASHSCOPE_API_KEY, DASHSCOPE_BASE, LLM_BASE, TTS_WS_BASE


@dataclass
class FetchResult:
    """百炼任务查询的统一结果。"""
    status: str
    urls: list[str] = field(default_factory=list)
    error: str | None = None


class ModelGateway:
    def __init__(self):
        self.http = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=180.0, write=60.0),
            follow_redirects=True,
        )
        self.download = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=300.0),
            follow_redirects=True,
        )
        self.llm = AsyncOpenAI(api_key=DASHSCOPE_API_KEY, base_url=LLM_BASE)

        # dashscope SDK 全局配置（TTS 通道用；懒加载 import 避免不用 TTS 也强依赖）
        import dashscope
        dashscope.api_key = DASHSCOPE_API_KEY
        dashscope.base_websocket_api_url = TTS_WS_BASE
        self.dashscope = dashscope

        self._ref_cache: dict[str, tuple[str, float]] = {}

    def _headers(self, async_mode: bool = False) -> dict[str, str]:
        h = {"Authorization": f"Bearer {DASHSCOPE_API_KEY}"}
        if async_mode:
            h["X-DashScope-Async"] = "enable"
        return h

    # ---------- LLM ----------

    async def stream_text(self, model: str, prompt: str) -> AsyncIterator[str]:
        stream = await self.llm.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    # ---------- 图像：异步通道（qwen-image-3.0 系）----------

    async def submit_image(
        self, model: str, prompt: str, size: str, n: int = 1,
        ref_images: list[str] | None = None,
    ) -> str:
        content: list[dict] = []
        for img in ref_images or []:
            content.append({"image": img})
        content.append({"text": prompt})

        payload = {
            "model": model,
            "input": {
                "messages": [
                    {"role": "user", "content": content},
                ],
            },
            "parameters": {"n": n},
        }
        if size:
            payload["parameters"]["size"] = size

        resp = await self.http.post(
            f"{DASHSCOPE_BASE}/services/aigc/image-generation/generation",
            headers=self._headers(async_mode=True),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["output"]["task_id"]

    # ---------- 图像：同步通道（qwen-image-2.0 系）----------

    async def generate_image_sync(
        self, model: str, prompt: str, size: str, n: int = 1,
        ref_images: list[str] | None = None,
    ) -> list[str]:
        content: list[dict] = []
        for img in ref_images or []:
            content.append({"image": img})
        content.append({"text": prompt})

        payload = {
            "model": model,
            "input": {"messages": [{"role": "user", "content": content}]},
            "parameters": {"n": n},
        }
        if size:
            payload["parameters"]["size"] = size

        resp = await self.http.post(
            f"{DASHSCOPE_BASE}/services/aigc/multimodal-generation/generation",
            headers=self._headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("code"):
            raise RuntimeError(f"{data.get('code')}: {data.get('message')}")

        urls: list[str] = []
        for choice in data.get("output", {}).get("choices") or []:
            for item in choice.get("message", {}).get("content") or []:
                if isinstance(item, dict) and item.get("image"):
                    urls.append(item["image"])
        if not urls:
            raise RuntimeError(f"同步生成未返回图片: {data}")
        return urls

    # ---------- 视频（wan / happyhorse，异步通道）----------

    async def submit_video(
        self, model: str, prompt: str, resolution: str, duration: int,
        first_frame: str | None = None, ratio: str | None = None,
    ) -> str:
        payload: dict = {
            "model": model,
            "input": {"prompt": prompt},
            "parameters": {"resolution": resolution, "duration": duration},
        }
        if ratio:
            payload["parameters"]["ratio"] = ratio
        if first_frame:
            payload["input"]["media"] = [
                {"type": "first_frame", "url": first_frame},
            ]

        resp = await self.http.post(
            f"{DASHSCOPE_BASE}/services/aigc/video-generation/video-synthesis",
            headers=self._headers(async_mode=True),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["output"]["task_id"]

    # ---------- 音频 TTS（qwen-audio-3.0-tts，dashscope SDK）----------

    async def generate_audio(self, model: str, voice: str, text: str) -> bytes:
        """文本 → 语音，返回 mp3 字节。
        SDK 的 call() 是阻塞的（内部走 WebSocket），用 to_thread 包进 asyncio。
        TTS 快（秒级），无需任务轮询——走同步通道模式。"""
        def _call() -> bytes:
            from dashscope.audio.tts_v2 import SpeechSynthesizer
            synthesizer = SpeechSynthesizer(model=model, voice=voice)
            audio = synthesizer.call(text)
            if not audio:
                raise RuntimeError("TTS 未返回音频（检查文本/音色/模型组合）")
            return audio

        return await asyncio.to_thread(_call)

    # ---------- 任务查询（异步通道通用）----------

    async def fetch(self, provider_task_id: str) -> FetchResult:
        resp = await self.http.get(
            f"{DASHSCOPE_BASE}/tasks/{provider_task_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()

        out = data.get("output", {})
        status = out.get("task_status", "pending")
        result: FetchResult = FetchResult(status=status)

        if status == "SUCCEEDED":
            urls: list[str] = []
            for choice in out.get("choices") or []:
                for item in choice.get("message", {}).get("content") or []:
                    if isinstance(item, dict) and item.get("image"):
                        urls.append(item["image"])
            if not urls and out.get("video_url"):
                urls = [out["video_url"]]
            result.urls = urls
        elif status in ("FAILED", "CANCELED", "UNKNOWN"):
            result.status = "failed"
            result.error = out.get("message") or str(out)
        return result

    async def download_file(self, url: str, dest_abs_path) -> int:
        resp = await self.download.get(url)
        resp.raise_for_status()
        with open(dest_abs_path, "wb") as f:
            f.write(resp.content)
        return len(resp.content)

    async def aclose(self):
        """进程退出时释放连接池。

        uvicorn --reload 会反复启停进程，不关连接会累积句柄；
        单测/脚本里用完后也应该调一次。
        """
        for client in (self.http, self.download):
            try:
                await client.aclose()
            except Exception:   # noqa: BLE001  关闭阶段不抛，避免掩盖退出流程
                pass
        try:
            await self.llm.close()
        except Exception:   # noqa: BLE001
            pass


_gateway: ModelGateway | None = None


def get_gateway() -> ModelGateway:
    global _gateway
    if _gateway is None:
        _gateway = ModelGateway()
    return _gateway