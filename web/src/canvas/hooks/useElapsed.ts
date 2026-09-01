import { useEffect, useState } from 'react'

/**
 * 任务已耗时（秒）。active 时每秒跳动的计时器；非 active 恒为 0。
 * 时区注意：后端 created_at 是 naive UTC 字符串（无 Z 后缀），
 * new Date 直接解析会按浏览器本地时区 → 差 8 小时。必须补 Z 再解析。
 */
export function useElapsed(startedAt: string | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [active])

  if (!active || !startedAt) return 0

  const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(startedAt)
    ? startedAt
    : `${startedAt}Z`   // naive UTC → 显式 UTC
  const start = new Date(normalized).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now - start) / 1000))
}