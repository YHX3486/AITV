import { http } from './client'

export interface TextStreamHandlers {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
}

/** SSE 流式生成。用 fetch 不用 EventSource——EventSource 只支持 GET，我们要 POST。 */
export async function streamGenerateText(
  model: string,
  prompt: string,
  handlers: TextStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/generate/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
    signal,
  })

  if (!res.ok || !res.body) {
    handlers.onError(`请求失败（${res.status}）`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      try {
        const payload = JSON.parse(line.slice(6))
        if (typeof payload.delta === 'string') handlers.onDelta(payload.delta)
        else if (payload.done) handlers.onDone()
        else if (typeof payload.error === 'string') handlers.onError(payload.error)
      } catch {
        /* 忽略解析失败的包 */
      }
    }
  }
}

/** 提交图片生成任务 → 后端入队（TaskRunner 异步接管）→ 返回 task_id */
export async function submitImageTask(body: {
  node_id: string
  model: string
  prompt: string
  ref_file_ids?: string[]
  params: { size?: string; n?: number }
}): Promise<{ task_id: string }> {
  return http('/generate/image', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}