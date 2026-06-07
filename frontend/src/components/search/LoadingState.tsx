import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const PHASES = [
  { label: 'Searching knowledge base…',  delay: 0    },
  { label: 'Analyzing documents…',        delay: 1800 },
  { label: 'Generating answer…',          delay: 3800 },
]

const LINES = [
  { w: '90%', delay: 0    },
  { w: '82%', delay: 0.06 },
  { w: '75%', delay: 0.12 },
  { w: '86%', delay: 0.18 },
  { w: '60%', delay: 0.24 },
]

export function LoadingState() {
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    const timers = PHASES.slice(1).map((p, i) =>
      setTimeout(() => setPhaseIndex(i + 1), p.delay),
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      {/* Progressive phase label */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-[4px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-blue-400"
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={phaseIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-[13px] text-gray-400"
          >
            {PHASES[phaseIndex].label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Answer skeleton */}
      <div className="space-y-2.5 pt-1">
        {LINES.map((line, i) => (
          <motion.div
            key={i}
            className="h-[15px] rounded-md bg-gray-100"
            style={{ width: line.w }}
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: line.delay, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </motion.div>
  )
}
