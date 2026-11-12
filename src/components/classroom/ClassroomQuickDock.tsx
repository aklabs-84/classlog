import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Zap, X, Timer, Play, Pause, RotateCcw, ArrowLeftCircle, ExternalLink, QrCode } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useTimer } from '../../lib/timerContext';
import { useQuickDockState, type QuickItem } from '../../lib/quickDockStore';

// 선생님 화면 어디서나 벽(기본 오른쪽)에 붙어 보이는 "바로가기" 작은 버튼 (메모 버튼과 같은 공통 틀에 붙는다).
// 끌면 위아래·좌우 벽으로 옮길 수 있고, 자리는 이 브라우저에 기억한다.
// 클래스룸 화면이 열려 있으면 클래스룸이 맡겨 둔 전체 메뉴를, 그 밖에서는 반을 고르는 기본 메뉴(이동 버튼 위주)를 보여 준다.
// 타이머는 어디서나 쓸 수 있고, 화면 구석 작은 시계(FloatingTimer)와 같은 타이머를 공유한다.

export type { QuickItem };
const LAST_CLASS_KEY = 'teacher_last_class_id';
type ClassOpt = { id: string; name: string; entry_code: string | null; class_type: string | null };
const PRESETS = [1, 3, 5, 10];
const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

const DOCK_KEY = 'classroom_quick_dock_v1';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 기억 못 해도 화면은 정상 */ } };
const clampY = (y: number) => Math.min(Math.max(y, 80), window.innerHeight - 80);

