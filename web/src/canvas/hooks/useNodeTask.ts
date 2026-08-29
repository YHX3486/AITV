import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tasksApi, type TaskRecord } from '@/api/tasks'

/**
 * 画布级轮询：只有存在活动任务时才 3 秒一查，空闲零请求。
 * 提交/重试时 invalidateQueries(['activeTasks']) 立刻唤醒。
 */
export function useActiveTasks() {
  return useQuery({
    queryKey: ['activeTasks'],
    queryFn: tasksApi.active,
    refetchInterval: (query) => {
      const data = query.state.data
      return data && data.length > 0 ? 3000 : false
    },
  })
}

/** 单节点视角：从活动任务里找自己的（排队/生成中优先） */
export function useNodeTask(nodeId: string): TaskRecord | null {
  const { data } = useActiveTasks()
  return useMemo(() => {
    const list = data ?? []
    // 最新的一条活动任务（后端按创建时间返回，倒序不保证，取 created_at 最大）
    const mine = list.filter((t) => t.node_id === nodeId)
    if (mine.length === 0) return null
    return mine.reduce((a, b) => (a.created_at > b.created_at ? a : b))
  }, [data, nodeId])
}