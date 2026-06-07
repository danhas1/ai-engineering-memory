import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TypingIndicator } from './TypingIndicator'
import { ErrorBanner }     from '@/components/search/ErrorBanner'
import { markdownComponents } from '@/lib/markdownComponents'
import type { ChatTurn as ChatTurnType } from '@/store/chatStore'

interface ChatTurnProps {
  turn: ChatTurnType
}

export function ChatTurn({ turn }: ChatTurnProps) {
  const showOwner = turn.owner && turn.ownerEmail

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-4"
    >
      {/* User message */}
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-blue-50 border border-blue-100 px-4 py-3 text-[14px] text-gray-800 leading-relaxed">
          {turn.question}
        </div>
      </div>

      {/* AI response */}
      <div className="space-y-3">
        {turn.status === 'pending' && (
          <div className="flex items-center gap-3 py-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0">
              <span className="text-[10px] text-white">✦</span>
            </div>
            <TypingIndicator />
          </div>
        )}

        {turn.status === 'error' && turn.error && (
          <ErrorBanner message={turn.error} onDismiss={() => {}} />
        )}

        {turn.status === 'success' && turn.answer && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {/* AI label */}
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0">
                <span className="text-[10px] text-white">✦</span>
              </div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Memory
              </span>
            </div>

            {/* Answer prose */}
            <div className="pl-8 text-[14px] text-gray-700 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {turn.answer}
              </ReactMarkdown>
            </div>

            {/* Owner contact card */}
            {showOwner && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 }}
                className="pl-8"
              >
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                    Need additional help?
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-medium text-gray-800">
                        Responsible owner: <span className="text-gray-900">{turn.owner}</span>
                      </p>
                      <p className="text-[12px] text-gray-500">Email: {turn.ownerEmail}</p>
                    </div>
                    <a
                      href={`mailto:${turn.ownerEmail}`}
                      className="shrink-0 inline-flex items-center h-7 px-3 rounded-md bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-700 transition-colors"
                    >
                      Contact Owner
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
