import { http } from './client'

export interface TextModelOption {
  id: string
  label: string
}

export interface ImageModelOption {
  id: string
  label: string
  mode?: 'sync' | 'async'
  max_refs: number
  sizes: Record<string, string>
}

export interface VideoModelOption {
  id: string
  label: string
  /** first_frame = 需要首帧图（i2v）；null = 纯文生（t2v） */
  media: string | null
  resolutions: string[]
  durations: number[]
  /** t2v 支持指定宽高比；i2v 比例跟首帧走，为空数组 */
  ratios: string[]
}

export interface ModelRegistry {
  text: TextModelOption[]
  image: ImageModelOption[]
  video: VideoModelOption[]
  audio: Array<Record<string, unknown>>
}

export const configApi = {
  models: () => http<ModelRegistry>('/config/models'),
}