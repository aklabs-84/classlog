import { readCornerOn, writeCornerOn } from '../components/home/FloatingMate';
import PixelMate, { deriveMate, type MascotKey } from '../components/home/PixelMate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, School, PenLine, LayoutGrid, Plus, X, ArrowRight, ChevronLeft, ChevronRight, Check, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// 수업 도구 바로가기 후보 (TeachingTools.tsx의 tools 목록과 id·이름을 맞춘다)
const TOOL_OPTIONS: { id: string; label: string }[] = [
  { id: 'slide-deck', label: '슬라이드 만들기' },
  { id: 'survey', label: '실시간 설문' },
  { id: 'quiz', label: '실시간 퀴즈' },
  { id: 'whiteboard', label: '협업 화이트보드' },
  { id: 'live-board', label: '실시간 참여 게시판' },
  { id: 'timer', label: '수업 타이머' },
  { id: 'group-picker', label: '랜덤 조 뽑기' },
  { id: 'random-pick', label: '랜덤 학생 뽑기' },
  { id: 'lesson-plan', label: '수업 계획서 만들기' },
  { id: 'my-notes', label: '나의 노트' },
  { id: 'submission-viewer', label: '제출물 뷰어' },
  { id: 'transcription', label: '수업 전사 & AI 분석' },
  { id: 'online-meeting', label: '온라인 수업' },
  { id: 'portfolio', label: '강사 포트폴리오' },
];
const MAX_CUSTOM = 8;

type Recent = { key: string; kind: '수업 자료' | '슬라이드' | '클래스'; title: string; sub: string; at: string; dot?: boolean; go: () => void };

const FIXED = [
  { label: '클래스 대시보드', sub: '진행 현황', icon: BarChart3, to: '/classes' },
  { label: '클래스룸', sub: '수업 화면', icon: School, to: '/classroom' },
  { label: '수업 자료 에디터', sub: '새 자료 쓰기', icon: PenLine, to: '/teaching-tools?tool=material-editor' },
  { label: '수업 도구', sub: '설문 · 화이트보드 등', icon: LayoutGrid, to: '/teaching-tools' },
];

