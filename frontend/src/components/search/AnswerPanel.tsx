import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { markdownComponents } from '@/lib/markdownComponents'
import type { Source } from '@/api/types'

interface AnswerPanelProps {
  question:    string
  answer:      string
  sources:     Source[]
  onFollowUp:  (q: string) => void
  owner?:      string | null
  ownerEmail?: string | null
}

export function AnswerPanel({ question, answer, owner, ownerEmail }: AnswerPanelProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(answer)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const showOwner = owner && ownerEmail

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5"
    >
      {/* Question echo */}
      <p className="text-[14px] text-gray-500 leading-relaxed font-medium">{question}</p>
      <div className="h-px bg-gray-100" />

      {/* Answer prose */}
      <div className="relative group/answer">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {answer}
        </ReactMarkdown>
        <button
          onClick={handleCopy}
          className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-transparent group-hover/answer:border-gray-100 group-hover/answer:text-gray-400 hover:!border-gray-200 hover:!text-gray-600 hover:bg-gray-50 transition-all duration-150"
          aria-label="Copy answer"
        >
          {copied
            ? <Check className="h-3.5 w-3.5 text-emerald-500" />
            : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Owner contact card */}
      {showOwner && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 space-y-2"
        >
          <p className="text-[12px] font-semibold uppercase tracking-widest text-gray-400">
            Need additional help?
          </p>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-gray-800">
                Responsible owner: <span className="text-gray-900">{owner}</span>
              </p>
              <p className="text-[12px] text-gray-500">Email: {ownerEmail}</p>
            </div>
            <a
              href={`mailto:${ownerEmail}`}
              className="shrink-0 inline-flex items-center h-7 px-3 rounded-md bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-700 transition-colors"
            >
              Contact Owner
            </a>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
