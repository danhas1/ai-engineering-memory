import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatTurn } from './ChatTurn'
import { useChatStore } from '@/store/chatStore'

export function ChatThread() {
  const turns = useChatStore(
    (s) => s.chats.find((c) => c.id === s.activeChatId)?.turns ?? [],
  )
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length, turns[turns.length - 1]?.status])

  return (
    <ScrollArea className="flex-1">
      <div className="px-5 py-8 space-y-8 max-w-3xl mx-auto">
        {turns.map((turn) => (
          <ChatTurn key={turn.id} turn={turn} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
