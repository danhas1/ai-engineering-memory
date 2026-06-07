import { motion } from 'framer-motion'
import { Calendar, User } from 'lucide-react'
import { DocTypeBadge } from '@/components/knowledge-cards/DocTypeBadge'
import { classifyFilename } from '@/lib/docTypeConfig'
import type { Source } from '@/api/types'

interface SourceCardProps {
  source: Source
  index?: number
}

export function SourceCard({ source, index = 0 }: SourceCardProps) {
  const docType = classifyFilename(source.filename)
  const { author, team, last_updated } = source.metadata ?? {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="flex-1 text-[11.5px] font-mono text-gray-500 truncate">
          {source.filename}
        </span>
        <DocTypeBadge docType={docType} />
      </div>

      {/* Excerpt */}
      {source.excerpt && (
        <p className="text-[12.5px] text-gray-500 leading-[1.6] line-clamp-3 mb-3">
          {source.excerpt}
        </p>
      )}

      {/* Metadata row — only if available */}
      {(author || last_updated) && (
        <div className="flex flex-wrap gap-3 pt-2.5 border-t border-gray-50">
          {author && (
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <User className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span>{team ? `${author} · ${team}` : author}</span>
            </div>
          )}
          {last_updated && (
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Calendar className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span>{last_updated}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
