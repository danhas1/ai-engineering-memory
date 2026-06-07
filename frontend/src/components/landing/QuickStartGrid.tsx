import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DOC_TYPE_CONFIG } from '@/lib/docTypeConfig'
import { cn } from '@/lib/utils'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.2 } },
}
const card = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

export function DocTypesSection() {
  const navigate = useNavigate()
  const configs = Object.values(DOC_TYPE_CONFIG).filter((c) => c.type !== 'DOC')

  return (
    <section className="px-6 pb-16 max-w-4xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="mb-5"
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Document types
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {configs.map((config) => {
          const Icon = config.icon
          return (
            <motion.button
              key={config.type}
              variants={card}
              whileHover={{ y: -2, transition: { duration: 0.15 } }}
              onClick={() => navigate(`/sources?type=${config.type}`)}
              className="group relative w-full text-left rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 overflow-hidden"
            >
              {/* Top accent */}
              <div className={cn('absolute top-0 left-0 right-0 h-0.5', config.cardAccentClass)} />

              <div className="flex items-start justify-between mb-3">
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', config.iconBgClass)}>
                  <Icon className={cn('h-4 w-4', config.iconColorClass)} strokeWidth={1.75} />
                </div>
                <span className={cn(
                  'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                  config.badgeClasses,
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
        })}
      </motion.div>
    </section>
  )
}
