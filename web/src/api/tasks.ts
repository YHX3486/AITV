import { http } from './client'

export interface TaskResultFile {
  id: string
  url: string
}

export interface TaskRecord {
  id: string
  node_id: string
  kind: 'text' | 'image' | 'video' | 'audio'
  model: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  error: string | null
  created_at: string
  finished_at: string | null
  result_files: TaskResultFile[]
  /** D8：排队位次（仅 queued 态有值，1 = 下一个执行） */
  queue_position: number | null
}

export const tasksApi = {
  /** 活动任务（含 60s 终态窗口）——画布轮询专用 */
  active: () => http<TaskRecord[]>('/tasks/active'),

  /** 某节点的任务历史（新→旧）——版本历史 + 离场对账用 */
  nodeHistory: (nodeId: string, limit = 20) =>
    http<TaskRecord[]>(`/tasks/node/${nodeId}?limit=${limit}`),
}