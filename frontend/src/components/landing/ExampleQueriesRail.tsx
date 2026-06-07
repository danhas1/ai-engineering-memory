import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const EXAMPLES = [
  'Why did we migrate from ECS to EKS?',
  'What caused the November 2025 payment outage?',
  'Why was Redis chosen over Memcached?',
  'What were the postmortem action items?',
  'What is the payment-service SLO?',
  'Why did S3 costs spike in Q1 2026?',
  'What alternatives to Karpenter were considered?',
  'How to handle a high-latency on-call alert?',
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.35 } },
}
const row = {
  hidden: { opacity: 0, x: -8 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
}

export function ExampleQueriesRail() {
  const navigate = useNavigate()

  return (
    <section className="px-6 pb-20 max-w-4xl mx-auto w-full">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-5"
      >
        Example questions
      </motion.p>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {EXAMPLES.map((q) => (
          <motion.button
            key={q}
            variants={row}
            onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)}
            className="group flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white px-4 py-3 text-left text-[13px] text-gray-600 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 shadow-sm"
          >
            <span className="leading-snug">{q}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all duration-150" />
          </motion.button>
        ))}
      </motion.div>
    </section>
  )
}
