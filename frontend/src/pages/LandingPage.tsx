import { HeroSection }          from '@/components/landing/HeroSection'
import { RecentConversations }  from '@/components/landing/RecentConversations'
import { SuggestedQuestions }   from '@/components/landing/SuggestedQuestions'
import { Footer }               from '@/components/layout/Footer'

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <RecentConversations />
      <SuggestedQuestions />
      <Footer />
    </div>
  )
}