const ClassroomQuickDock = () => {
  const { user } = useAuth();
  const { items: registered, hidden } = useQuickDockState();
  const location = useLocation();
  const navigate = useNavigate();
  const timer = useTimer();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<ClassOpt[] | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [dock, setDock] = useState<{ side: 'left' | 'right'; y: number }>(() => {
    try {
      const v = JSON.parse(readLS(DOCK_KEY) || 'null');
      if (v && (v.side === 'left' || v.side === 'right') && typeof v.y === 'number') return { side: v.side, y: clampY(v.y) };
    } catch { /* 기본 자리 사용 */ }
    return { side: 'right', y: Math.round(window.innerHeight * 0.4) };
  });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const info = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const fit = () => setDock(prev => ({ ...prev, y: clampY(prev.y) }));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 지금 보고 있는 반: 클래스룸 주소의 id → 없으면 마지막으로 연 반 (메모 버튼과 같은 규칙)
  useEffect(() => {
    const fromUrl = location.pathname.startsWith('/classroom') ? new URLSearchParams(location.search).get('id') : null;
    setClassId(fromUrl || readLS(LAST_CLASS_KEY));
    setShowCode(false);
  }, [location.pathname, location.search]);

  // 기본 메뉴에서 고를 내 반 목록: 메뉴를 처음 열 때 한 번만 불러온다
  useEffect(() => {
    if (!user || !open || registered || classes) return;
    let stop = false;
    supabase.from('classes').select('id, name, entry_code, class_type')
      .or(`teacher_id.eq.${user.id},assigned_teacher_id.eq.${user.id}`)
      .eq('is_archived', false).order('name')
      .then(({ data, error }) => { if (!stop && !error) setClasses((data ?? []) as ClassOpt[]); });
    return () => { stop = true; };
  }, [user?.id, open, registered, classes]);

  if (!user || hidden) return null;

  const cur = classes?.find(c => c.id === classId) ?? null;
  const defaultItems: QuickItem[] = [
    classId && { key: 'back', label: '지금 클래스룸으로 돌아가기', icon: ArrowLeftCircle, run: () => navigate(`/classroom?id=${classId}`) },
    cur?.entry_code && { key: 'page', label: '학생 페이지 열기', icon: ExternalLink, run: () => window.open(`${window.location.origin}/classroom-entry?code=${cur.entry_code}`, '_blank', 'noopener') },
    cur?.entry_code && cur.class_type !== 'homeroom' && { key: 'code', label: '학생 입장 코드 보기', icon: QrCode, run: () => setShowCode(true) },
  ].filter(Boolean) as QuickItem[];
  const items: QuickItem[] = registered ?? defaultItems;

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    info.current = { sx: e.clientX, sy: e.clientY, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = info.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    setDrag({ x: e.clientX, y: clampY(e.clientY) });
  };
  const up = (e: React.PointerEvent) => {
    const d = info.current;
    info.current = null;
    if (!d) return;
    if (!d.moved) { setOpen(v => !v); return; }
    const next = { side: e.clientX < window.innerWidth / 2 ? 'left' as const : 'right' as const, y: clampY(e.clientY) };
    setDrag(null);
    setDock(next);
    writeLS(DOCK_KEY, JSON.stringify(next));
  };

  const left = (drag ? drag.x < window.innerWidth / 2 : dock.side === 'left');
  const y = drag ? drag.y : dock.y;
  const pending = items.reduce((n, i) => n + (i.badge || 0), 0);

  return createPortal(
    <>
      {open && <div className="fixed inset-0 z-[10001]" onClick={() => setOpen(false)} aria-hidden />}
      <div className="fixed z-[10002]" style={{ top: y, [left ? 'left' : 'right']: 0, transform: 'translateY(-50%)' }}>
        <button
          type="button"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { info.current = null; setDrag(null); }}
          aria-label="바로가기 메뉴"
          aria-expanded={open}
          title="바로가기 (끌어서 옮길 수 있어요)"
          style={{ touchAction: 'none' }}
          className={`relative h-12 w-9 flex items-center justify-center bg-primary text-white shadow-lg hover:w-10 transition-[width] cursor-grab active:cursor-grabbing ${left ? 'rounded-r-2xl' : 'rounded-l-2xl'}`}
        >
          <Zap size={18} />
          {pending > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[11px] font-black inline-flex items-center justify-center">{pending}</span>}
        </button>
        {open && !drag && (
          <div className={`absolute top-1/2 -translate-y-1/2 w-[260px] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest shadow-xl p-2 ${left ? 'left-11' : 'right-11'}`}>
            <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
              <span className="text-[15px] font-bold text-on-surface">바로가기</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="p-1 rounded-lg text-on-surface-variant hover:bg-primary-container/60"><X size={16} /></button>
            </div>
            <div className="mx-1 mb-2 rounded-xl bg-primary-container/40 p-2.5">
              <div className="flex items-center gap-2">
                <Timer size={16} className="text-primary shrink-0" />
                <span className="text-[15px] font-semibold text-on-surface">타이머</span>
                <span className={`ml-auto font-mono text-[18px] font-black tabular-nums ${timer.isFinished ? 'text-red-500' : 'text-on-surface'}`}>{fmt(timer.remainingSeconds)}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                {PRESETS.map(m => (
                  <button key={m} type="button" disabled={timer.isRunning} onClick={() => timer.applyTime(m, 0)}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-container-lowest py-1 text-[13px] font-bold text-on-surface hover:border-primary disabled:opacity-40">{m}분</button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={timer.isAlarming ? timer.stopAlarm : timer.toggle} disabled={timer.isFinished && !timer.isAlarming}
                  className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-[14px] font-bold text-white disabled:opacity-40">
                  {timer.isAlarming ? '알람 끄기' : timer.isRunning ? <><Pause size={14} />멈춤</> : <><Play size={14} />시작</>}
                </button>
                <button type="button" onClick={timer.reset} aria-label="타이머 처음으로" title="처음으로"
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-container-lowest p-1.5 text-on-surface hover:border-primary"><RotateCcw size={15} /></button>
              </div>
            </div>
            {!registered && (
              <div className="mx-1 mb-2">
                <label className="block px-1 pb-1 text-[13px] font-semibold text-on-surface-variant">지금 반</label>
                <select
                  value={classId ?? ''}
                  onChange={e => { setClassId(e.target.value || null); setShowCode(false); }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-container-lowest px-2 py-1.5 text-[14px] text-on-surface"
                >
                  <option value="">{classes ? '반을 골라 주세요' : '불러오는 중…'}</option>
                  {(classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {!registered && showCode && cur?.entry_code && (
              <div className="mx-1 mb-2 rounded-xl border border-primary/30 bg-surface-container-lowest p-2.5 text-center">
                <div className="text-[12px] font-semibold text-on-surface-variant">{cur.name} 학생 입장 코드</div>
                <div className="mt-0.5 font-mono text-[26px] font-black tracking-widest text-primary">{cur.entry_code}</div>
              </div>
            )}
            {!registered && classes && !classId && (
              <p className="px-2 pb-2 text-[13px] text-on-surface-variant">반을 고르면 그 반의 메뉴가 나와요.</p>
            )}
            {items.map(({ key, label, icon: Icon, run, badge }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setOpen(false); run(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[15px] font-semibold text-on-surface hover:bg-primary-container/60 transition-colors text-left"
              >
                <Icon size={17} className="text-primary shrink-0" />
                <span className="flex-1">{label}</span>
                {!!badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[12px] font-black inline-flex items-center justify-center">{badge}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};

export default ClassroomQuickDock;
