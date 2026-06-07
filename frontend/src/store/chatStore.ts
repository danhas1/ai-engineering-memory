import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Source } from '@/api/types'

export interface ChatTurn {
  id:         string
  question:   string
  answer:     string | null
  sources:    Source[]
  status:     'pending' | 'success' | 'error'
  error:      string | null
  createdAt:  number
  owner?:     string | null
  ownerEmail?: string | null
}

export interface Chat {
  id:        string
  name:      string
  createdAt: number
  turns:     ChatTurn[]
}

interface ChatStore {
  chats:        Chat[]
  activeChatId: string | null

  // Chat management
  createChat:    () => string
  setActiveChat: (id: string) => void
  renameChat:    (id: string, name: string) => void
  deleteChat:    (id: string) => void

  // Turn management (operate on active chat)
  addTurn:      (question: string) => string
  updateTurn:   (id: string, patch: Partial<ChatTurn>) => void
  clearHistory: () => void

  recentQueries: () => string[]
}

function makeChat(name = 'New Chat'): Chat {
  return { id: crypto.randomUUID(), name, createdAt: Date.now(), turns: [] }
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      chats:        [],
      activeChatId: null,

      createChat: () => {
        const chat = makeChat()
        set((s) => ({ chats: [chat, ...s.chats], activeChatId: chat.id }))
        return chat.id
      },

      setActiveChat: (id) => set({ activeChatId: id }),

      renameChat: (id, name) =>
        set((s) => ({
          chats: s.chats.map((c) => (c.id === id ? { ...c, name } : c)),
        })),

      deleteChat: (id) =>
        set((s) => {
          const remaining = s.chats.filter((c) => c.id !== id)
          const nextActive =
            s.activeChatId === id
              ? (remaining[0]?.id ?? null)
              : s.activeChatId
          return { chats: remaining, activeChatId: nextActive }
        }),

      addTurn: (question) => {
        const turnId = crypto.randomUUID()
        set((s) => {
          let { chats, activeChatId } = s

          // Auto-create a chat if none is active
          if (!activeChatId || !chats.find((c) => c.id === activeChatId)) {
            const chat = makeChat()
            activeChatId = chat.id
            chats = [chat, ...chats]
          }

          const turn: ChatTurn = {
            id: turnId,
            question,
            answer:    null,
            sources:   [],
            status:    'pending',
            error:     null,
            createdAt: Date.now(),
          }

          return {
            activeChatId,
            chats: chats.map((c) => {
              if (c.id !== activeChatId) return c
              // Auto-name the chat from the first question
              const name = c.turns.length === 0
                ? question.slice(0, 48) + (question.length > 48 ? '…' : '')
                : c.name
              return { ...c, name, turns: [...c.turns, turn] }
            }),
          }
        })
        return turnId
      },

      updateTurn: (id, patch) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === s.activeChatId
              ? { ...c, turns: c.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)) }
              : c,
          ),
        })),

      clearHistory: () =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === s.activeChatId ? { ...c, turns: [] } : c,
          ),
        })),

      recentQueries: () => {
        const { chats } = get()
        const allTurns = chats
          .flatMap((c) => c.turns)
          .filter((t) => t.status === 'success')
          .sort((a, b) => b.createdAt - a.createdAt)
        const seen = new Set<string>()
        const result: string[] = []
        for (const t of allTurns) {
          if (!seen.has(t.question)) {
            seen.add(t.question)
            result.push(t.question)
            if (result.length >= 5) break
          }
        }
        return result
      },
    }),
    { name: 'eng-memory-chats' },
  ),
)
