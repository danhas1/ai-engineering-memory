import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Search, Trash2, RefreshCw, FileX } from 'lucide-react'
import { getGaps, deleteGap } from '@/api/client'
import type { KnowledgeGap } from '@/api/types'

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
}
const row = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
}

export default function GapsPage() {
  const [gaps,      setGaps    ] = useState<KnowledgeGap[]>([])
  const [loading,   setLoading ] = useState(true)
  const [error,     setError   ] = useState<string | null>(null)
  const [deleting,  setDeleting] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getGaps()
      setGaps(res.gaps)
    } catch {
      setError('Failed to load knowledge gaps.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await deleteGap(id)
      setGaps((g) => g.filter((x) => x.id !== id))
    } catch {
      // silently ignore
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 py-8 space-y-7">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-end justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" strokeWidth={1.75} />
              </div>
              <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
                Knowledge Gaps
              </h1>
            </div>
            <p className="text-[13.5px] text-gray-500">
              Documentation topics the knowledge base couldn't fully answer — detected automatically during searches.
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 h-8 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
            Refresh
          </button>
        </motion.div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                className="h-20 rounded-xl bg-gray-100"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && gaps.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center justify-center min-h-[360px] gap-5 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
              <FileX className="h-6 w-6 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div className="space-y-1.5">
              <p className="text-[16px] font-semibold text-gray-900">No knowledge gaps detected</p>
              <p className="text-[13.5px] text-gray-500 max-w-[320px] leading-relaxed">
                Gaps are automatically recorded when searches return low-confidence answers. Start searching to build this report.
              </p>
            </div>
            <button
              onClick={() => navigate('/search')}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 transition-colors"
            >
              <Search className="h-3.5 w-3.5" strokeWidth={2} />
              Start searching
            </button>
          </motion.div>
        )}

        {/* Gap list */}
        {!loading && gaps.length > 0 && (
          <>
            <p className="text-[12px] font-mono text-gray-400">
              {gaps.length} gap{gaps.length !== 1 ? 's' : ''} detected
            </p>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-3"
            >
              <AnimatePresence>
                {gaps.map((gap) => (
                  <motion.div
                    key={gap.id}
                    variants={row}
                    exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.25 }}
                    className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      {/* Frequency badge */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 border border-amber-100">
                          <span className="text-[14px] font-bold text-amber-700">{gap.frequency}</span>
                        </div>
                        <span className="text-[9px] font-medium text-amber-600 uppercase tracking-wide">
                          {gap.frequency === 1 ? 'time' : 'times'}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-[14px] font-semibold text-gray-900 leading-snug">
                          {gap.topic}
                        </p>
                        <p className="text-[12.5px] text-gray-500 leading-snug line-clamp-2">
                          "{gap.question}"
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-400">
                            Last seen: {timeAgo(gap.last_seen)}
                          </span>
                          <button
                            onClick={() => navigate(`/search?q=${encodeURIComponent(gap.question)}`)}
                            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            Search again →
                          </button>
                        </div>
                      </div>

                      {/* Resolve button */}
                      <button
                        onClick={() => handleDelete(gap.id)}
                        disabled={deleting === gap.id}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        aria-label="Mark as resolved"
                        title="Mark as resolved"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </>
        )}

      </div>
    </div>
  )
}
