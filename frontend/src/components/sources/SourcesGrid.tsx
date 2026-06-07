import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSourcesStore } from '@/store/sourcesStore'
import { SourceCard } from '@/components/search/SourceCard'
import { Search, ArrowRight } from 'lucide-react'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

export function SourcesGrid() {
  const filteredSources = useSourcesStore((s) => s.filteredSources())
  const navigate = useNavigate()

  if (filteredSources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] text-center gap-6">
        {/* Empty state illustration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100"
        >
          <Search className="h-7 w-7 text-gray-300" strokeWidth={1.5} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-1.5"
        >
          <p className="text-[15px] font-semibold text-gray-900">No sources yet</p>
          <p className="text-[13.5px] text-gray-500 max-w-[300px] leading-relaxed">
            Sources accumulate here as you search. Every document retrieved from the knowledge base will appear in this explorer.
          </p>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => navigate('/search')}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 transition-colors"
        >
          Run a search
          <ArrowRight className="h-3.5 w-3.5" />
        </motion.button>
      </div>
    )
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {filteredSources.map((source, i) => (
        <SourceCard key={source.uri} source={source} index={i} />
      ))}
    </motion.div>
  )
}
