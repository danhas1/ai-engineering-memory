import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DOC_TYPE_CONFIG, type DocTypeConfig } from '@/lib/docTypeConfig'
import { cn } from '@/lib/utils'

interface KnowledgeCardProps {
  config: DocTypeConfig
}

export function KnowledgeCard({ config }: KnowledgeCardProps) {
  const navigate = useNavigate()
  const Icon = config.icon

  return (
    <motion.button
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/sources?type=${config.type}`)}
      className="group relative w-full text-left rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden"
    >
      <div className={cn('absolute top-0 left-0 right-0 h-0.5', config.cardAccentClass)} />

      <div className="flex items-start justify-between mb-3 pt-0.5">
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          config.iconBgClass.replace('dark:bg-blue-950/60', '').replace('dark:bg-red-950/60', '').replace('dark:bg-amber-950/60', '').replace('dark:bg-green-950/60', '').replace('dark:bg-violet-950/60', '').replace('dark:bg-slate-800/60', '').replace('dark:bg-pink-950/60', '').replace('dark:bg-orange-950/60', ''),
        )}>
          <Icon className={cn(
            'h-4 w-4',
            config.iconColorClass.replace('dark:text-blue-400', '').replace('dark:text-red-400', '').replace('dark:text-amber-400', '').replace('dark:text-green-400', '').replace('dark:text-violet-400', '').replace('dark:text-slate-400', '').replace('dark:text-pink-400', '').replace('dark:text-orange-400', ''),
          )} strokeWidth={1.75} />
        </div>
        <span className={cn(
          'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold',
          config.badgeClasses.split(' ').filter(c => !c.startsWith('dark:')).join(' '),
        )}>
          {config.label}
        </span>
      </div>

      <p className="text-[13px] font-semibold text-gray-900 leading-snug mb-1">
        {config.fullLabel}
      </p>
      <p className="text-[11.5px] text-gray-400 leading-snug">
        {config.description}
      </p>
    </motion.button>
  )
}

export function KnowledgeCardsGrid() {
  const configs = Object.values(DOC_TYPE_CONFIG).filter((c) => c.type !== 'DOC')
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {configs.map((config) => (
        <KnowledgeCard key={config.type} config={config} />
      ))}
    </div>
  )
}
