import { motion } from 'framer-motion'
import { useSourcesStore } from '@/store/sourcesStore'
import { DOC_TYPE_CONFIG } from '@/lib/docTypeConfig'
import { cn } from '@/lib/utils'
import type { DocType } from '@/api/types'

export function SourcesFilterBar() {
  const { activeFilter, setFilter, availableTypes } = useSourcesStore()
  const types = availableTypes()

  if (types.length <= 1) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {types.map((type) => {
        const isActive = activeFilter === type
        const label = type === 'ALL' ? 'All' : (DOC_TYPE_CONFIG[type as DocType]?.label ?? type)

        return (
          <div key={type} className="relative">
            {isActive && (
              <motion.div
                layoutId="activeFilter"
                className="absolute inset-0 rounded-lg bg-gray-900"
                transition={{ type: 'spring', stiffness: 600, damping: 36 }}
              />
            )}
            <button
              onClick={() => setFilter(type as DocType | 'ALL')}
              className={cn(
                'relative h-7 rounded-lg px-3 font-mono text-[11px] font-semibold transition-colors duration-100',
                isActive
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
              )}
            >
              {label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
