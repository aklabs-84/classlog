import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import AnnouncementBanner from './AnnouncementBanner';
import BetaWelcomeBanner from './BetaWelcomeBanner';
import TrialEndedModal from './TrialEndedModal';
import WaitlistBanner from './WaitlistBanner';
import StoryBanner from './StoryBanner';
import FloatingTimer from '../FloatingTimer';
import FloatingAIProgress from '../FloatingAIProgress';
import ScrollToTopButton from './ScrollToTopButton';
import CopilotReturnBadge from '../CopilotReturnBadge';

const MainLayout = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-surface selection:bg-primary/20 selection:text-primary">
      <Navbar isCollapsed={isCollapsed} toggleSidebar={() => setIsCollapsed((prev) => !prev)} />
      <div
        className={`pt-16 lg:pt-0 transition-[padding] duration-300 ease-in-out ${
          isCollapsed ? 'lg:pl-[112px]' : 'lg:pl-[292px]'
        }`}
      >
        <AnnouncementBanner />
        <BetaWelcomeBanner />
        <TrialEndedModal />
        <WaitlistBanner />
        <StoryBanner />
        <main className="px-4 md:px-8 pb-12 min-h-screen relative z-0">
          <div className="max-w-[1440px] mx-auto pt-4 lg:pt-8">
            <Outlet />
          </div>
        </main>
      </div>
      <FloatingTimer />
      <FloatingAIProgress />
      <ScrollToTopButton />
      <CopilotReturnBadge />
    </div>
  );
};

export default MainLayout;
