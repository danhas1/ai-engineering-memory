import type {
  AskSuccessResponse,
  HealthResponse,
  GapsResponse,
  TeamsResponse,
} from './types'
import { ApiError } from './types'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function post<T>(path: string, body: unknown): Promise<T> {
  const res  = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status)
  return data as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status)
  return res.json() as Promise<T>
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status)
  return res.json() as Promise<T>
}

export async function askQuestion(question: string, team?: string): Promise<AskSuccessResponse> {
  const body: Record<string, string> = { question }
  if (team && team !== 'all') body.team = team
  return post<AskSuccessResponse>('/ask', body)
}

export async function getTeams(): Promise<TeamsResponse> {
  return get<TeamsResponse>('/teams')
}

export async function checkHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health')
}


export async function getGaps(): Promise<GapsResponse> {
  return get<GapsResponse>('/gaps')
}

export async function deleteGap(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/gaps/${id}`)
}
