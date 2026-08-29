"""所有百炼调用的唯一入口。
D1: LLM 流式 | D3: 图像异步任务 | 换模型: 图像同步通道（qwen-image-2.0 系）。
"""
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import httpx
from openai import AsyncOpenAI

from core.config import DASHSCOPE_API_KEY, DASHSCOPE_BASE, LLM_BASE


@dataclass
class FetchResult:
    """百炼任务查询的统一结果。"""
    status: str                    # pending | running | succeeded | failed
    urls: list[str] = field(default_factory=list)
    error: str | None = None


class ModelGateway:
    def __init__(self):
        # read=180：同步模式图像生成可能挂 1-2 分钟，留足余量
        self.http = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=180.0, write=60.0),
            follow_redirects=True,
        )
        # 结果下载单独用长超时客户端（视频可能几十 MB）
        self.download = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=300.0),
            follow_redirects=True,
        )
        self.llm = AsyncOpenAI(api_key=DASHSCOPE_API_KEY, base_url=LLM_BASE)
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
        """提交图像异步任务 → 百炼 task_id。

        - 端点：/services/aigc/image-generation/generation（与同步端点不同！）
        - payload：messages 对话式；T2I 只有 text，I2I 前置 1-3 个 image
        - ref_images：参考图列表（公网 URL 或 data:base64 前缀字符串），D6 启用
        - 尺寸分隔符必须是 *（星号），不是 x
        """
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

    # ---------- 图像：同步通道（qwen-image-2.0 系只支持同步）----------

    async def generate_image_sync(
        self, model: str, prompt: str, size: str, n: int = 1,
        ref_images: list[str] | None = None,
    ) -> list[str]:
        """同步模式生成图像：POST 后挂住等结果，直接返回图片 URL 列表。
        不产生 task_id。可能等待 30-180 秒，只能在 asyncio 协程里调用。"""
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
            headers=self._headers(),   # 不带 async 头 = 同步模式
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

        # HTTP 200 但业务失败（code 存在）
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

    # ---------- 任务查询（异步通道用）----------

    async def fetch(self, provider_task_id: str) -> FetchResult:
        """查询百炼任务状态（GET /tasks/{id}，图/视频通用）。"""
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
            # qwen-image 系：output.choices[].message.content[].image
            urls: list[str] = []
            for choice in out.get("choices") or []:
                for item in choice.get("message", {}).get("content") or []:
                    if isinstance(item, dict) and item.get("image"):
                        urls.append(item["image"])
            result.urls = urls
        elif status in ("FAILED", "CANCELED", "UNKNOWN"):
            result.status = "failed"
            result.error = out.get("message") or str(out)
        return result

    async def download_file(self, url: str, dest_abs_path) -> int:
        """下载结果到本地，返回字节数。长超时客户端。"""
        resp = await self.download.get(url)
        resp.raise_for_status()
        with open(dest_abs_path, "wb") as f:
            f.write(resp.content)
        return len(resp.content)


_gateway: ModelGateway | None = None


def get_gateway() -> ModelGateway:
    global _gateway
    if _gateway is None:
        _gateway = ModelGateway()
    return _gateway