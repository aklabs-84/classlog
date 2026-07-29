import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import AnnouncementBanner from './AnnouncementBanner';
import BetaWelcomeBanner from './BetaWelcomeBanner';
import BetaEndedBanner from './BetaEndedBanner';
import FloatingTimer from '../FloatingTimer';
import FloatingAIProgress from '../FloatingAIProgress';
import ScrollToTopButton from './ScrollToTopButton';

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-surface selection:bg-primary/20 selection:text-primary">
      <Navbar />
      <div className="pt-16">
        <AnnouncementBanner />
        <BetaWelcomeBanner />
        <BetaEndedBanner />
        <main className="px-4 md:px-8 pb-12 min-h-screen relative z-0">
          <div className="max-w-[1440px] mx-auto pt-4">
            <Outlet />
          </div>
        </main>
      </div>
      <FloatingTimer />
      <FloatingAIProgress />
      <ScrollToTopButton />
    </div>
  );
};

export default MainLayout;
