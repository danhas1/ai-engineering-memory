import { motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

interface ErrorBannerProps {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3.5"
    >
      <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" strokeWidth={2} />
      <p className="flex-1 text-[13.5px] text-red-700 leading-relaxed">{message}</p>
      <button
        onClick={onDismiss}
        className="h-5 w-5 flex items-center justify-center rounded-md text-red-300 hover:text-red-500 hover:bg-red-100 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </motion.div>
  )
}
