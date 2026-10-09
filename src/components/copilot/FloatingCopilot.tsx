import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { Bot, X, Send, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useAuth, isFreeCreditPlan } from '../../lib/auth';
import { isDemoTeacher } from '../../lib/demo';
import { chatWithCopilot } from '../../lib/gemini';
import UpgradeModal from '../UpgradeModal';
import {
  loadProjectContext, formatProjectContextForAI, createSchoolWithClasses, previewPlanCopy, copyWeeklyPlan,
  cloneSchool, addStudentsToClass,
  type ProjectContext, type ActionResult,
} from '../../lib/schoolProjectActions';

// 학교 프로젝트 화면에서만 보이는 AI 도우미. AI는 '제안'만 하고, 저장은 확인 카드의 [실행] 버튼이 한다.
const MARKERS = ['[[SP_SCHOOL_CREATE]]', '[[SP_PLAN_COPY]]', '[[SP_SCHOOL_CLONE]]', '[[SP_STUDENT_ADD]]'] as const;
type Marker = typeof MARKERS[number];

interface PendingAction {
  marker: Marker;
  payload: any;
  warning?: string;
  status: 'pending' | 'running' | 'done' | 'cancelled';
  result?: ActionResult;
}

interface Msg {
  id: string;
  role: 'user' | 'ai';
  text: string;
  action?: PendingAction;
}

// 마커 다음 줄의 JSON 한 줄을 파싱하고, 나머지는 화면에 보여줄 설명으로 분리
function parseAction(content: string): { marker: Marker | null; payload: any; displayText: string } {
  const marker = MARKERS.find(m => content.includes(m)) ?? null;
  if (!marker) return { marker: null, payload: null, displayText: content };
  const rest0 = content.replace(marker, '').trim();
  const nl = rest0.indexOf('\n');
  const jsonLine = (nl === -1 ? rest0 : rest0.slice(0, nl)).trim();
  const rest = nl === -1 ? '' : rest0.slice(nl + 1).trim();
  let payload: any = null;
  try { payload = JSON.parse(jsonLine); } catch { payload = null; }
  return { marker, payload, displayText: rest || '확정된 내용을 확인해 주세요.' };
}

const ACTION_TITLE: Record<Marker, string> = {
  '[[SP_SCHOOL_CREATE]]': '학교와 반 만들기',
  '[[SP_PLAN_COPY]]': '주차 계획 복사',
  '[[SP_SCHOOL_CLONE]]': '학교 통째로 복사',
  '[[SP_STUDENT_ADD]]': '학생 명단 등록',
};

