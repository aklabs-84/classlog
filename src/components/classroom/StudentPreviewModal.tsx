import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Smartphone, Tablet, Monitor, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface StudentPreviewModalProps {
  classId: string;
  onClose: () => void;
}

const SESSION_KEY = 'student_session';

type DeviceKey = 'mobile' | 'tablet' | 'desktop';

const DEVICE_PRESETS: Record<DeviceKey, { label: string; icon: LucideIcon; width: number; height: string }> = {
  mobile: { label: '모바일', icon: Smartphone, width: 420, height: '88vh' },
  tablet: { label: '태블릿', icon: Tablet, width: 820, height: '85vh' },
  desktop: { label: 'PC', icon: Monitor, width: 1280, height: '85vh' },
};

const StudentPreviewModal = ({ classId, onClose }: StudentPreviewModalProps) => {
  const [reloadTick, setReloadTick] = useState(0);
  const [device, setDevice] = useState<DeviceKey>('mobile');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const previousSessionRef = useRef<string | null>(null);

  // 서버가 "이 반의 담당 선생님"임을 확인한 뒤 발급하는 학생 토큰을 임시 세션으로 심어
  // 실제 학생 화면(/student-log)을 입장번호·PIN 없이 그대로 재사용한다.
  useEffect(() => {
    let cancelled = false;
    previousSessionRef.current = sessionStorage.getItem(SESSION_KEY);
    (async () => {
      const { data, error: err } = await supabase.rpc('teacher_student_session', { p_class_id: classId });
      const t = Array.isArray(data) ? data[0] : data;
      if (cancelled) return;
      if (err || !t?.session_token) {
        setError('미리보기를 열 수 없습니다. 이 클래스의 담당 선생님 계정인지 확인해주세요.');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        student_id: t.student_id,
        class_id: t.class_id,
        student_name: t.student_name,
        token: t.session_token,
      }));
      setTeacherName(t.student_name);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (previousSessionRef.current) {
        sessionStorage.setItem(SESSION_KEY, previousSessionRef.current);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    };
  }, [classId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const preset = DEVICE_PRESETS[device];

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-8 bg-on-surface/50 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ width: preset.width, maxWidth: '95vw', height: preset.height }}
        className="flex flex-col bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden transition-[width] duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 bg-surface-container-low/40 shrink-0">
          <span className="flex-1 min-w-0 text-sm font-bold truncate">
            {teacherName ? `${teacherName}(으)로 미리보기` : '학생 화면 미리보기'}
          </span>

          <div className="flex items-center gap-0.5 p-0.5 bg-surface-container rounded-full shrink-0">
            {(Object.keys(DEVICE_PRESETS) as DeviceKey[]).map(key => {
              const Icon = DEVICE_PRESETS[key].icon;
              const active = device === key;
              return (
                <button
                  key={key}
                  onClick={() => setDevice(key)}
                  className={`p-1.5 rounded-full transition-all ${active ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant/60 hover:text-primary'}`}
                  title={DEVICE_PRESETS[key].label}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setReloadTick(t => t + 1)}
            className="p-2 rounded-full hover:bg-surface-container transition-all shrink-0"
            title="새로고침"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container transition-all shrink-0"
            title="닫기"
          >
            <X size={18} />
          </button>
        </div>
        {error ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-sm font-bold text-on-surface-variant">{error}</div>
        ) : ready ? (
          <iframe
            key={reloadTick}
            src="/student-log"
            title="학생 화면 미리보기"
            className="flex-1 w-full border-0 bg-white"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm font-bold text-on-surface-variant">불러오는 중...</div>
        )}
      </motion.div>
    </div>,
    document.body
  );
};

export default StudentPreviewModal;
