import { useCallback, useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Pencil, Check, X, MessageSquare, BookOpen, ArrowRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput }  from '@/components/chat/ChatInput'
import { useChatStore }    from '@/store/chatStore'
import { useSourcesStore } from '@/store/sourcesStore'
import { useTeamStore }    from '@/store/teamStore'
import { TeamSelector }    from '@/components/search/TeamSelector'
import { askQuestion }     from '@/api/client'
import { ApiError }        from '@/api/types'
import { cn } from '@/lib/utils'

const EXAMPLE_PROMPTS = [
  'Why did we migrate from ECS to EKS?',
  'What caused the November 2025 payment outage?',
  'What is the payment-service SLO?',
  'Why was Redis chosen over Memcached?',
  'How does the fraud detection pipeline work?',
  'What are the on-call escalation steps?',
]

// ── Chat sidebar ──────────────────────────────────────────────────────────────
function ChatSidebar() {
  const chats        = useChatStore((s) => s.chats)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const createChat   = useChatStore((s) => s.createChat)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const renameChat   = useChatStore((s) => s.renameChat)
  const deleteChat   = useChatStore((s) => s.deleteChat)

  const [editingId,  setEditingId ] = useState<string | null>(null)
  const [editValue,  setEditValue ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditValue(name)
    setTimeout(() => inputRef.current?.select(), 30)
  }

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      renameChat(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  return (
    <div className="w-56 shrink-0 flex flex-col border-r border-gray-100 bg-gray-50/50 overflow-hidden">
      {/* New chat button */}
      <div className="p-2.5 shrink-0">
        <button
          onClick={createChat}
          className="w-full flex items-center gap-2 h-8 px-3 rounded-lg text-[12.5px] font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          New Chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
        {chats.length === 0 ? (
          <p className="px-2 py-4 text-[11.5px] text-gray-400 text-center leading-relaxed">
            No chats yet.<br />Click New Chat to start.
          </p>
        ) : (
          chats.map((chat) => {
            const isActive  = chat.id === activeChatId
            const isEditing = chat.id === editingId
            return (
              <div
                key={chat.id}
                onClick={() => !isEditing && setActiveChat(chat.id)}
                className={cn(
                  'group relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
                  isActive
                    ? 'bg-white border border-gray-200 shadow-sm text-gray-900'
                    : 'text-gray-600 hover:bg-white hover:border hover:border-gray-100 hover:shadow-sm border border-transparent',
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-400" strokeWidth={1.75} />

                {isEditing ? (
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')  commitEdit()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      onBlur={commitEdit}
                      className="flex-1 min-w-0 bg-transparent text-[12px] text-gray-900 outline-none border-b border-blue-400"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); commitEdit() }}
                      className="shrink-0 text-emerald-600 hover:text-emerald-700">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); cancelEdit() }}
                      className="shrink-0 text-gray-400 hover:text-gray-600">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 min-w-0 text-[12px] leading-snug truncate">
                      {chat.name}
                    </span>
                    {/* Action buttons — visible on hover/active */}
                    <div className={cn(
                      'flex items-center gap-0.5 shrink-0',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}>
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(chat.id, chat.name) }}
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        aria-label="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Premium empty state ───────────────────────────────────────────────────────
interface EmptyStateProps {
  onPrompt: (q: string) => void
}

function EmptyState({ onPrompt }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 select-none">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md space-y-8 text-center"
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-200">
            <BookOpen className="h-6 w-6 text-white" strokeWidth={1.75} />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-[20px] font-semibold text-gray-900 tracking-tight">
            Engineering Memory Assistant
          </h2>
          <p className="text-[13.5px] text-gray-500 leading-relaxed max-w-[340px] mx-auto">
            Instant answers from your team's architecture decisions, incident reports, runbooks, and more.
          </p>
        </div>

        {/* Example prompts grid */}
        <div className="grid grid-cols-1 gap-2 text-left">
          {EXAMPLE_PROMPTS.map((q) => (
            <motion.button
              key={q}
              onClick={() => onPrompt(q)}
              whileHover={{ x: 2 }}
              transition={{ duration: 0.12 }}
              className="group flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-600 hover:border-blue-100 hover:bg-blue-50/40 hover:text-gray-900 transition-colors shadow-sm"
            >
              <span className="text-left leading-snug">{q}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors" />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ── ChatPage ──────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [searchParams] = useSearchParams()
  const addTurn      = useChatStore((s) => s.addTurn)
  const updateTurn   = useChatStore((s) => s.updateTurn)
  const clearHistory = useChatStore((s) => s.clearHistory)
  const turns        = useChatStore(
    (s) => s.chats.find((c) => c.id === s.activeChatId)?.turns ?? [],
  )
  const addSources   = useSourcesStore((s) => s.addSources)
  const { selectedTeam } = useTeamStore()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = useCallback(
    async (question: string) => {
      setIsLoading(true)
      const id   = addTurn(question)
      const team = selectedTeam !== 'all' ? selectedTeam : undefined
      try {
        const data = await askQuestion(question, team)
        updateTurn(id, {
          answer:     data.answer,
          sources:    data.sources,
          status:     'success',
          owner:      data.owner      ?? null,
          ownerEmail: data.owner_email ?? null,
        })
        addSources(data.sources)
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'An unexpected error occurred.'
        updateTurn(id, { error: msg, status: 'error' })
      } finally {
        setIsLoading(false)
      }
    },
    [addTurn, updateTurn, addSources, selectedTeam],
  )

  // Auto-submit a question passed via ?q= (e.g. from landing page suggestions)
  useEffect(() => {
    const q = searchParams.get('q')?.trim()
    if (q) void handleSubmit(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <TooltipProvider>
      <div className="flex h-full overflow-hidden">
        {/* Sidebar */}
        <ChatSidebar />

        {/* Main area */}
        <div className="flex flex-col flex-1 min-w-0 bg-white">
          {/* Header bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0 gap-4">
            <TeamSelector className="flex-1" />
            <AnimatePresence>
              {turns.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={clearHistory}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
                        aria-label="Clear history"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">Clear chat</TooltipContent>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Thread or empty state */}
          {turns.length === 0 ? (
            <EmptyState onPrompt={handleSubmit} />
          ) : (
            <ChatThread />
          )}

          <ChatInput onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
      </div>
    </TooltipProvider>
  )
}
