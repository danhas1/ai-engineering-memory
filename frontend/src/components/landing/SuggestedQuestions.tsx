import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

const QUESTIONS = [
  'What is the payment retry strategy?',
  'How does Redis failover work?',
  'Explain our Kubernetes autoscaling setup.',
  'Who owns the Stripe integration?',
  'What caused the November payment outage?',
  'Explain our API Gateway architecture.',
]

export function SuggestedQuestions() {
  const navigate = useNavigate()

  const ask = (q: string) =>
    navigate(`/chat?q=${encodeURIComponent(q)}`)

  return (
    <section className="px-6 pb-16 max-w-2xl mx-auto w-full">
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
        className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3"
      >
        Suggested Questions
      </motion.p>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } } }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-1.5"
      >
        {QUESTIONS.map((q) => (
          <motion.button
            key={q}
            variants={{
              hidden: { opacity: 0, y: 6 },
              show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
            }}
            onClick={() => ask(q)}
            className="group flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-4 py-2.5 text-left hover:border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <span className="text-[13px] text-gray-600 group-hover:text-gray-900 leading-snug transition-colors">
              {q}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all duration-150" />
          </motion.button>
        ))}
      </motion.div>
    </section>
  )
}
