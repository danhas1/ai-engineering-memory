import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquarePlus, Command } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

export function HeroSection() {
  const navigate = useNavigate()
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)

  return (
    <section className="relative flex flex-col items-center justify-center text-center px-6 pt-28 pb-24 overflow-hidden bg-white">

      {/* Soft gradient blobs — CSS only, no WebGL */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.8, ease: 'easeOut' }}
          className="absolute -top-48 -left-32 w-[700px] h-[600px] rounded-full bg-blue-100/70 blur-[110px]"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.8, ease: 'easeOut', delay: 0.15 }}
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[500px] rounded-full bg-violet-100/50 blur-[130px]"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.8, ease: 'easeOut', delay: 0.3 }}
          className="absolute -top-40 -right-24 w-[550px] h-[550px] rounded-full bg-indigo-100/40 blur-[100px]"
        />
      </div>

      {/* Content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-2xl mx-auto"
      >
        {/* Eyebrow */}
        <motion.div variants={item} className="mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1 text-[11.5px] font-medium text-gray-500 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-[pulse-dot_2s_ease-in-out_infinite]" />
            Engineering Knowledge Base
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={item}
          className="text-[44px] sm:text-[60px] font-bold tracking-[-0.04em] text-gray-900 mb-5 leading-[1.05]"
        >
          Ask anything about
          <br />
          <span className="text-gradient">your engineering history</span>
        </motion.h1>

        {/* Sub-headline */}
        <motion.p
          variants={item}
          className="text-[16px] text-gray-500 max-w-lg mx-auto mb-10 leading-[1.65]"
        >
          ADRs, incident postmortems, migrations, runbooks, and team discussions —
          searchable in natural language, answered by Claude.
        </motion.p>

        {/* CTA */}
        <motion.div
          variants={item}
          className="flex items-center justify-center mb-9"
        >
          <button
            onClick={() => navigate('/chat')}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2.5 text-[14px] font-medium text-white hover:bg-gray-800 active:bg-gray-950 transition-colors shadow-sm"
          >
            <MessageSquarePlus className="h-4 w-4" strokeWidth={2} />
            New Chat
          </button>
        </motion.div>

        {/* Keyboard hint */}
        <motion.div variants={item}>
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors group"
          >
            <kbd className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10.5px] text-gray-400 group-hover:border-gray-300 group-hover:text-gray-600 transition-colors">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
            <span>Command palette</span>
          </button>
        </motion.div>
      </motion.div>

    </section>
  )
}
