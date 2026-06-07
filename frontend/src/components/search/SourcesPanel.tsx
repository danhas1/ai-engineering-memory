import { motion } from 'framer-motion'
import { SourceCard } from './SourceCard'
import type { Source } from '@/api/types'

interface SourcesPanelProps {
  sources: Source[]
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
  if (sources.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Sources
        </p>
        <span className="inline-flex items-center justify-center h-4 min-w-[1rem] rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 px-1.5">
          {sources.length}
        </span>
      </div>
      <div className="space-y-2">
        {sources.map((source, i) => (
          <SourceCard key={source.uri} source={source} index={i} />
        ))}
      </div>
    </motion.div>
  )
}
