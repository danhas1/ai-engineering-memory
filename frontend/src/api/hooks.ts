import { useState, useEffect, useCallback, useRef } from 'react'
import { askQuestion, checkHealth } from './client'
import type { Source } from './types'
import { ApiError } from './types'
import { useChatStore } from '@/store/chatStore'
import { useSourcesStore } from '@/store/sourcesStore'

// ── useAsk ─────────────────────────────────────────────────────────────────────
interface UseAskOptions {
  turnId?: string
  team?:   string
}

export function useAsk(options?: UseAskOptions) {
  const [isLoading, setIsLoading] = useState(false)
  const [error,     setError    ] = useState<string | null>(null)
  const [answer,    setAnswer   ] = useState<string | null>(null)
  const [sources,   setSources  ] = useState<Source[]>([])
  const [owner,     setOwner    ] = useState<string | null>(null)
  const [ownerEmail,setOwnerEmail] = useState<string | null>(null)

  const updateTurn = useChatStore((s) => s.updateTurn)
  const addSources = useSourcesStore((s) => s.addSources)

  const submit = useCallback(
    async (question: string) => {
      setIsLoading(true)
      setError(null)
      setAnswer(null)
      setSources([])
      setOwner(null)
      setOwnerEmail(null)

      try {
        const data = await askQuestion(question, options?.team)

        setAnswer(data.answer)
        setSources(data.sources)
        setOwner(data.owner ?? null)
        setOwnerEmail(data.owner_email ?? null)

        addSources(data.sources)

        if (options?.turnId) {
          updateTurn(options.turnId, {
            answer:     data.answer,
            sources:    data.sources,
            status:     'success',
            owner:      data.owner      ?? null,
            ownerEmail: data.owner_email ?? null,
          })
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'An unexpected error occurred.'
        setError(msg)
        if (options?.turnId) {
          updateTurn(options.turnId, { error: msg, status: 'error' })
        }
      } finally {
        setIsLoading(false)
      }
    },
    [options?.turnId, options?.team, updateTurn, addSources],
  )

  const reset = useCallback(() => {
    setIsLoading(false)
    setError(null)
    setAnswer(null)
    setSources([])
    setOwner(null)
    setOwnerEmail(null)
  }, [])

  return {
    submit,
    isLoading,
    error,
    answer,
    sources,
    owner,
    ownerEmail,
    reset,
  }
}

// ── useHealth ──────────────────────────────────────────────────────────────────
type HealthStatus = 'ok' | 'unknown' | 'error'

export function useHealth() {
  const [status,          setStatus         ] = useState<HealthStatus>('unknown')
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(async () => {
    try {
      const data = await checkHealth()
      setStatus('ok')
      setKnowledgeBaseId(data.knowledge_base_id)
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    check()
    intervalRef.current = setInterval(check, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [check])

  return { status, knowledgeBaseId }
}