const relTime = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 8 ? `${d}일 전` : new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [recents, setRecents] = useState<Recent[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [steps, setSteps] = useState<boolean[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBody, setQuickBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [cornerOn, setCornerOn] = useState(readCornerOn());
  const [mascot, setMascot] = useState<MascotKey>('robot');
  const [awayDays, setAwayDays] = useState(0);
  const [weekCount, setWeekCount] = useState<number | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const hiddenAtLoad = useRef<boolean | null>(null);
  const quickRef = useRef<HTMLInputElement>(null);

  const name = (profile as { name?: string; full_name?: string } | null)?.name
    || (profile as { full_name?: string } | null)?.full_name
    || (user?.user_metadata?.full_name as string | undefined)
    || '';
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });

  // 저장된 바로가기·체크리스트 상태
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('teacher_home_prefs').select('shortcuts, checklist_hidden, mascot, last_seen').eq('user_id', user.id).maybeSingle();
      if (data) {
        setCustom(Array.isArray(data.shortcuts) ? (data.shortcuts as string[]).filter(id => TOOL_OPTIONS.some(t => t.id === id)) : []);
        setHidden(!!data.checklist_hidden);
        if (data.mascot === 'sprout' || data.mascot === 'cat' || data.mascot === 'robot') setMascot(data.mascot);
        if (data.last_seen) setAwayDays(Math.floor((Date.now() - +new Date(data.last_seen)) / 86400000));
      }
      hiddenAtLoad.current = !!data?.checklist_hidden;
      // 오늘 처음 들어왔다면 마지막 접속일을 갱신
      const seen = data?.last_seen ? new Date(data.last_seen).toDateString() : '';
      if (seen !== new Date().toDateString()) {
        await supabase.from('teacher_home_prefs').upsert({ user_id: user.id, last_seen: new Date().toISOString() });
      }
      setPrefsLoaded(true);
    })();
  }, [user?.id]);

  // 이어서 하기 + 시작 체크리스트
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [cls, mats, decks] = await Promise.all([
        supabase.from('classes').select('id, name, created_at').eq('teacher_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }).limit(20),
        supabase.from('class_materials').select('id, title, class_id, updated_at').eq('teacher_id', user.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('slide_decks').select('id, title, updated_at').eq('teacher_id', user.id).order('updated_at', { ascending: false }).limit(5),
      ]);
      const classRows = cls.data ?? [];
      const nameOf = (id: string | null) => classRows.find(c => c.id === id)?.name ?? '';
      const list: Recent[] = [
        ...(mats.data ?? []).map(m => ({ key: 'm' + m.id, kind: '수업 자료' as const, title: m.title || '제목 없는 자료', sub: nameOf(m.class_id), at: m.updated_at,
          go: () => navigate('/teaching-tools', { state: { activeToolId: 'material-editor', openMaterialId: m.id, fromHome: true } }) })),
        ...(decks.data ?? []).map(d => ({ key: 'd' + d.id, kind: '슬라이드' as const, title: d.title || '제목 없는 슬라이드', sub: '', at: d.updated_at,
          go: () => navigate('/teaching-tools', { state: { activeToolId: 'slide-deck', openSlideId: d.id, fromHome: true } }) })),
        ...classRows.slice(0, 3).map(c => ({ key: 'c' + c.id, kind: '클래스' as const, title: c.name, sub: '클래스', at: c.created_at, go: () => navigate('/classes') })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 4);
      setRecents(list);

      // 이번 주(7일) 선생님이 직접 만들거나 고친 것 세기 — 학생 활동은 세지 않음
      const since = Date.now() - 7 * 86400000;
      const { count: noteCount } = await supabase.from('teacher_notes').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id).gte('created_at', new Date(since).toISOString());
      const recentEdits = [...(mats.data ?? []), ...(decks.data ?? [])].filter(x => +new Date(x.updated_at) >= since).length;
      setWeekCount(recentEdits + (noteCount ?? 0));

      let hasStudent = false;
      if (classRows.length) {
        const { data: st } = await supabase.from('students').select('id').in('class_id', classRows.map(c => c.id)).limit(1);
        hasStudent = !!st?.length;
      }
      setSteps([classRows.length > 0, (mats.data ?? []).length > 0, hasStudent]);
    })();
  }, [user?.id]);

  const doneCount = steps ? steps.filter(Boolean).length : 0;
  const allDone = !!steps && doneCount === 3;
  // 세 가지를 모두 끝내면 이 목록은 다음부터 나타나지 않는다
  useEffect(() => {
    if (!user || !allDone || hidden || !prefsLoaded) return;
    saveHidden(true);
  }, [allDone, prefsLoaded]);

  const savePrefs = async (patch: { shortcuts?: string[]; checklist_hidden?: boolean; mascot?: MascotKey }) => {
    if (!user) return;
    await supabase.from('teacher_home_prefs').upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
  };
  const pickMascot = (m: MascotKey) => { setMascot(m); savePrefs({ mascot: m }); };
  // 시작 가이드를 이번에 막 끝냈다면 축하
  useEffect(() => {
    if (allDone && prefsLoaded && hiddenAtLoad.current === false) setCelebrate(true);
  }, [allDone, prefsLoaded]);
  const { state: mateState, reason: mateReason } = deriveMate(weekCount ?? 0, awayDays, celebrate);
  const saveHidden = (v: boolean) => { setHidden(v); savePrefs({ checklist_hidden: v }); };
  const updateCustom = (next: string[]) => { setCustom(next); savePrefs({ shortcuts: next }); };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= custom.length) return;
    const next = [...custom];
    [next[i], next[j]] = [next[j], next[i]];
    updateCustom(next);
  };

  // `/` 키로 아이디어 칸에 바로 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        quickRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveQuick = async () => {
    const title = quickTitle.trim();
    const content = quickBody.trim() || title;
    if (!content || !user || saving) return;
    setSaving(true);
    const { error } = await supabase.from('teacher_notes').insert({ teacher_id: user.id, class_id: null, title: title || null, content, reference_links: [] });
    setSaving(false);
    if (error) { setToast('저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); } else {
      setQuickTitle(''); setQuickBody(''); (document.activeElement as HTMLElement | null)?.blur();
      setToast('아이디어를 기록했어요');
    }
    setTimeout(() => setToast(''), 2800);
  };

  const available = useMemo(() => TOOL_OPTIONS.filter(t => !custom.includes(t.id)), [custom]);
  const showChecklist = !!steps && prefsLoaded && !hidden && !allDone;

  const tile = 'home-rise group relative overflow-hidden flex items-center gap-3.5 text-left bg-surface-container-lowest border border-outline-variant/60 border-slate-200 dark:border-slate-700 rounded-2xl p-4 transition-all duration-200 hover:border-primary hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_rgba(139,92,246,0.55)]';
  const icBox = 'w-11 h-11 rounded-xl bg-primary-container text-primary grid place-items-center shrink-0 transition-all duration-200 group-hover:bg-primary group-hover:text-white group-hover:scale-105';

  return (
    <div className="max-w-[1040px] mx-auto pb-16">
      <style>{`
        @keyframes home-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes home-pulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.45)}100%{box-shadow:0 0 0 9px rgba(22,163,74,0)}}
        @keyframes home-pop{50%{transform:scale(1.25)}}
        .home-rise{animation:home-rise .5s cubic-bezier(.2,.7,.2,1) both}
        .home-pulse{animation:home-pulse 2s infinite}
        .home-pop{animation:home-pop .25s}
        .home-glow::before{content:"";position:absolute;inset:0;background:radial-gradient(180px circle at var(--mx,50%) var(--my,50%),var(--color-primary-container),transparent 70%);opacity:0;transition:opacity .25s;pointer-events:none}
        .home-glow:hover::before{opacity:1}
        .home-glow>*{position:relative}
        @media (prefers-reduced-motion:reduce){.home-rise,.home-pulse,.home-pop{animation:none!important}}
      `}</style>

      <header className="home-rise relative z-30 pt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
        <p className="flex items-center gap-2 text-[15px] text-on-surface-variant mb-1.5">
          <span className="home-pulse w-2 h-2 rounded-full bg-green-600" />{today}
        </p>
        <h1 className="text-[26px] md:text-[32px] font-bold tracking-tight leading-snug text-on-surface">
          {name ? `${name} 선생님, ` : ''}오늘은 <span className="bg-gradient-to-t from-primary-container from-[38%] to-transparent to-[38%] px-0.5">무엇부터</span> 할까요?
        </h1>
        </div>
        {weekCount !== null && prefsLoaded && <PixelMate mascot={mascot} state={mateState} reason={mateReason} onPick={pickMascot} cornerSwitch={{ on: cornerOn, set: v => { writeCornerOn(v); setCornerOn(v); } }} />}
      </header>

      {/* 아이디어 한 줄 */}
      <div className="home-rise group relative mt-7 mb-10 bg-surface-container-lowest border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 transition-all focus-within:border-primary focus-within:shadow-[0_0_0_4px_var(--color-primary-container)]" style={{ animationDelay: '.08s' }}>
        <kbd className="absolute right-5 top-4 text-[13px] text-on-surface-variant border border-slate-200 dark:border-slate-600 rounded-md px-2 transition-opacity group-focus-within:opacity-0">/</kbd>
        <input ref={quickRef} value={quickTitle} onChange={e => setQuickTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !quickBody.trim()) saveQuick(); }}
          placeholder="떠오른 수업 아이디어를 한 줄로 적어 보세요"
          className="w-full bg-transparent outline-none text-[19px] text-on-surface placeholder:text-on-surface-variant/70" />
        <div className="hidden group-focus-within:block mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <textarea value={quickBody} onChange={e => setQuickBody(e.target.value)} rows={3}
            placeholder="더 자세히 쓰고 싶다면 이어서 적어요"
            className="w-full bg-transparent outline-none resize-y text-[18px] leading-relaxed text-on-surface" />
          <div className="flex items-center justify-between gap-3 text-[14px] text-on-surface-variant">
            <span>전체 기록은 왼쪽 메뉴 ‘아이디어 기록’에서 볼 수 있어요</span>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={saveQuick} disabled={saving || !(quickTitle.trim() || quickBody.trim())}
              className="bg-on-surface text-surface rounded-lg px-4 py-2 text-[15px] font-medium disabled:opacity-40">
              {saving ? '저장 중…' : '기록하기'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_330px] gap-10 lg:gap-12">
        {/* 내 바로가기 */}
        <section>
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-[15px] font-bold text-on-surface-variant">내 바로가기</h2>
            {custom.length > 0 && (
              <button onClick={() => setEditing(v => !v)} className="text-[14px] font-medium text-primary">{editing ? '완료' : '정리하기'}</button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {FIXED.map((f, i) => (
              <button key={f.label} onClick={() => navigate(f.to, { state: { fromHome: true } })} className={`${tile} home-glow`} style={{ animationDelay: `${0.14 + i * 0.05}s` }}
                onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', e.clientX - r.left + 'px'); e.currentTarget.style.setProperty('--my', e.clientY - r.top + 'px'); }}>
                <span className={icBox}><f.icon size={22} strokeWidth={1.7} /></span>
                <span><b className="block text-[18px] font-bold leading-snug text-on-surface">{f.label}</b><small className="text-[14px] text-on-surface-variant">{f.sub}</small></span>
                <ArrowRight size={18} className="ml-auto text-primary opacity-0 -translate-x-1.5 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
              </button>
            ))}
            {custom.map((id, i) => {
              const t = TOOL_OPTIONS.find(o => o.id === id)!;
              return (
                <div key={id} className="relative">
                  <button onClick={() => navigate(`/teaching-tools?tool=${id}`, { state: { fromHome: true } })} className={`${tile} home-glow w-full`}
                    onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', e.clientX - r.left + 'px'); e.currentTarget.style.setProperty('--my', e.clientY - r.top + 'px'); }}>
                    <span className={icBox}><Wrench size={20} strokeWidth={1.7} /></span>
                    <span><b className="block text-[18px] font-bold leading-snug text-on-surface">{t.label}</b><small className="text-[14px] text-on-surface-variant">내가 추가함</small></span>
                    <ArrowRight size={18} className="ml-auto text-primary opacity-0 -translate-x-1.5 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                  </button>
                  {editing && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 z-10">
                      <button aria-label="앞으로" onClick={() => move(i, -1)} disabled={i === 0} className="w-6 h-6 grid place-items-center rounded-full bg-surface-container-high text-on-surface disabled:opacity-30"><ChevronLeft size={14} /></button>
                      <button aria-label="뒤로" onClick={() => move(i, 1)} disabled={i === custom.length - 1} className="w-6 h-6 grid place-items-center rounded-full bg-surface-container-high text-on-surface disabled:opacity-30"><ChevronRight size={14} /></button>
                      <button aria-label="삭제" onClick={() => updateCustom(custom.filter(x => x !== id))} className="w-6 h-6 grid place-items-center rounded-full bg-surface-container-high text-on-surface"><X size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {custom.length < MAX_CUSTOM && available.length > 0 && (
              <button onClick={() => setPicker(v => !v)} className="flex items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl p-4 text-[16px] font-medium text-on-surface-variant hover:text-primary hover:border-primary hover:bg-primary-container/40 transition-colors">
                <Plus size={18} /> 바로가기 추가
              </button>
            )}
          </div>
          {picker && (
            <div className="mt-3 flex flex-wrap gap-2">
              {available.map(t => (
                <button key={t.id} onClick={() => { updateCustom([...custom, t.id]); if (custom.length + 1 >= MAX_CUSTOM) setPicker(false); }}
                  className="text-[15px] bg-surface-container-lowest border border-slate-200 dark:border-slate-700 rounded-full px-3.5 py-1.5 text-on-surface hover:border-primary hover:text-primary transition-colors">
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 이어서 하기 + 시작 가이드 */}
        <aside className="space-y-9">
          <section className="home-rise" style={{ animationDelay: '.2s' }}>
            <h2 className="text-[15px] font-bold text-on-surface-variant mb-3.5">이어서 하기</h2>
            {recents.length === 0 ? (
              <p className="text-[16px] text-on-surface-variant py-3">아직 만든 것이 없어요. 아래 ‘수업 자료 에디터’로 첫 자료를 만들어 보세요.</p>
            ) : (
              <ul className="border-t border-slate-200 dark:border-slate-700">
                {recents.map(r => (
                  <li key={r.key}>
                    <button onClick={r.go} className="group w-full flex items-center justify-between gap-3 text-left py-3 border-b border-slate-200 dark:border-slate-700 transition-all hover:pl-1.5">
                      <span className="min-w-0">
                        <b className="block text-[17px] font-medium leading-snug text-on-surface truncate group-hover:text-primary transition-colors">{r.title}</b>
                        <small className="text-[14px] text-on-surface-variant">{r.kind}{r.sub && r.sub !== '클래스' ? ` · ${r.sub}` : ''} · {relTime(r.at)}</small>
                      </span>
                      <ArrowRight size={16} className="shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {showChecklist && steps && (
            <section className="home-rise" style={{ animationDelay: '.3s' }}>
              <h2 className="flex items-center justify-between text-[15px] font-bold text-on-surface-variant mb-2.5">
                <span>시작 가이드</span>
                <span className="font-medium">{doneCount} / 3</span>
              </h2>
              <div className="h-1 rounded-full bg-surface-container-high overflow-hidden mb-2">
                <i className="block h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-500" style={{ width: `${(doneCount / 3) * 100}%` }} />
              </div>
              {[
                { t: '클래스 만들기', to: '/classes' },
                { t: '수업 자료 만들기', to: '/teaching-tools?tool=material-editor' },
                { t: '학생 입장시키기', to: '/classroom' },
              ].map((s, i) => (
                <button key={s.t} onClick={() => navigate(s.to, { state: { fromHome: true } })} className="w-full flex items-center gap-3 py-2 text-left text-[17px] hover:text-primary transition-colors">
                  <span className={`w-5 h-5 rounded-full border-[1.5px] grid place-items-center shrink-0 ${steps[i] ? 'bg-primary border-primary text-white home-pop' : 'border-slate-300 dark:border-slate-600'}`}>
                    {steps[i] && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className={steps[i] ? 'line-through text-on-surface-variant' : 'text-on-surface'}>{s.t}</span>
                </button>
              ))}
              <button onClick={() => saveHidden(true)} className="mt-2 text-[13px] text-on-surface-variant hover:text-on-surface">이 안내 숨기기</button>
            </section>
          )}
        </aside>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-on-surface text-surface rounded-full px-5 py-2.5 text-[15px] shadow-lg">{toast}</div>
      )}
    </div>
  );
}
