import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, MessageSquare, Search, Clock, ArrowRight } from 'lucide-react'
import { useCommandPalette } from '@/hooks/useCommandPalette'
import { useChatStore } from '@/store/chatStore'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const EXAMPLE_QUERIES = [
  'Why did we migrate from ECS to EKS?',
  'What caused the November 2025 payment outage?',
  'Why was Redis chosen over Memcached?',
  'What were the postmortem action items?',
  'What is the payment-service SLO?',
  'Why did S3 costs spike in Q1 2026?',
  'What alternatives were considered before Karpenter?',
  'How to handle a payment service high-latency alert?',
]

const NAV_ITEMS = [
  { icon: Home,          label: 'Home',   to: '/',       kbd: '⌘1' },
  { icon: MessageSquare, label: 'Chat',   to: '/chat',   kbd: '⌘2' },
]

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()
  const recentQueries = useChatStore((s) => s.recentQueries())

  const runQuery = useCallback(
    (q: string) => {
      setOpen(false)
      navigate(`/search?q=${encodeURIComponent(q)}`)
    },
    [navigate, setOpen],
  )

  const goTo = useCallback(
    (to: string) => {
      setOpen(false)
      navigate(to)
    },
    [navigate, setOpen],
  )

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="p-0 max-w-[540px] overflow-hidden border-border/60 bg-popover shadow-xl shadow-black/30 [&>button]:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <Command
                className="flex flex-col"
                style={{
                  // cmdk uses inline styles — override text size globally
                  fontSize: '13px',
                }}
              >
                {/* Input */}
                <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
                  <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                  <Command.Input
                    placeholder="Search or navigate…"
                    className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  />
                  <kbd className="hidden sm:flex items-center h-5 rounded border border-border/60 bg-secondary/80 px-1.5 font-mono text-[10px] text-muted-foreground/70">
                    ESC
                  </kbd>
                </div>

                {/* Results list */}
                <Command.List className="max-h-[340px] overflow-y-auto py-1.5 px-1.5 space-y-0.5">
                  <Command.Empty className="py-10 text-center text-[13px] text-muted-foreground">
                    No results.
                  </Command.Empty>

                  {/* Navigation */}
                  <CommandGroup label="Go to">
                    {NAV_ITEMS.map(({ icon: Icon, label, to, kbd }) => (
                      <CommandItem
                        key={to}
                        value={`nav-${label}`}
                        onSelect={() => goTo(to)}
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" strokeWidth={1.5} />
                        <span className="flex-1">{label}</span>
                        <kbd className="font-mono text-[10px] text-muted-foreground/50">{kbd}</kbd>
                      </CommandItem>
                    ))}
                  </CommandGroup>

                  {/* Recent */}
                  {recentQueries.length > 0 && (
                    <CommandGroup label="Recent">
                      {recentQueries.map((q) => (
                        <CommandItem
                          key={q}
                          value={`recent-${q}`}
                          onSelect={() => runQuery(q)}
                        >
                          <Clock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" strokeWidth={1.5} />
                          <span className="flex-1 truncate text-muted-foreground">{q}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {/* Examples */}
                  <CommandGroup label="Examples">
                    {EXAMPLE_QUERIES.map((q) => (
                      <CommandItem
                        key={q}
                        value={q}
                        onSelect={() => runQuery(q)}
                      >
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
                        <span className="flex-1 truncate text-muted-foreground">{q}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command.List>

                {/* Footer */}
                <div className="flex items-center gap-3 border-t border-border px-3.5 py-2">
                  {[['↑↓', 'navigate'], ['↵', 'select'], ['ESC', 'close']].map(([k, a]) => (
                    <span key={k} className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                      <kbd className="font-mono">{k}</kbd>
                      <span>{a}</span>
                    </span>
                  ))}
                </div>
              </Command>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  )
}

function CommandGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={label}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/40"
    >
      {children}
    </Command.Group>
  )
}

function CommandItem({
  value,
  onSelect,
  children,
}: {
  value: string
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-foreground cursor-pointer outline-none transition-colors',
        'aria-selected:bg-secondary data-[selected=true]:bg-secondary',
      )}
    >
      {children}
    </Command.Item>
  )
}
