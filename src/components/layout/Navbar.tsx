import { useState, useEffect } from 'react';
import {
  Bell, Trash2, Plus, GraduationCap, Menu, X,
  LayoutDashboard, School, Wrench, Sparkles, FileBarChart2, Archive,
  Bug, Images, Download, Share, MoreVertical, Gift, Lightbulb,
  ChevronLeft, ChevronRight, Minus, Bot, Zap, BookOpen,
} from 'lucide-react';
import BugReportModal from '../BugReportModal';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth, getAiUsageStatus } from '../../lib/auth';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useFontScale } from '../../hooks/useFontScale';
import NotificationPermissionButton from '../NotificationPermissionButton';

interface NavbarProps {
  isCollapsed: boolean;
  toggleSidebar: () => void;
}

const Navbar = ({ isCollapsed, toggleSidebar }: NavbarProps) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const hasByokKey = typeof window !== 'undefined' && !!localStorage.getItem('gemini_api_key');
  const aiUsage = hasByokKey ? null : getAiUsageStatus(profile);
  const aiUsageBarColor =
    aiUsage?.kind === 'count'
      ? (aiUsage.percent >= 100 ? 'bg-error' : aiUsage.percent >= 80 ? 'bg-amber-400' : 'bg-primary')
      : aiUsage?.kind === 'credit'
      ? (aiUsage.state === 'critical' ? 'bg-error' : aiUsage.state === 'saving' ? 'bg-amber-400' : 'bg-primary')
      : 'bg-primary';
  const aiUsageRightLabel =
    aiUsage?.kind === 'count' ? `${aiUsage.used} / ${aiUsage.limit}` : aiUsage?.kind === 'credit' ? `${aiUsage.percent}%` : '';
  const aiUsageSubLabel =
    aiUsage?.kind === 'count'
      ? (aiUsage.percent >= 100 ? '이번 달 AI 사용량을 모두 썼어요' : '매월 1일 자동 초기화')
      : aiUsage?.kind === 'credit'
      ? (aiUsage.state === 'critical' ? '한도에 가까워지고 있어요' : aiUsage.state === 'saving' ? '절약 모드(Flash)로 자동 전환됨' : '이번 달 AI 정상 속도로 사용 중')
      : '';
  const { installState, triggerInstall } = usePWAInstall();
  const { scale: fontScale, canDecrease: canDecreaseFont, canIncrease: canIncreaseFont, decrease: decreaseFont, increase: increaseFont } = useFontScale();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [showNavIOSGuide, setShowNavIOSGuide] = useState(false);

  // PWA로 이미 실행 중이거나 설치 완료된 경우에만 숨김
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
  const showInstallBtn = !isStandalone && installState !== 'installed';

  const handleNavInstall = () => {
    if (installState === 'available') triggerInstall();
    else setShowNavIOSGuide(true); // iOS 또는 기타 브라우저: 가이드 표시
  };

  useEffect(() => {
    setAvatarError(false);
  }, [profile?.avatar_url]);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const subscription = supabase
        .channel('public:notifications')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
          fetchNotifications();
        })
        .subscribe();
      return () => { supabase.removeChannel(subscription); };
    }
  }, [user]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(10);
    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    }
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleNotificationClick = (n: any) => { markAsRead(n.id); setShowNotifications(false); };

  const handleNotificationNavigate = (n: any, e: React.MouseEvent, dest: string) => {
    e.preventDefault();
    markAsRead(n.id);
    setShowNotifications(false);
    try {
      const url = new URL(dest, window.location.origin);
      const classId = url.searchParams.get('id');
      const studentId = url.searchParams.get('student_id');
      if (classId && studentId) {
        sessionStorage.setItem('notif_open_student', JSON.stringify({ studentId, classId }));
        const currentParams = new URLSearchParams(window.location.search);
        const isAlreadyOnClass = window.location.pathname === '/classroom' && currentParams.get('id') === classId;
        if (isAlreadyOnClass) { window.dispatchEvent(new CustomEvent('notif_open_student')); }
        else { navigate(`/classroom?id=${classId}`); }
      } else { navigate(dest); }
    } catch { navigate(dest); }
  };

  const clearAll = async () => {
    if (!user) return;
    const { error } = await supabase.from('notifications').delete().eq('user_id', user.id);
    if (!error) { setNotifications([]); setUnreadCount(0); setShowNotifications(false); }
  };

  const formatTime = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  };

  const navItems = [
    { label: '아이디어 기록', path: '/dashboard', icon: Lightbulb },
    { label: 'AI 코파일럿', path: '/ai-copilot', icon: Bot },
    { label: '학급 관리', path: '/classes', icon: LayoutDashboard },
    { label: '클래스룸', path: '/classroom', icon: School },
    { label: '수업 도구', path: '/teaching-tools', icon: Wrench },
    { label: '갤러리', path: '/gallery', icon: Images },
    { label: 'AI 세특 초안', path: '/ai-assistant', icon: Sparkles },
    { label: '보고서', path: '/export', icon: FileBarChart2 },
    { label: '아카이브', path: '/archive', icon: Archive },
    { label: '활용 가이드', path: '/stories', icon: BookOpen },
  ];

  const renderNotificationsList = () => (
    <>
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="font-black text-sm tracking-tightest">최근 시스템 알림</h3>
        {notifications.length > 0 && (
          <button onClick={clearAll} className="text-[10px] text-primary hover:text-secondary flex items-center gap-1.5 font-black uppercase tracking-widest transition-colors">
            <Trash2 size={12} /> Clear All
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
        {notifications.length > 0 ? notifications.map((n) => {
          const dest: string | null = n.link ||
            ((n.type === 'student_submission' || n.type === 'result_submission') ? '/classroom' : null);
          const isAiReview = n.type === 'ai_review_needed';
          const baseClass = `p-4 rounded-xl transition-all border block ${
            n.is_read
              ? 'bg-surface-container/30 border-transparent opacity-60'
              : isAiReview
                ? `bg-amber-50 border-amber-200 shadow-soft hover:border-amber-300 hover:scale-[1.01] ${dest ? 'cursor-pointer' : 'cursor-default'}`
                : `bg-white border-primary/5 shadow-soft hover:border-primary/20 hover:scale-[1.01] ${dest ? 'cursor-pointer' : 'cursor-default'}`
          }`;
          return (
            <button key={n.id} className={`w-full text-left ${baseClass}`}
              onClick={(e) => dest ? handleNotificationNavigate(n, e, dest) : handleNotificationClick(n)}
            >
              <div className="flex items-start justify-between gap-3">
                <p className={`text-sm tracking-tight leading-snug ${n.is_read ? 'font-medium' : 'font-black text-on-surface'}`}>{n.title}</p>
                {!n.is_read && <div className="w-2 h-2 bg-primary rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" />}
              </div>
              {n.content && <p className="text-[11px] font-medium text-on-surface-variant/60 mt-1 leading-snug line-clamp-1">{n.content}</p>}
              <div className="flex items-center justify-between mt-2">
                <p className="text-[9px] font-black text-primary/40 uppercase tracking-[0.2em]">{formatTime(n.created_at)}</p>
                {dest && !n.is_read && <span className="text-[9px] font-black text-primary/50 uppercase tracking-widest">바로가기 →</span>}
              </div>
            </button>
          );
        }) : (
          <div className="py-10 text-center space-y-3">
            <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto opacity-40">
              <Bell size={28} className="text-primary" />
            </div>
            <p className="text-xs font-black text-on-surface-variant/40 uppercase tracking-widest">알림 없음</p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
    {/* ───────────────── 데스크톱: 왼쪽 세로 사이드바 ───────────────── */}
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 260 }}
      className="hidden lg:flex h-[calc(100vh-32px)] m-4 glass flex-col p-4 fixed left-0 top-0 z-[60] shadow-soft rounded-3xl border border-white/40"
    >
      {/* 로고 */}
      <div className={`flex items-center gap-3 mb-6 px-1 shrink-0 ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-primary/20">
          <GraduationCap size={20} strokeWidth={2.5} />
        </div>
        {!isCollapsed && (
          <motion.h1 initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            className="text-base font-black leading-tight tracking-tightest gradient-text"
          >
            클래스로그
          </motion.h1>
        )}
      </div>

      {/* 주 액션 */}
      <NavLink
        to="/activity-log"
        title={isCollapsed ? '교사 메모' : ''}
        className={({ isActive }) => `
          flex items-center justify-center gap-2 btn-gradient rounded-xl mb-6 shadow-md shadow-primary/20 active:scale-95 transition-all py-3 shrink-0
          ${isCollapsed ? 'px-0' : 'px-4'}
          ${isActive ? 'ring-2 ring-primary/20' : ''}
        `}
      >
        <Plus size={18} strokeWidth={3} />
        {!isCollapsed && <span className="font-black text-xs tracking-tight">교사 메모</span>}
      </NavLink>

      {/* 메뉴 */}
      <nav className="flex-1 flex flex-col gap-1 overflow-y-auto overflow-x-hidden custom-scrollbar min-h-0">
        {navItems.map((tab) => (
          <NavLink key={tab.path} to={tab.path} end={tab.path === '/'}
            title={isCollapsed ? tab.label : ''}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-black transition-all relative group shrink-0
              ${isActive ? 'text-primary bg-primary/5' : 'text-on-surface-variant/60 hover:text-on-surface hover:bg-white/60'}
              ${isCollapsed ? 'justify-center' : ''}
            `}
          >
            {({ isActive }) => (
              <>
                <tab.icon size={18} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                {!isCollapsed && tab.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* AI 사용량 위젯 — 무제한(admin/베타/BYOK)이면 숨김 */}
      {aiUsage && (
        isCollapsed ? (
          <div className="shrink-0 relative group flex justify-center mb-1">
            <div className="w-9 h-9 rounded-xl bg-surface-container-low/50 border border-on-surface/5 flex items-center justify-center relative overflow-hidden">
              <div
                className={`absolute bottom-0 left-0 right-0 ${aiUsageBarColor} opacity-25 transition-all`}
                style={{ height: `${Math.min(aiUsage.percent, 100)}%` }}
              />
              <Zap size={14} className="text-on-surface-variant/60 relative" />
            </div>
            <div className="absolute left-full ml-3 px-3 py-1.5 bg-on-surface text-surface text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all whitespace-nowrap z-50 shadow-xl">
              AI 사용량 {aiUsageRightLabel} · {aiUsageSubLabel}
            </div>
          </div>
        ) : (
          <div className="shrink-0 p-2.5 mb-1 rounded-xl bg-surface-container-low/50 border border-on-surface/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black uppercase tracking-wide text-on-surface-variant/50 flex items-center gap-1">
                <Zap size={10} /> AI 사용량
              </span>
              <span className="text-[10px] font-black text-on-surface">{aiUsageRightLabel}</span>
            </div>
            <div className="h-1.5 bg-on-surface/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${aiUsageBarColor}`}
                style={{ width: `${Math.min(aiUsage.percent, 100)}%` }}
              />
            </div>
            <p className="text-[9px] text-on-surface-variant/60 mt-1">{aiUsageSubLabel}</p>
          </div>
        )
      )}

      {/* 알림 켜기 (클래스 알림) */}
      <div className={`shrink-0 pt-3 mt-1 border-t border-on-surface/5 ${isCollapsed ? 'hidden' : ''}`}>
        <NotificationPermissionButton variant="desktop" />
      </div>

      {/* 글자 크기 조절 (펼침 상태 전용 — 접힘 상태는 아래 아이콘 묶음에 통합) */}
      {!isCollapsed && (
        <div className="shrink-0 flex items-center justify-center gap-0.5 p-0.5 mt-3 mb-2 rounded-xl bg-surface-container-low/50 border border-on-surface/5">
          <button
            onClick={decreaseFont}
            disabled={!canDecreaseFont}
            title="글자 작게"
            className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/50 hover:text-primary disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center"
          >
            <Minus size={14} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] font-black text-on-surface-variant/40 tabular-nums w-8 text-center select-none">{fontScale}%</span>
          <button
            onClick={increaseFont}
            disabled={!canIncreaseFont}
            title="글자 크게"
            className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/50 hover:text-primary disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center"
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* 아이콘 액션 묶음 */}
      <div className={`shrink-0 flex items-center gap-1 flex-wrap ${isCollapsed ? 'flex-col pt-3 mt-1 border-t border-on-surface/5' : 'justify-center pt-2'}`}>
        {isCollapsed && (
          <>
            <button onClick={decreaseFont} disabled={!canDecreaseFont} title="글자 작게"
              className="w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/40 hover:text-primary disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center"
            >
              <Minus size={16} strokeWidth={2.5} />
            </button>
            <button onClick={increaseFont} disabled={!canIncreaseFont} title="글자 크게"
              className="w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/40 hover:text-primary disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </>
        )}
        {showInstallBtn && (
          <button onClick={handleNavInstall} title="앱 설치"
            className="w-9 h-9 rounded-xl hover:bg-primary/8 transition-all text-primary/60 hover:text-primary flex items-center justify-center"
          >
            <Download size={16} strokeWidth={2.5} />
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="알림"
            className={`w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all relative flex items-center justify-center ${showNotifications ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/40'}`}
          >
            <Bell size={17} className={showNotifications ? 'animate-bounce' : ''} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full border-2 border-white shadow-sm animate-pulse" />
            )}
          </button>
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute left-full bottom-0 ml-3 w-[min(320px,calc(100vw-2rem))] glass rounded-2xl shadow-elevated p-5 z-50 overflow-hidden border border-white/60"
              >
                {renderNotificationsList()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isCollapsed ? (
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="더보기"
              className={`w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all flex items-center justify-center ${showMoreMenu ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/40'}`}
            >
              <MoreVertical size={17} />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-full bottom-0 ml-3 w-44 glass rounded-2xl shadow-elevated p-1.5 z-50 border border-white/60"
                >
                  <button
                    onClick={() => { setBugReportOpen(true); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-all text-on-surface-variant/70 hover:text-red-400 text-[13px] font-black"
                  >
                    <Bug size={15} /> 버그 신고
                  </button>
                  <NavLink
                    to="/settings#referral"
                    onClick={() => setShowMoreMenu(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-emerald-50 transition-all text-on-surface-variant/70 hover:text-emerald-500 text-[13px] font-black"
                  >
                    <Gift size={15} /> 친구 초대
                  </NavLink>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <button
              onClick={() => setBugReportOpen(true)}
              title="버그 신고"
              className="w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/40 hover:text-red-400 flex items-center justify-center"
            >
              <Bug size={17} />
            </button>
            <NavLink
              to="/settings#referral"
              title="친구 초대"
              className="w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/40 hover:text-emerald-500 flex items-center justify-center"
            >
              <Gift size={17} />
            </NavLink>
          </>
        )}
      </div>

      {/* 아바타 (클릭 시 설정으로 이동) */}
      <NavLink to="/settings"
        className="shrink-0 flex items-center gap-2 pt-3 mt-2 border-t border-on-surface/5 hover:bg-white hover:shadow-soft transition-all p-2 rounded-xl group active:scale-95"
      >
        <div className="w-8 h-8 rounded-xl overflow-hidden cursor-pointer group-hover:ring-2 group-hover:ring-primary/10 transition-all border border-white shadow-soft shrink-0">
          {profile?.avatar_url && !avatarError ? (
            <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" onError={() => setAvatarError(true)} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="text-white text-xs font-black">{(profile?.full_name || '?').charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] group-hover:text-secondary transition-colors leading-none mb-0.5">
              {profile?.role || 'Teacher'}
            </p>
            <p className="text-[12px] font-black group-hover:text-primary transition-colors tracking-tightest truncate">
              {profile?.full_name || '사용자'}
            </p>
          </div>
        )}
      </NavLink>

      {/* 접기/펼치기 */}
      <button
        onClick={toggleSidebar}
        className={`shrink-0 w-full flex items-center gap-3 px-3 py-3 mt-2 rounded-xl transition-all group shadow-sm border ${
          isCollapsed
            ? 'bg-primary/10 text-primary border-primary/20 justify-center'
            : 'bg-surface-container-low/50 text-on-surface-variant hover:text-primary border-transparent'
        }`}
      >
        {isCollapsed ? (
          <ChevronRight size={20} strokeWidth={3} className="text-primary" />
        ) : (
          <>
            <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">접기</span>
          </>
        )}
      </button>
    </motion.aside>

    {/* ───────────────── 모바일/태블릿: 상단 바 ───────────────── */}
    <header className="lg:hidden h-16 glass fixed top-0 left-0 right-0 z-50 px-4 flex items-center justify-between border-b border-white/40 shadow-soft">
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center text-white shadow-md shadow-primary/20">
          <GraduationCap size={18} strokeWidth={2.5} />
        </div>
        <h2 className="text-base font-black tracking-tightest leading-none gradient-text">클래스로그</h2>
      </div>

      <div className="flex items-center gap-1.5">
        {/* 알림 */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setMobileMenuOpen(false); }}
            className={`w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all relative flex items-center justify-center ${showNotifications ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/40'}`}
          >
            <Bell size={18} className={showNotifications ? 'animate-bounce' : ''} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full border-2 border-white shadow-sm animate-pulse" />
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-4 w-[min(320px,calc(100vw-2rem))] glass rounded-2xl shadow-elevated p-5 z-50 overflow-hidden border border-white/60"
              >
                {renderNotificationsList()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 아바타 */}
        <NavLink to="/settings"
          className="flex items-center gap-2 pl-1.5 hover:bg-white hover:shadow-soft transition-all p-1.5 rounded-xl group active:scale-95"
        >
          <div className="w-8 h-8 rounded-xl overflow-hidden cursor-pointer group-hover:ring-2 group-hover:ring-primary/10 transition-all border border-white shadow-soft shrink-0">
            {profile?.avatar_url && !avatarError ? (
              <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" onError={() => setAvatarError(true)} />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <span className="text-white text-xs font-black">{(profile?.full_name || '?').charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
        </NavLink>

        {/* 햄버거 버튼 */}
        <button
          onClick={() => { setMobileMenuOpen(prev => !prev); setShowNotifications(false); }}
          className="relative w-9 h-9 rounded-xl hover:bg-white hover:shadow-soft transition-all flex items-center justify-center text-on-surface-variant/60"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>

    {/* 모바일 드롭다운 메뉴 */}
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          {/* 배경 딤 */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 top-16 z-30 bg-black/10"
          />

          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="lg:hidden fixed top-16 left-0 right-0 z-40 glass border-b border-white/40 shadow-elevated overflow-hidden"
          >
            {/* 사용자 정보 */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-on-surface/5">
              <div className="w-9 h-9 rounded-xl overflow-hidden border border-white shadow-soft shrink-0">
                {profile?.avatar_url && !avatarError ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <span className="text-white text-xs font-black">{(profile?.full_name || '?').charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-on-surface truncate">{profile?.full_name || '사용자'}</p>
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">{profile?.role || 'Teacher'}</p>
              </div>
            </div>

            {/* AI 사용량 위젯 — 무제한(admin/베타/BYOK)이면 숨김 */}
            {aiUsage && (
              <div className="mx-2 mt-2 p-2.5 rounded-xl bg-surface-container-low/50 border border-on-surface/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-black uppercase tracking-wide text-on-surface-variant/50 flex items-center gap-1">
                    <Zap size={10} /> AI 사용량
                  </span>
                  <span className="text-[10px] font-black text-on-surface">{aiUsageRightLabel}</span>
                </div>
                <div className="h-1.5 bg-on-surface/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${aiUsageBarColor}`}
                    style={{ width: `${Math.min(aiUsage.percent, 100)}%` }}
                  />
                </div>
                <p className="text-[9px] text-on-surface-variant/60 mt-1">{aiUsageSubLabel}</p>
              </div>
            )}

            {/* 네비 메뉴 */}
            <nav className="flex flex-col p-2 gap-0.5">
              {navItems.map((tab) => (
                <NavLink key={tab.path} to={tab.path} end={tab.path === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] font-black transition-all ${
                      isActive ? 'text-primary bg-primary/8' : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-white/60'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <tab.icon size={17} className={isActive ? 'text-primary' : 'text-on-surface-variant/40'} />
                      {tab.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* 하단 액션 */}
            <div className="border-t border-on-surface/5 p-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <NavLink
                  to="/activity-log"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 btn-gradient rounded-xl font-black text-sm flex-1 justify-center"
                >
                  <Plus size={16} /> 교사 메모 작성
                </NavLink>
                <NavLink
                  to="/settings#referral"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl font-black text-sm bg-emerald-50 hover:bg-emerald-100 transition-all text-emerald-600"
                >
                  <Gift size={16} /> 초대
                </NavLink>
                <button
                  onClick={() => { setBugReportOpen(true); setMobileMenuOpen(false); }}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl font-black text-sm bg-red-50 hover:bg-red-100 transition-all text-red-400"
                >
                  <Bug size={16} /> 버그
                </button>
              </div>
              {showInstallBtn && (
                <button
                  onClick={() => { setMobileMenuOpen(false); handleNavInstall(); }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-black text-sm border border-primary/20 text-primary/80 hover:bg-primary/5 transition-all"
                >
                  <Download size={16} /> 앱 설치하기
                </button>
              )}
              <div className="flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl bg-surface-container-low/50 border border-on-surface/5">
                <span className="text-sm font-black text-on-surface-variant/70">글자 크기</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={decreaseFont}
                    disabled={!canDecreaseFont}
                    title="글자 작게"
                    className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/50 hover:text-primary disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center"
                  >
                    <Minus size={15} strokeWidth={2.5} />
                  </button>
                  <span className="text-[11px] font-black text-on-surface-variant/40 tabular-nums w-9 text-center select-none">{fontScale}%</span>
                  <button
                    onClick={increaseFont}
                    disabled={!canIncreaseFont}
                    title="글자 크게"
                    className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-soft transition-all text-on-surface-variant/50 hover:text-primary disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center"
                  >
                    <Plus size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <NotificationPermissionButton variant="mobile" onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    <BugReportModal isOpen={bugReportOpen} onClose={() => setBugReportOpen(false)} />

    {/* iOS 앱 설치 안내 모달 (네비 버튼에서 트리거) */}
    <AnimatePresence>
      {showNavIOSGuide && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9991] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowNavIOSGuide(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-[9992] bg-white rounded-t-3xl shadow-elevated p-6 pb-10"
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-on-surface">클래스로그 앱 설치 방법</h3>
              <button
                onClick={() => setShowNavIOSGuide(false)}
                className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Share size={16} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">1단계</p>
                  <p className="text-sm text-on-surface-variant/70 mt-0.5 leading-relaxed">
                    하단 툴바의 <span className="font-black text-blue-500">공유 버튼</span>을 탭하세요
                    <br />
                    <span className="text-[11px] text-on-surface-variant/50">(사각형에 위쪽 화살표 모양)</span>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <MoreVertical size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">2단계</p>
                  <p className="text-sm text-on-surface-variant/70 mt-0.5 leading-relaxed">
                    스크롤해서 <span className="font-black text-primary">"홈 화면에 추가"</span>를 탭하세요
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-green-500 text-base font-black">✓</span>
                </div>
                <div>
                  <p className="text-sm font-black text-on-surface">3단계</p>
                  <p className="text-sm text-on-surface-variant/70 mt-0.5 leading-relaxed">
                    오른쪽 위 <span className="font-black text-green-600">"추가"</span>를 탭하면 완료!
                    <br />
                    <span className="text-[11px] text-on-surface-variant/50">홈 화면에 클래스로그 아이콘이 생깁니다</span>
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowNavIOSGuide(false)}
              className="mt-6 w-full py-3.5 btn-gradient rounded-2xl font-black text-sm shadow-md shadow-primary/20"
            >
              알겠어요!
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
};

export default Navbar;
