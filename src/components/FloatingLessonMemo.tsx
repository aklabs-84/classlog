import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { motion, useDragControls } from 'framer-motion';
import { NotebookPen, X, Minus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// 수업 중 멘트·보충 설명을 적어 두고 어느 화면에서든 바로 꺼내 보는 떠 있는 메모장 (선생님 전용).
// 반별 메모 + 공용 메모, 글을 쓰면 자동 저장(서버 lesson_memos, 본인만 열람).
// 서버 저장이 안 될 때를 대비해 이 기기에도 임시본을 같이 남긴다.

type Scope = 'class' | 'common';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const LAST_CLASS_KEY = 'teacher_last_class_id';
const OPEN_KEY = 'lesson_memo_open';
const DOCK_KEY = 'lesson_memo_dock';
const draftKey = (uid: string, classId: string | null) => `lesson_memo_draft:${uid}:${classId ?? 'common'}`;

const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 화면은 정상 */ } };

const FloatingLessonMemo = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(() => readLS(OPEN_KEY) === '1');
  const [scope, setScope] = useState<Scope>('class');
  const [classId, setClassId] = useState<string | null>(null);
  const [className, setClassName] = useState('');
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef<{ uid: string; classId: string | null } | null>(null);
  const textRef = useRef('');
  const dirtyRef = useRef(false);
  const [dock, setDock] = useState<{ side: 'left' | 'right'; y: number }>(() => {
    const fallback = { side: 'right' as const, y: Math.round(window.innerHeight / 2) };
    try {
      const v = JSON.parse(readLS(DOCK_KEY) || 'null');
      if (v && (v.side === 'left' || v.side === 'right') && typeof v.y === 'number') return { side: v.side, y: v.y };
    } catch { /* 기본 자리 사용 */ }
    return fallback;
  });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragInfo = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);

  const clampY = (y: number) => Math.min(Math.max(y, 32), window.innerHeight - 32);

  const onTabPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragInfo.current = { sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onTabPointerMove = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    setDrag({ x: e.clientX, y: clampY(e.clientY) });
  };
  const onTabPointerUp = (e: React.PointerEvent) => {
    const d = dragInfo.current;
    dragInfo.current = null;
    if (!d) return;
    if (!d.moved) { toggle(true); return; }
    // 놓은 자리에서 가까운 쪽 벽에 붙이고, 그 자리를 기억
    const next = { side: e.clientX < window.innerWidth / 2 ? 'left' as const : 'right' as const, y: clampY(e.clientY) };
    setDrag(null);
    setDock(next);
    writeLS(DOCK_KEY, JSON.stringify(next));
  };

  // 창 크기가 바뀌어도 벽 안에 머물게
  useEffect(() => {
    const fit = () => setDock(prev => (prev.y > window.innerHeight - 32 ? { ...prev, y: clampY(prev.y) } : prev));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // 지금 보고 있는 반: 수업 화면 주소의 id → 없으면 마지막으로 연 반
  useEffect(() => {
    const fromUrl = location.pathname.startsWith('/classroom') ? new URLSearchParams(location.search).get('id') : null;
    const id = fromUrl || readLS(LAST_CLASS_KEY);
    setClassId(prev => (prev === id ? prev : id));
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!classId) { setClassName(''); return; }
    let stop = false;
    supabase.from('classes').select('name').eq('id', classId).maybeSingle()
      .then(({ data }) => { if (!stop) setClassName(data?.name ?? ''); });
    return () => { stop = true; };
  }, [classId]);

  const targetClassId = scope === 'class' ? classId : null;

  const save = useCallback(async () => {
    const t = targetRef.current;
    if (!t || !dirtyRef.current) return;
    const content = textRef.current;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      let q = supabase.from('lesson_memos').select('id').eq('teacher_id', t.uid);
      q = t.classId ? q.eq('class_id', t.classId) : q.is('class_id', null);
      const { data: row, error: selErr } = await q.maybeSingle();
      if (selErr) throw selErr;
      const now = new Date().toISOString();
      const { error } = row
        ? await supabase.from('lesson_memos').update({ content, updated_at: now }).eq('id', row.id)
        : await supabase.from('lesson_memos').insert({ teacher_id: t.uid, class_id: t.classId, content });
      if (error) throw error;
      setSaveState('saved');
    } catch (e) {
      console.warn('[lesson-memo] 저장 실패', e);
      dirtyRef.current = true;
      setSaveState('error');
    }
  }, []);

  // 메모 대상(반/공용)이 바뀌면 이전 것을 저장하고 새 것을 불러온다
  useEffect(() => {
    if (!user || !open) return;
    if (scope === 'class' && !classId) { setLoaded(true); setText(''); textRef.current = ''; targetRef.current = null; return; }
    let stop = false;
    (async () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      await save();
      setLoaded(false);
      targetRef.current = { uid: user.id, classId: targetClassId };
      const draft = readLS(draftKey(user.id, targetClassId));
      let q = supabase.from('lesson_memos').select('content').eq('teacher_id', user.id);
      q = targetClassId ? q.eq('class_id', targetClassId) : q.is('class_id', null);
      const { data, error } = await q.maybeSingle();
      if (stop) return;
      const content = error ? (draft ?? '') : (data?.content ?? draft ?? '');
      setText(content);
      textRef.current = content;
      dirtyRef.current = false;
      setSaveState(error ? 'error' : 'idle');
      setLoaded(true);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, open, scope, targetClassId]);

  // 창을 닫거나 화면을 떠날 때 마지막 내용을 저장
  useEffect(() => {
    const flush = () => { if (timerRef.current) clearTimeout(timerRef.current); void save(); };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, [save]);

  const onChange = (v: string) => {
    setText(v);
    textRef.current = v;
    dirtyRef.current = true;
    if (user) writeLS(draftKey(user.id, targetRef.current?.classId ?? null), v);
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void save(); }, 800);
  };

  const toggle = (next: boolean) => {
    if (!next) { if (timerRef.current) clearTimeout(timerRef.current); void save(); }
    setOpen(next);
    writeLS(OPEN_KEY, next ? '1' : '0');
  };

  if (!user) return null;

  const statusText = saveState === 'saving' ? '저장 중…' : saveState === 'saved' ? '저장됨' : saveState === 'error' ? '저장 안 됨 (이 기기에 임시 보관 중)' : '';
  const noClass = scope === 'class' && !classId;

  return createPortal(
    <div ref={constraintsRef} className="pointer-events-none fixed inset-0" style={{ zIndex: 10000 }}>
      {!open && (
        <button
          type="button"
          onPointerDown={onTabPointerDown}
          onPointerMove={onTabPointerMove}
          onPointerUp={onTabPointerUp}
          onPointerCancel={onTabPointerUp}
          title="수업 메모 열기 (끌어서 왼쪽·오른쪽 벽에 붙일 수 있어요)"
          aria-label="수업 메모 열기"
          className={`group pointer-events-auto absolute flex touch-none items-center bg-blue-600 py-3 text-sm font-black text-white shadow-xl ${drag ? 'cursor-grabbing' : 'cursor-grab transition-[top] duration-150'} ${
            drag ? 'rounded-full px-3.5' : dock.side === 'right' ? 'rounded-l-full pl-3.5 pr-3' : 'rounded-r-full pl-3 pr-3.5'
          }`}
          style={{
            top: drag ? drag.y : dock.y,
            ...(drag ? { left: drag.x, transform: 'translate(-50%, -50%)' } : dock.side === 'right' ? { right: 0, transform: 'translateY(-50%)' } : { left: 0, transform: 'translateY(-50%)' }),
          }}
        >
          <NotebookPen size={18} className="shrink-0" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:ml-1.5 group-hover:max-w-[6rem] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-[6rem] group-focus-visible:opacity-100">수업 메모</span>
        </button>
      )}

      {open && (
        <motion.div
          drag
          dragMomentum={false}
          dragConstraints={constraintsRef}
          dragControls={dragControls}
          dragListener={false}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`pointer-events-auto absolute ${dock.side === 'right' ? 'right-4' : 'left-4'} top-24 flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl`}
          style={{ height: 'min(420px, 70vh)' }}
        >
          <MemoHeader
            scope={scope}
            setScope={setScope}
            className={className}
            hasClass={!!classId}
            onClose={() => toggle(false)}
            onDragStart={e => dragControls.start(e)}
          />
          {noClass ? (
            <div className="flex flex-1 items-center justify-center p-5 text-center text-sm text-on-surface-variant">
              반을 먼저 열면 그 반 메모가 나와요.<br />위의 [공용]에는 어느 반에서나 보이는 메모를 적을 수 있어요.
            </div>
          ) : (
            <textarea
              value={text}
              onChange={e => onChange(e.target.value)}
              disabled={!loaded}
              placeholder={scope === 'class' ? `${className || '이 반'} 수업 멘트·보충 설명을 자유롭게 적어요` : '어느 반에서나 보이는 메모를 적어요'}
              className="flex-1 resize-none bg-amber-50/60 p-3 text-[15px] leading-relaxed text-on-surface outline-none placeholder:text-on-surface-variant/60"
            />
          )}
          <div className="flex items-center justify-between border-t border-blue-100 bg-white px-3 py-1.5 text-xs text-on-surface-variant">
            <span className={saveState === 'error' ? 'font-bold text-red-600' : ''}>{statusText}</span>
            <span>자동 저장 · 나만 볼 수 있어요</span>
          </div>
        </motion.div>
      )}
    </div>,
    document.body,
  );
};

