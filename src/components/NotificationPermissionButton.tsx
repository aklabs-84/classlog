import { useEffect, useState } from 'react';
import { BellRing, BellOff, Bell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useAuth } from '../lib/auth';
import { subscribeToPush } from '../lib/pushSubscription';

interface Props {
  variant: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

export default function NotificationPermissionButton({ variant, onNavigate }: Props) {
  const { permission, request } = useNotificationPermission();
  const { user } = useAuth();
  const [showDeniedTip, setShowDeniedTip] = useState(false);

  // 이미 권한이 granted 상태(예: 예전에 허용한 브라우저)라면 push 구독이 없을 수 있으니 보정
  useEffect(() => {
    if (permission === 'granted' && user?.id) {
      subscribeToPush(user.id);
    }
  }, [permission, user?.id]);

  if (permission === 'unsupported') return null;

  const handleClick = async () => {
    if (permission === 'default') {
      const result = await request();
      if (result === 'granted' && user?.id) {
        await subscribeToPush(user.id);
      }
    } else if (permission === 'denied') {
      setShowDeniedTip((v) => !v);
    }
    onNavigate?.();
  };

  const label = permission === 'granted' ? '클래스 알림 ON' : permission === 'denied' ? '클래스 알림 꺼짐' : '클래스 알림 켜기';
  const Icon = permission === 'granted' ? BellRing : permission === 'denied' ? BellOff : Bell;

  if (variant === 'desktop') {
    return (
      <div className="relative hidden lg:block">
        <button
          onClick={handleClick}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border transition-all shrink-0 ${
            permission === 'granted'
              ? 'text-emerald-600 border-emerald-200 bg-emerald-50/60'
              : permission === 'denied'
                ? 'text-on-surface-variant/40 border-on-surface/10 hover:text-on-surface-variant/70'
                : 'text-primary/70 hover:text-primary hover:bg-primary/8 border-primary/20 hover:border-primary/40'
          }`}
        >
          <Icon size={13} strokeWidth={2.5} /> {label}
        </button>
        <AnimatePresence>
          {showDeniedTip && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="absolute right-0 mt-2 w-64 glass rounded-xl shadow-elevated p-3 z-50 border border-white/60 text-[11px] font-bold text-on-surface-variant/70 leading-relaxed"
              onMouseLeave={() => setShowDeniedTip(false)}
            >
              브라우저에서 알림이 차단되어 있어요. 주소창 왼쪽 자물쇠(사이트 설정) 아이콘에서 "알림"을 허용으로 바꿔주세요.
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-black text-sm border transition-all ${
        permission === 'granted'
          ? 'text-emerald-600 border-emerald-200 bg-emerald-50/60'
          : permission === 'denied'
            ? 'text-on-surface-variant/50 border-on-surface/10'
            : 'text-primary/80 border-primary/20 hover:bg-primary/5'
      }`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
