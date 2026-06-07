import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/store/uiStore'

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // ⌘K — command palette
      if (mod && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
        return
      }

      // ⌘1–2 — navigate pages
      if (mod && e.key === '1') { e.preventDefault(); navigate('/'); return }
      if (mod && e.key === '2') { e.preventDefault(); navigate('/chat'); return }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, setCommandPaletteOpen, commandPaletteOpen])
}