const MemoHeader = ({ scope, setScope, className, hasClass, onClose, onDragStart }: {
  scope: Scope; setScope: (s: Scope) => void; className: string; hasClass: boolean; onClose: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}) => (
  <div onPointerDown={onDragStart} className="flex cursor-grab touch-none items-center gap-1 bg-blue-600 px-2 py-2 text-white active:cursor-grabbing">
    <NotebookPen size={15} className="ml-1 shrink-0" />
    <div className="flex flex-1 gap-1 pl-1">
      <button
        type="button"
        onClick={() => setScope('class')}
        className={`max-w-[150px] truncate rounded-lg px-2.5 py-1 text-xs font-black ${scope === 'class' ? 'bg-white text-blue-700' : 'bg-white/15'}`}
        title={hasClass ? `${className} 메모` : '반 메모'}
      >
        {hasClass ? (className || '이 반') : '반 메모'}
      </button>
      <button
        type="button"
        onClick={() => setScope('common')}
        className={`rounded-lg px-2.5 py-1 text-xs font-black ${scope === 'common' ? 'bg-white text-blue-700' : 'bg-white/15'}`}
      >
        공용
      </button>
    </div>
    <button type="button" onClick={onClose} title="접기" className="rounded-lg p-1.5 hover:bg-white/20"><Minus size={14} /></button>
    <button type="button" onClick={onClose} title="닫기" className="rounded-lg p-1.5 hover:bg-white/20"><X size={14} /></button>
  </div>
);

export default FloatingLessonMemo;
