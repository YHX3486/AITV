import { http } from './client'

export interface TextModelOption {
  id: string
  label: string
}
export interface ImageModelOption {
  id: string
  label: string
  max_refs: number
  sizes: Record<string, string>
}
export interface VideoModelOption {
  id: string
  label: string
  durations: number[]
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