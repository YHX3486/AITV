const BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

/** 通用 fetch 包装：自动加 /api 前缀、JSON 头、错误处理。 */
export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      /* 非 JSON 错误体就算了 */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T   // DELETE 返回空
  return res.json() as Promise<T>
}