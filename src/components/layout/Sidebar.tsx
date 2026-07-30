import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Sparkles,
  Download,
  Archive,
  Plus,
  HelpCircle,
  GraduationCap,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Wrench,
  Images,
  Crown,
  PlayCircle,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { motion } from 'framer-motion';

interface SidebarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const Sidebar = ({ isCollapsed, toggleSidebar }: SidebarProps) => {
  const { signOut, profile } = useAuth();
  const showUpgradeBadge = profile?.plan === 'free' || profile?.plan === 'basic';

  const menuItems = [
    { icon: LayoutDashboard, label: '대시보드', path: '/dashboard' },
    { icon: Users, label: '클래스룸', path: '/classroom' },
    { icon: Wrench, label: '수업 도구', path: '/teaching-tools' },
    { icon: Images, label: '수업 갤러리', path: '/gallery' },
    { icon: PlayCircle, label: '영상 가이드', path: '/video-guide' },
    { icon: Sparkles, label: 'AI 어시스턴트', path: '/ai-assistant' },
    { icon: Download, label: '데이터 내보내기', path: '/export' },
    { icon: Archive, label: '아카이브', path: '/archive' },
  ];

  return (
    <motion.aside 
      initial={false}
      animate={{ width: isCollapsed ? 80 : 260 }}
      className="h-[calc(100vh-32px)] m-4 glass flex flex-col p-6 fixed left-0 top-0 z-60 shadow-soft rounded-3xl border border-white/40 transition-all duration-300 ease-in-out"
    >
      {/* 1. Logo Section */}
      <div className={`flex items-center gap-3 mb-8 px-1 ${isCollapsed ? 'justify-center' : ''}`}>
        <motion.div 
          layout
          className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-primary/20"
        >
          <GraduationCap size={24} strokeWidth={2.5} />
        </motion.div>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <h1 className="text-lg font-black leading-tight tracking-tightest gradient-text">클래스로그 AI</h1>
            <p className="text-[10px] text-primary font-black tracking-[0.1em] opacity-40">수업 기록부터 세특까지</p>
          </motion.div>
        )}
      </div>

      {/* 2. Primary Action */}
      <NavLink
        to="/activity-log"
        className={({ isActive }) => `
          btn-vibrant flex items-center justify-center gap-2 rounded-xl mb-8 shadow-soft active:scale-95 transition-all py-3.5
          ${isCollapsed ? 'px-0' : 'px-4'}
          ${isActive ? 'ring-2 ring-primary/20' : ''}
        `}
      >
        <Plus size={20} strokeWidth={3} />
        {!isCollapsed && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-black text-sm tracking-tight">교사 메모 작성하기</motion.span>}
      </NavLink>

      {/* 3. Navigation Menu */}
      <nav className="flex-1 flex flex-col gap-1 overflow-hidden">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={isCollapsed ? item.label : ''}
            className={({ isActive }) => `
              flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 relative group
              ${isActive 
                ? 'bg-primary/5 text-primary font-black border border-primary/10' 
                : 'text-on-surface-variant hover:bg-white hover:text-on-surface hover:shadow-soft'}
              ${isCollapsed ? 'justify-center' : ''}
              border border-transparent
            `}
          >
            {({ isActive }) => (
              <>
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                {!isCollapsed && (
                  <motion.span 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-sm tracking-tightest font-bold"
                  >
                    {item.label}
                  </motion.span>
                )}
                
                {/* Tooltip for collapsed mode */}
                {isCollapsed && (
                  <div className="absolute left-full ml-4 px-3 py-1.5 bg-on-surface text-surface text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all transform group-hover:translate-x-2 whitespace-nowrap z-50 shadow-xl">
                    {item.label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Upgrade Badge — free/basic 유저에게만 표시 */}
      {showUpgradeBadge && (
        isCollapsed ? (
          <div className="mb-3 relative group">
            <NavLink
              to="/pricing"
              className="flex items-center justify-center w-full py-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              <Crown size={18} className="text-amber-500" />
            </NavLink>
            <div className="absolute left-full ml-4 px-3 py-1.5 bg-on-surface text-surface text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all transform group-hover:translate-x-2 whitespace-nowrap z-50 shadow-xl">
              Pro로 업그레이드
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 p-3 rounded-2xl bg-amber-50 border border-amber-200"
          >
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-wide mb-0.5">현재 플랜</p>
            <p className="text-xs font-black text-amber-800 mb-2.5">
              {profile?.plan === 'free' ? 'Free (무료)' : 'Basic'}
            </p>
            <NavLink
              to="/pricing"
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm"
            >
              <Crown size={12} />
              Pro 업그레이드 보기
            </NavLink>
          </motion.div>
        )
      )}

      {/* Bottom Actions */}
      <div className="mt-auto space-y-2 pt-6 border-t border-on-surface/5">
        <NavLink
          to="/help"
          className={({ isActive }) => `
            flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300
            ${isActive 
              ? 'bg-primary/5 text-primary font-black' 
              : 'text-on-surface-variant hover:bg-white hover:text-on-surface'}
            ${isCollapsed ? 'justify-center' : ''}
          `}
        >
          <HelpCircle size={20} />
          {!isCollapsed && <span className="text-sm font-bold">고객 센터</span>}
        </NavLink>

        <button
          onClick={signOut}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-error/60 hover:text-error hover:bg-error/5 transition-all duration-300 font-bold ${isCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={20} />
          {!isCollapsed && <span className="text-sm">로그아웃</span>}
        </button>

        {/* Toggle Button moved to bottom */}
        <button
          onClick={toggleSidebar}
          className={`w-full flex items-center gap-3 px-4 py-3.5 mt-4 rounded-xl transition-all duration-500 group shadow-sm border ${
            isCollapsed 
              ? 'bg-primary/10 text-primary border-primary/20 justify-center' 
              : 'bg-surface-container-low/50 text-neutral-900 hover:text-primary border-transparent'
          }`}
        >
          {isCollapsed ? (
            <ChevronRight size={24} strokeWidth={3} className="text-primary" />
          ) : (
            <>
              <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
