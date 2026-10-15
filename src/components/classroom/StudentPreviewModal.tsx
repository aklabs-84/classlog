import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Smartphone, Tablet, Monitor, RefreshCw, Users, UserCog, ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface StudentPreviewModalProps {
  classId: string;
  studentId?: string;
  /** 넘기면 처음에 "어느 학생 화면을 볼까요?" 선택 화면을 먼저 보여준다 */
  students?: { id: string; name: string; number?: string | number }[];
  onClose: () => void;
}

const SESSION_KEY = 'student_session';

type DeviceKey = 'mobile' | 'tablet' | 'desktop';

const DEVICE_PRESETS: Record<DeviceKey, { label: string; icon: LucideIcon; width: number; height: string }> = {
  mobile: { label: '모바일', icon: Smartphone, width: 420, height: '88vh' },
  tablet: { label: '태블릿', icon: Tablet, width: 820, height: '85vh' },
  desktop: { label: 'PC', icon: Monitor, width: 1280, height: '85vh' },
};

const StudentPreviewModal = ({ classId, studentId, students, onClose }: StudentPreviewModalProps) => {
  const [reloadTick, setReloadTick] = useState(0);
  const [device, setDevice] = useState<DeviceKey>('mobile');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [liveOn, setLiveOn] = useState(false);
  const [liveOnline, setLiveOnline] = useState(false);
  // null = 학생 선택 화면, undefined = 선생님 계정으로 보기, 문자열 = 그 학생으로 보기
  const [pickedId, setPickedId] = useState<string | undefined | null>(
    studentId ?? (students && students.length > 0 ? null : undefined)
  );
  const previousSessionRef = useRef<string | null>(null);

  // 서버가 "이 반의 담당 선생님"임을 확인한 뒤 발급하는 학생 토큰을 임시 세션으로 심어
  // 실제 학생 화면(/student-log)을 입장번호·PIN 없이 그대로 재사용한다.
  useEffect(() => {
    let cancelled = false;
    if (pickedId === null) return;
    setReady(false);
    setError('');
    previousSessionRef.current = sessionStorage.getItem(SESSION_KEY);
    (async () => {
      const { data, error: err } = pickedId
        ? await supabase.rpc('teacher_view_student_session', { p_student_id: pickedId })
        : await supabase.rpc('teacher_student_session', { p_class_id: classId });
      const t = Array.isArray(data) ? data[0] : data;
      if (cancelled) return;
      if (err || !t?.session_token) {
        setError('미리보기를 열 수 없습니다. 이 클래스의 담당 선생님 계정인지 확인해주세요.');
        return;
      }
      // 학생 화면 상단에 학교(반) 이름·과목이 나오도록 함께 심는다
      const { data: cls } = await supabase.from('classes').select('name, subject').eq('id', classId).maybeSingle();
      if (cancelled) return;
      // 특정 학생을 볼 때는 그 학생의 실시간 통로 열쇠를 받아 따라 보기 모드로 연다 (실패하면 기존 미리보기로)
      let liveKey: string | undefined;
      if (pickedId) {
        const { data: k } = await supabase.rpc('teacher_student_live_key', { p_student_id: pickedId });
        if (typeof k === 'string') liveKey = k;
      }
      if (cancelled) return;
      setLiveOn(!!liveKey);
      setLiveOnline(false);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        preview: true,
        live_follow_key: liveKey,
        student_id: t.student_id,
        class_id: t.class_id,
        student_name: t.student_name,
        class_name: cls?.name,
        subject: cls?.subject,
        token: t.session_token,
        is_teacher: !pickedId,
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
  }, [classId, pickedId]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'student-live-status') setLiveOnline(!!e.data.online);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

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
            {pickedId === null
              ? '어느 학생 화면을 볼까요?'
              : teacherName
                ? (pickedId ? `${teacherName} 학생 화면 (확인용 · 제출/수정 금지)` : `${teacherName}(으)로 미리보기`)
                : '학생 화면 미리보기'}
          </span>

          {liveOn && pickedId && (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold shrink-0 ${liveOnline ? 'bg-primary-container text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
              <span className={`w-2 h-2 rounded-full ${liveOnline ? 'bg-primary' : 'bg-slate-400'}`} />
              {liveOnline ? '실시간으로 보는 중' : '지금은 접속 중이 아니에요'}
            </span>
          )}

          {students && students.length > 0 && pickedId !== null && !studentId && (
            <button
              onClick={() => setPickedId(null)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-black hover:bg-primary/20 transition-all shrink-0"
              title="다른 학생 화면 보기"
            >
              <Users size={14} /> 다른 학생
            </button>
          )}

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
        {pickedId === null ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <button
              onClick={() => setPickedId(undefined)}
              className="w-full flex items-center gap-3 p-4 mb-4 rounded-2xl border border-dashed border-neutral-300 hover:border-primary hover:bg-primary/5 text-left transition-all"
            >
              <UserCog size={22} className="text-primary shrink-0" />
              <span className="font-bold text-base">선생님 계정으로 보기 (학생 선택 없이)</span>
            </button>
            <p className="text-sm font-black text-on-surface-variant/70 mb-2 flex items-center gap-1.5"><ArrowLeft size={14} className="rotate-180" /> 학생을 눌러 그 학생이 보는 화면을 봐요 · {students?.length}명</p>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
              {students?.map(st => (
                <button
                  key={st.id}
                  onClick={() => setPickedId(st.id)}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-neutral-200 bg-white hover:border-primary hover:bg-primary/5 text-left transition-all active:scale-[0.98]"
                >
                  <span className="w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-black flex items-center justify-center shrink-0">{st.number && st.number !== '-' ? st.number : '·'}</span>
                  <span className="text-base font-bold truncate">{st.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : error ? (
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