const FloatingCopilot = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const match = matchPath('/school-projects/:projectId/*', location.pathname);
  const projectId = match?.params.projectId && match.params.projectId !== 'new' ? match.params.projectId : null;

  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<ProjectContext | null>(null);
  const [ctxError, setCtxError] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshContext = async () => {
    if (!projectId || !user) return null;
    const c = await loadProjectContext(projectId, user.id);
    setCtx(c);
    setCtxError(!c);
    return c;
  };

  // 사업이 바뀌면 대화와 맥락을 초기화
  useEffect(() => {
    setMessages([]);
    setCtx(null);
    setCtxError(false);
    setOpen(false);
  }, [projectId]);

  useEffect(() => {
    if (open && projectId && user && !ctx) void refreshContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  if (!projectId || !user) return null;
  // 사업 관리자가 아니면(맥락 로드 실패) 버튼 자체를 열었을 때 안내만 보여준다

  const updateAction = (id: string, patch: Partial<PendingAction>) =>
    setMessages(prev => prev.map(m => (m.id === id && m.action ? { ...m, action: { ...m.action, ...patch } } : m)));

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !ctx) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text }]);
    setSending(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const response: string = await chatWithCopilot('school_project_assistant', history, text, {
        projectContextText: formatProjectContextForAI(ctx),
        todayDate: today,
      });
      const { marker, payload, displayText } = parseAction(response);
      const id = crypto.randomUUID();
      if (marker && payload) {
        let warning: string | undefined;
        if (marker === '[[SP_PLAN_COPY]]') {
          const pv = await previewPlanCopy(projectId, user.id, payload);
          if (!pv) {
            setMessages(prev => [...prev, { id, role: 'ai', text: '복사할 계획을 찾지 못했어요. 원본 학교나 공통 계획을 다시 알려 주세요.' }]);
            return;
          }
          warning = pv.overwriteClasses > 0
            ? `이미 따로 정해 둔 계획이 있는 반 ${pv.overwriteClasses}곳이 새 계획(${pv.weeks}주차)으로 바뀝니다.`
            : `${pv.targetCount}개 학교에 ${pv.weeks}주차 계획이 적용됩니다.`;
        }
        setMessages(prev => [...prev, { id, role: 'ai', text: displayText, action: { marker, payload, warning, status: 'pending' } }]);
      } else {
        setMessages(prev => [...prev, { id, role: 'ai', text: displayText }]);
      }
    } catch (e: any) {
      if (e?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeOpen(true);
      } else {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'ai', text: '답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.' }]);
      }
    } finally {
      setSending(false);
    }
  };

  const runAction = async (m: Msg) => {
    if (!m.action || m.action.status !== 'pending') return;
    if (isDemoTeacher(user)) {
      updateAction(m.id, { status: 'done', result: { ok: false, message: '체험 계정에서는 저장할 수 없어요.' } });
      return;
    }
    updateAction(m.id, { status: 'running' });
    const { marker, payload } = m.action;
    let result: ActionResult;
    try {
      if (marker === '[[SP_SCHOOL_CREATE]]') result = await createSchoolWithClasses(projectId, user.id, payload);
      else if (marker === '[[SP_PLAN_COPY]]') result = await copyWeeklyPlan(projectId, user.id, payload);
      else if (marker === '[[SP_SCHOOL_CLONE]]') result = await cloneSchool(projectId, user.id, payload);
      else result = await addStudentsToClass(projectId, user.id, profile, payload);
    } catch (e: any) {
      result = { ok: false, message: e?.message || '저장 중 오류가 났어요.' };
    }
    updateAction(m.id, { status: 'done', result });
    if (result.ok) await refreshContext();
  };

  const renderPayload = (a: PendingAction) => {
    const p = a.payload || {};
    const schoolName = (id?: string) => ctx?.schools.find(s => s.id === id)?.name ?? '(알 수 없음)';
    const className = (id?: string) => {
      for (const s of ctx?.schools ?? []) {
        const c = s.classes.find(x => x.id === id);
        if (c) return `${s.name} ${c.name}`;
      }
      return '(알 수 없음)';
    };
    const rows: [string, string][] = [];
    if (a.marker === '[[SP_SCHOOL_CREATE]]') {
      rows.push(['학교', p.name || '-'], ['지역', p.region || '-'], ['기간', `${p.start_date || '-'} ~ ${p.end_date || '-'}`], ['반', (p.class_names || []).join(', ') || '-']);
    } else if (a.marker === '[[SP_PLAN_COPY]]') {
      rows.push(['원본', p.source === 'school' ? schoolName(p.source_school_id) : '사업 공통 계획'], ['적용 학교', (p.target_school_ids || []).map(schoolName).join(', ') || '-']);
    } else if (a.marker === '[[SP_SCHOOL_CLONE]]') {
      rows.push(['원본', schoolName(p.source_school_id)], ['새 학교', p.name || '-'], ['지역', p.region || '-'], ['기간', `${p.start_date || '-'} ~ ${p.end_date || '-'}`]);
    } else {
      rows.push(['반', className(p.class_id)], ['인원', `${(p.names || []).length}명`]);
    }
    return rows;
  };

  const blocked = isFreeCreditPlan(profile);

  const panel = open && (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[400px] z-[9996] bg-surface-container-lowest border border-outline-variant/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      style={{ height: 'min(640px, 80dvh)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 bg-primary/5">
        <div className="flex items-center gap-2 min-w-0">
          <Bot size={18} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-black text-on-surface truncate">사업 도우미</p>
            <p className="text-[11px] font-bold text-on-surface-variant truncate">{ctx?.projectName ?? '학교 프로젝트'}</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-container" aria-label="닫기"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {blocked ? (
          <p className="text-sm font-bold text-on-surface-variant">사업 도우미는 유료 플랜에서 쓸 수 있어요.</p>
        ) : ctxError ? (
          <p className="text-sm font-bold text-on-surface-variant">이 사업의 관리자만 사용할 수 있어요.</p>
        ) : !ctx ? (
          <div className="flex items-center gap-2 text-sm font-bold text-on-surface-variant"><Loader2 size={16} className="animate-spin" /> 사업 정보를 불러오는 중…</div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="text-sm font-bold text-on-surface-variant space-y-1.5">
                <p>이런 걸 말로 시킬 수 있어요.</p>
                <p>· "OO초 추가해줘. 반은 1반 2반 3반"</p>
                <p>· "A초 주차 계획을 B초, C초에도 적용해줘"</p>
                <p>· "A초를 통째로 복사해서 D초 만들어줘"</p>
                <p>· "A초 1반에 학생 명단 등록할게" (이름 붙여넣기)</p>
                <p className="text-[11px] text-on-surface-variant/70 pt-1">저장은 확인 카드의 [실행]을 눌러야만 됩니다. 삭제는 하지 않아요.</p>
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm font-bold whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-primary text-white' : 'bg-surface-container text-on-surface'}`}>
                  {m.text}
                  {m.action && (
                    <div className="mt-3 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 p-3 space-y-2">
                      <p className="text-xs font-black text-primary">{ACTION_TITLE[m.action.marker]}</p>
                      <dl className="space-y-1">
                        {renderPayload(m.action).map(([k, v]) => (
                          <div key={k} className="flex gap-2 text-xs">
                            <dt className="w-14 shrink-0 text-on-surface-variant">{k}</dt>
                            <dd className="font-black break-all">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {m.action.warning && (
                        <p className="flex gap-1.5 text-xs font-black text-amber-600"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{m.action.warning}</p>
                      )}
                      {m.action.status === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => runAction(m)} className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-black">실행</button>
                          <button onClick={() => updateAction(m.id, { status: 'cancelled' })} className="px-3 py-2 rounded-lg bg-surface-container text-xs font-black">취소</button>
                        </div>
                      )}
                      {m.action.status === 'running' && <p className="flex items-center gap-1.5 text-xs font-black"><Loader2 size={14} className="animate-spin" /> 저장 중…</p>}
                      {m.action.status === 'cancelled' && <p className="text-xs font-black text-on-surface-variant">취소했어요.</p>}
                      {m.action.status === 'done' && m.action.result && (
                        <div className="space-y-1.5">
                          <p className={`flex gap-1.5 text-xs font-black whitespace-pre-wrap ${m.action.result.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                            {m.action.result.ok ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                            {m.action.result.message}
                          </p>
                          {m.action.result.ok && m.action.result.navigateTo && (
                            <button onClick={() => { navigate(m.action!.result!.navigateTo!); setOpen(false); }} className="text-xs font-black text-primary underline">바로 가서 확인하기</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="flex items-center gap-2 text-sm font-bold text-on-surface-variant"><Loader2 size={16} className="animate-spin" /> 생각 중…</div>}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {!blocked && ctx && (
        <div className="p-3 border-t border-outline-variant/20 flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
            rows={2}
            placeholder="하고 싶은 일을 말해 주세요"
            className="flex-1 resize-none rounded-xl bg-surface-container px-3 py-2 text-base font-bold outline-none"
          />
          <button onClick={() => void send()} disabled={sending || !input.trim()} className="p-3 rounded-xl bg-primary text-white disabled:opacity-40" aria-label="보내기">
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 z-[9996] w-14 h-14 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          aria-label="사업 도우미 열기"
        >
          <Bot size={26} />
        </button>
      )}
      {panel}
      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="ai_limit" />
    </>,
    document.body,
  );
};

export default FloatingCopilot;
