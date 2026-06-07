import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAsk }       from '@/api/hooks'
import { useTeamStore } from '@/store/teamStore'
import { SearchInput }  from '@/components/search/SearchInput'
import { AnswerPanel }  from '@/components/search/AnswerPanel'
import { LoadingState } from '@/components/search/LoadingState'
import { ErrorBanner }  from '@/components/search/ErrorBanner'
import { TeamSelector } from '@/components/search/TeamSelector'

export default function SearchPage() {
  const [searchParams]  = useSearchParams()
  const navigate         = useNavigate()
  const initialQ         = searchParams.get('q') ?? ''

  const [question,          setQuestion         ] = useState(initialQ)
  const [submittedQuestion, setSubmittedQuestion] = useState('')

  const { selectedTeam } = useTeamStore()

  const { submit, isLoading, error, answer, sources, reset, owner, ownerEmail } =
    useAsk({ team: selectedTeam === 'all' ? undefined : selectedTeam })

  const hasActivity = isLoading || answer !== null || error !== null

  const handleSubmit = useCallback(async (q?: string) => {
    const toSubmit = (q ?? question).trim()
    if (!toSubmit || isLoading) return
    setQuestion(toSubmit)
    setSubmittedQuestion(toSubmit)
    reset()
    navigate(`/search?q=${encodeURIComponent(toSubmit)}`, { replace: true })
    await submit(toSubmit)
  }, [question, isLoading, reset, navigate, submit])

  useEffect(() => {
    if (initialQ) {
      setSubmittedQuestion(initialQ)
      void submit(initialQ)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">

        <TeamSelector />

        <SearchInput
          value={question}
          onChange={setQuestion}
          onSubmit={() => handleSubmit()}
          isLoading={isLoading}
          autoFocus={!initialQ}
        />

        <AnimatePresence mode="wait">
          {hasActivity && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <AnimatePresence mode="wait">
                {isLoading && <LoadingState key="loading" />}
                {!isLoading && error && (
                  <ErrorBanner key="error" message={error} onDismiss={reset} />
                )}
                {!isLoading && answer && (
                  <AnswerPanel
                    key="answer"
                    question={submittedQuestion}
                    answer={answer}
                    sources={sources}
                    onFollowUp={(q) => handleSubmit(q)}
                    owner={owner}
                    ownerEmail={ownerEmail}
                  />
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
