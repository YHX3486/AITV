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
  media: string | null
  resolutions: string[]
  durations: number[]
  ratios: string[]
}

export interface AudioVoiceOption {
  id: string
  label: string
}

export interface AudioModelOption {
  id: string
  label: string
  voices: AudioVoiceOption[]
}

export interface ModelRegistry {
  text: TextModelOption[]
  image: ImageModelOption[]
  video: VideoModelOption[]
  audio: AudioModelOption[]
}

export const configApi = {
  models: () => http<ModelRegistry>('/config/models'),
}