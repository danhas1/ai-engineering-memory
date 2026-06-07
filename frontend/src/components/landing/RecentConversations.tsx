import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, ChevronRight } from 'lucide-react'
import { useChatStore } from '@/store/chatStore'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function RecentConversations() {
  const navigate      = useNavigate()
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const chats         = useChatStore((s) => s.chats)

  // Sort by most-recent activity (last turn timestamp, or chat creation if empty)
  const recent = [...chats]
    .map((c) => ({
      ...c,
      lastActivity: c.turns.length > 0
        ? c.turns[c.turns.length - 1].createdAt
        : c.createdAt,
    }))
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, 5)

  if (recent.length === 0) return null

  return (
    <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3"
      >
        Recent Conversations
      </motion.p>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="space-y-1.5"
      >
        {recent.map((chat) => (
          <motion.button
            key={chat.id}
            variants={{
              hidden: { opacity: 0, y: 6 },
              show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
            }}
            onClick={() => {
              setActiveChat(chat.id)
              navigate('/chat')
            }}
            className="group w-full flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-2.5 hover:border-gray-200 hover:bg-gray-50 transition-colors text-left"
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors" strokeWidth={1.75} />
            <span className="flex-1 min-w-0 text-[13px] text-gray-700 truncate leading-snug">
              {chat.name}
            </span>
            <span className="shrink-0 text-[11px] text-gray-400 font-mono tabular-nums">
              {relativeTime(chat.lastActivity)}
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors" strokeWidth={2} />
          </motion.button>
        ))}
      </motion.div>
    </section>
  )
}
