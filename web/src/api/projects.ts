import { http } from './client'

export interface Project {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export const projectsApi = {
  list: () => http<Project[]>('/projects'),
  create: (name?: string) =>
    http<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    }),
  get: (id: string) => http<Project>(`/projects/${id}`),
  rename: (id: string, name: string) =>
    http<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    http<void>(`/projects/${id}`, { method: 'DELETE' }),
}