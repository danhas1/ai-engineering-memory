import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell }      from '@/components/layout/AppShell'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { Toaster }       from '@/components/ui/toaster'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import LandingPage from '@/pages/LandingPage'
import SearchPage  from '@/pages/SearchPage'
import ChatPage    from '@/pages/ChatPage'

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="contents"
      >
        <Routes location={location}>
          <Route element={<AppShell />}>
            <Route path="/"       element={<LandingPage />} />
            <Route path="/search" element={<SearchPage />}  />
            <Route path="/chat"   element={<ChatPage />}    />
          </Route>
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function AppInner() {
  useKeyboardShortcuts()
  return (
    <>
      <AnimatedRoutes />
      <CommandPalette />
      <Toaster />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}
