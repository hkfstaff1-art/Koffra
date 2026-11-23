import { api } from './client'

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
}

export const fetchHealth = () => api.get<HealthResponse>('/health')
