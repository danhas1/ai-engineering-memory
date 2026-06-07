import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useSourcesStore } from '@/store/sourcesStore'
import { SourcesGrid } from '@/components/sources/SourcesGrid'
import { SourcesFilterBar } from '@/components/sources/SourcesFilterBar'
import type { DocType } from '@/api/types'

export default function SourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeFilter, setFilter, availableTypes, filteredSources } = useSourcesStore()
  const count = filteredSources().length

  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam) {
      const types = availableTypes()
      if (types.includes(typeParam as DocType | 'ALL')) {
        setFilter(typeParam as DocType | 'ALL')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (activeFilter === 'ALL') {
      next.delete('type')
    } else {
      next.set('type', activeFilter)
    }
    setSearchParams(next, { replace: true })
  }, [activeFilter, searchParams, setSearchParams])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-5 py-8 space-y-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-end justify-between"
        >
          <div className="space-y-1">
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Sources</h1>
            <p className="text-[13.5px] text-gray-500">
              Documents retrieved across all queries
            </p>
          </div>
          {count > 0 && (
            <span className="text-[12px] font-mono text-gray-400 pb-0.5">
              {count} document{count !== 1 ? 's' : ''}
            </span>
          )}
        </motion.div>

        {/* Filter bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <SourcesFilterBar />
        </motion.div>

        {/* Grid */}
        <SourcesGrid />

      </div>
    </div>
  )
}
