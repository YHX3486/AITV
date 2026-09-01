import { http } from './client'

export interface Usage {
  today_count: number
  today_cost: number
  total_count: number
  total_cost: number
  daily_budget: number
  remaining_budget: number
}

export const statsApi = {
  usage: () => http<Usage>('/stats/usage'),
}