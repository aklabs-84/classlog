import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, Children, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ArrowLeft, Eye, ListTree, PanelRightClose, Link2, File, ExternalLink, Download, Paperclip, Check, Loader2, AlertCircle, Gamepad2, StickyNote, ScrollText, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import ActivityLinksButton, { type ActivityLink } from './ActivityLinksButton';
import TeacherPageTools from './TeacherPageTools';
import MaterialAttachments, { type MaterialAttachment } from './MaterialAttachments';

// 학생용 수업 자료 "한 페이지" 뷰어 — 본문 + 오른쪽 목차(접고 펼치기) + 이 차시에 등록된 일반 자료를
// 한 화면에서 이어서 볼 수 있게 한다. 목차는 실제 렌더된 화면의 h1/h2에서 뽑아 토글·HTML 제목이
// 섞여 있어도 화면과 어긋나지 않는다.

interface TocItem { id: string; text: string; level: 1 | 2 }

export interface RelatedMaterial {
  id: string;
  title: string;
  type: 'link' | 'file';
  url?: string | null;
  file_name?: string | null;
}

// 학생 입력칸(표의 빈 셀 · [ ] 체크박스 · ___ 밑줄) 답변 저장 설정.
// save가 없으면 읽기 전용(교사가 학생 답변을 볼 때). answers 자체가 없으면 입력칸 없이 기존처럼 본문만 보여준다.
export interface MaterialAnswerConfig {
  load: () => Promise<Record<string, string>>;
  save?: (key: string, value: string) => Promise<void>;
}

// 이 차시에 연결된 퀴즈·보드 — 관련 자료 섹션에 함께 표시 (ready=false면 안내만, 버튼 비활성)
export interface WeekExtraItem {
  key: string;
  kind: 'quiz' | 'board';
  title: string;
  ready: boolean;
  note: string;
  onClick?: () => void;
  href?: string;
}

interface Props {
  title: string;
  content: string;
  links?: ActivityLink[];
  attachments?: MaterialAttachment[];
  mdComponents: any;
  relatedMaterials?: RelatedMaterial[];
  extraItems?: WeekExtraItem[];
  answers?: MaterialAnswerConfig;
  onOpenFile?: (mat: RelatedMaterial, download: boolean) => void;
  /** 선생님 미리보기일 때만 켜는 수업 도구(돋보기·펜·스포트라이트, PC 화면 전용) */
  teacherTools?: boolean;
  /** 에디터 미리보기용 — 입력은 써볼 수 있지만 저장되지 않으므로 "저장됨" 표시를 숨긴다 */
  previewOnly?: boolean;
  onClose: () => void;
}

interface AnswerCtx {
  readOnly: boolean;
  version: number; // 답변을 불러올 때마다 올라가 입력칸이 값을 다시 읽게 한다
  get: (key: string) => string;
  set: (key: string, value: string) => void;
}
const AnswerContext = createContext<AnswerCtx | null>(null);
// GFM 체크박스(`- [ ]`)의 input은 위치 정보가 없어 가장 가까운 li의 줄 번호를 키로 빌려 쓴다
const LineContext = createContext<string>('');

const FIELD_CLS = 'rounded-lg border-2 border-primary/25 bg-primary/5 px-3 py-2 text-lg leading-snug outline-none focus:border-primary focus:bg-white disabled:opacity-100 disabled:bg-surface-container-low disabled:border-surface-container disabled:text-on-surface';

const AnswerText = ({ fieldKey, inline }: { fieldKey: string; inline?: boolean }) => {
  const ctx = useContext(AnswerContext)!;
  const [v, setV] = useState(() => ctx.get(fieldKey));
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setV(ctx.get(fieldKey)); }, [ctx, fieldKey]);
  // 접힌 details 안에서는 scrollHeight가 0이라 높이를 건드리지 않는다
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight) el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  const onChange = (nv: string) => { setV(nv); ctx.set(fieldKey, nv); };
  if (inline) {
    return (
      <input
        type="text"
        data-answer-field
        data-fkey={fieldKey}
        value={v}
        maxLength={2000}
        disabled={ctx.readOnly}
        placeholder={ctx.readOnly ? '' : '여기에 적어요'}
        onChange={e => onChange(e.target.value)}
        className={`${FIELD_CLS} inline-block align-baseline mx-1 w-72 max-w-full py-1`}
      />
    );
  }
  return (
    <textarea
      ref={taRef}
      data-answer-field
      data-fkey={fieldKey}
      rows={1}
      value={v}
      maxLength={2000}
      disabled={ctx.readOnly}
      placeholder={ctx.readOnly ? '' : '여기에 적어요'}
      onChange={e => onChange(e.target.value)}
      className={`${FIELD_CLS} block w-full min-w-[8rem] resize-none`}
    />
  );
};

const AnswerCheckbox = ({ fieldKey }: { fieldKey: string }) => {
  const ctx = useContext(AnswerContext)!;
  const [on, setOn] = useState(() => ctx.get(fieldKey) === '1');
  useEffect(() => { setOn(ctx.get(fieldKey) === '1'); }, [ctx, fieldKey]);
  return (
    <input
      type="checkbox"
      data-answer-field
      data-fkey={fieldKey}
      checked={on}
      disabled={ctx.readOnly}
      onChange={e => { setOn(e.target.checked); ctx.set(fieldKey, e.target.checked ? '1' : '0'); }}
      className="w-5 h-5 mr-2 align-[-3px] accent-primary cursor-pointer disabled:cursor-default"
    />
  );
};

const TOKEN_RE = /(\[ \]|_{3,})/;

// 문자열 자식 안의 "[ ]"·"___"를 입력칸으로 바꾼다(이스케이프된 \[ \] , \___ 도 마크다운 처리 후엔 일반 글자)
const renderInteractive = (children: ReactNode, baseKey: string): ReactNode => {
  let idx = 0;
  return Children.toArray(children).map((c, i) => {
    if (typeof c !== 'string' || !TOKEN_RE.test(c)) return c;
    return (
      <Fragment key={`t${i}`}>
        {c.split(TOKEN_RE).map((part, j) => {
          if (part === '[ ]') return <AnswerCheckbox key={j} fieldKey={`${baseKey}:${idx++}`} />;
          if (/^_{3,}$/.test(part)) return <AnswerText key={j} inline fieldKey={`${baseKey}:${idx++}`} />;
          return part;
        })}
      </Fragment>
    );
  });
};

const isBlankCell = (children: ReactNode) =>
  Children.toArray(children).every(c => typeof c === 'string' && !c.trim());

const posKey = (node: any) => {
  const s = node?.position?.start;
  return s ? `${s.line}-${s.column}` : '';
};

// 입력칸을 끼워 넣은 마크다운 컴포넌트. 컴포넌트 참조는 useMemo로 고정(리마운트 방지)하고 값은 context로 읽는다.
const buildAnswerComponents = (base: any) => {
  const wrap = (tag: 'p' | 'li' | 'td', extra?: (props: any, ctx: AnswerCtx, key: string) => any) => (props: any) => {
    const ctx = useContext(AnswerContext);
    const key = posKey(props.node);
    const Base = base?.[tag] ?? tag;
    if (!ctx || !key) return createElement(Base, props);
    const next = extra ? extra(props, ctx, key) : props;
    return createElement(Base, next);
  };
  const withTokens = (tag: string) => (props: any, _ctx: AnswerCtx, key: string) =>
    ({ ...props, children: renderInteractive(props.children, `${tag}${key}`) });

  const P = wrap('p', withTokens('p'));
  const Td = wrap('td', (props, _ctx, key) =>
    isBlankCell(props.children)
      ? { ...props, children: <AnswerText fieldKey={`td${key}`} /> }
      : withTokens('td')(props, _ctx, key));
  const LiInner = (props: any) => {
    const ctx = useContext(AnswerContext);
    const key = posKey(props.node);
    const BaseLi = base?.li ?? 'li';
    if (!ctx || !key) return createElement(BaseLi, props);
    const children = renderInteractive(props.children, `li${key}`);
    // 기본 li는 className을 무시하므로 체크박스 항목만 글머리표 없이 직접 그린다
    if (/task-list-item/.test(props.className || '')) {
      return <li className="list-none -ml-6 text-lg leading-[1.9]">{children}</li>;
    }
    return createElement(BaseLi, { ...props, children });
  };
  const Li = (props: any) => (
    <LineContext.Provider value={`li${posKey(props.node)}`}>
      <LiInner {...props} />
    </LineContext.Provider>
  );
  const Input = (props: any) => {
    const ctx = useContext(AnswerContext);
    const line = useContext(LineContext);
    if (props.type === 'checkbox' && ctx && line) return <AnswerCheckbox fieldKey={`${line}:gfm`} />;
    const { node: _node, ...rest } = props;
    return <input {...rest} />;
  };
  return { ...base, p: P, td: Td, li: Li, input: Input };
};

// 에디터 미리보기용 — 학생 화면과 똑같이 입력칸을 보여주되 저장은 하지 않고, 화면을 닫으면 사라진다
export const AnswerPreviewMarkdown = ({ content, mdComponents }: { content: string; mdComponents: any }) => {
  const valuesRef = useRef<Record<string, string>>({});
  const ctx = useMemo<AnswerCtx>(() => ({
    readOnly: false,
    version: 0,
    get: (k) => valuesRef.current[k] ?? '',
    set: (k, v) => { valuesRef.current[k] = v; },
  }), []);
  const components = useMemo(() => buildAnswerComponents(mdComponents), [mdComponents]);
  return (
    <AnswerContext.Provider value={ctx}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {content}
      </ReactMarkdown>
    </AnswerContext.Provider>
  );
};

const RELATED_ID = 'student-material-related';
const TOC_PREF_KEY = 'studentMaterialTocOpen';

const readTocPref = (): boolean => {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  if (!isDesktop) return false;
  try { return localStorage.getItem(TOC_PREF_KEY) !== '0'; } catch { return true; }
};

const SAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 5000;

const StudentMaterialPage = ({ title, content, links, attachments, mdComponents, relatedMaterials = [], extraItems = [], answers, onOpenFile, teacherTools = false, previewOnly = false, onClose }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [tocOpen, setTocOpen] = useState<boolean>(readTocPref);
  const relatedRef = useRef<HTMLElement>(null);
  // 단계별 보기: 본문을 `##`(없으면 `#`) 제목 단위로 나눠 한 단계씩 보여 준다. 기본은 전체 보기.
  // 안 보이는 단계는 지우지 않고 숨기기만 해서(DOM 유지) 학생 입력칸 순번이 밀리지 않는다.
  const [stepMode, setStepMode] = useState(false);
  const [step, setStep] = useState(0);
  const [groups, setGroups] = useState<HTMLElement[][]>([]);
  const [stepOf, setStepOf] = useState<Record<string, number>>({});
  const [stepLabels, setStepLabels] = useState<string[]>([]);

  const hasRelated = relatedMaterials.length > 0 || extraItems.length > 0;

  // ── 학생 입력칸 답변 ─────────────────────────────────────────────
  // 값은 ref에 두고 각 입력칸이 자기 상태로 들고 있어, 타이핑할 때 본문 전체가 다시 그려지지 않는다.
  const cfgRef = useRef(answers);
  cfgRef.current = answers;
  const valuesRef = useRef<Record<string, string>>({});
  // 저장 키는 "문서에서 n번째 입력칸"(f1, f2…). 자료 중간에 줄이 추가/삭제돼도 답변이 밀리지 않도록
  // 화면에 그려진 입력칸을 DOM 순서로 세어 위치 키(줄:칸)→순번으로 바꾼다.
  const ordinalRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const save = cfgRef.current?.save;
    if (!save || pendingRef.current.size === 0) return;
    const entries = Array.from(pendingRef.current.entries());
    pendingRef.current.clear();
    setStatus('saving');
    try {
      await Promise.all(entries.map(([k, v]) => save(k, v)));
      setStatus(pendingRef.current.size > 0 ? 'saving' : 'saved');
    } catch {
      // 실패한 값은 되돌려 놓고(그 사이 더 새 값이 있으면 그걸 유지) 잠시 뒤 다시 시도
      entries.forEach(([k, v]) => { if (!pendingRef.current.has(k)) pendingRef.current.set(k, v); });
      setStatus('error');
      timerRef.current = setTimeout(() => { void flush(); }, RETRY_DELAY_MS);
    }
  }, []);

  const answerCtx = useMemo<AnswerCtx | null>(() => {
    if (!answers) return null;
    return {
      readOnly: !answers.save,
      version,
      get: (k) => valuesRef.current[ordinalRef.current.get(k) ?? k] ?? '',
      set: (k, v) => {
        const sk = ordinalRef.current.get(k) ?? k;
        valuesRef.current[sk] = v;
        pendingRef.current.set(sk, v);
        setStatus('saving');
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { void flush(); }, SAVE_DELAY_MS);
      },
    };
    // answers 객체는 렌더마다 새로 만들어질 수 있어 유무(load/save 존재)만 의존성으로 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!answers, !!answers?.save, version, flush]);

  useEffect(() => {
    const cfg = cfgRef.current;
    if (!cfg) return;
    let cancelled = false;
    cfg.load()
      .then(res => {
        if (cancelled) return;
        // 불러오는 사이 이미 입력한 값은 덮어쓰지 않는다
        valuesRef.current = { ...(res || {}), ...valuesRef.current };
        setVersion(v => v + 1);
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, []);

  // 창을 닫거나 나갈 때 아직 저장 안 된 입력을 마저 저장
  useEffect(() => {
    const onHide = () => { void flush(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  const components = useMemo(() => (answers ? buildAnswerComponents(mdComponents) : mdComponents), [!!answers, mdComponents]);
  // 상태 표시(저장 중/저장됨)로 다시 그려져도 마크다운은 다시 파싱하지 않도록 엘리먼트를 고정
  const markdown = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {content}
      </ReactMarkdown>
    ),
    [content, components]
  );

  // 본문이 그려진 뒤 입력칸을 문서 순서대로 세어 순번 키를 만들고, 입력칸들이 값을 다시 읽게 한다
  useLayoutEffect(() => {
    if (!answers) return;
    const next = new Map<string, string>();
    articleRef.current?.querySelectorAll<HTMLElement>('[data-fkey]').forEach((el, i) => {
      const k = el.getAttribute('data-fkey');
      if (k) next.set(k, `f${i + 1}`);
    });
    ordinalRef.current = next;
    setVersion(v => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, !!answers]);

  // 전체화면 뷰어가 열려 있는 동안 뒤 페이지 스크롤을 잠가 스크롤바가 이중으로 보이지 않게 한다
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => { html.style.overflow = prevHtml; document.body.style.overflow = prevBody; };
  }, []);

  // 렌더된 본문에서 h1/h2를 모아 id를 붙이고 목차를 만든다(토글 안 제목은 제외)
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const heads = Array.from(root.querySelectorAll<HTMLElement>('h1, h2')).filter(h => !h.closest('details'));
    const items: TocItem[] = heads.map((h, i) => {
      const id = `student-material-sec-${i}`;
      h.id = id;
      h.style.scrollMarginTop = '16px';
      return { id, text: (h.textContent || '').trim(), level: (h.tagName === 'H1' ? 1 : 2) as 1 | 2 };
    }).filter(it => it.text);
    setToc(items);
    setActiveId(items[0]?.id || '');

    // 단계 묶음 — 제목(h1/h2)마다 새 단계를 시작하되, 아직 본문이 없는 `#` 제목이나 첫 제목 앞 안내문은 다음 단계에 합친다
    const isHead = (el: Element) => el.tagName === 'H1' || el.tagName === 'H2';
    const next: HTMLElement[][] = [];
    let cur: HTMLElement[] = [];
    let hasHead = false, hasH2 = false, bodyAfterHead = false;
    Array.from(root.children).forEach(node => {
      const el = node as HTMLElement;
      if (isHead(el)) {
        if (cur.length > 0 && hasHead && (hasH2 || bodyAfterHead)) {
          next.push(cur);
          cur = [];
          hasHead = false; hasH2 = false; bodyAfterHead = false;
        }
        hasHead = true;
        if (el.tagName === 'H2') hasH2 = true;
      } else if (hasHead) {
        bodyAfterHead = true;
      }
      cur.push(el);
    });
    if (cur.length > 0) next.push(cur);

    const idOfStep = new Map<Element, number>();
    next.forEach((g, i) => g.forEach(el => idOfStep.set(el, i)));
    const map: Record<string, number> = {};
    items.forEach(it => {
      let a: HTMLElement | null = document.getElementById(it.id);
      while (a && a.parentElement !== root) a = a.parentElement;
      const idx = a ? idOfStep.get(a) : undefined;
      if (idx !== undefined) map[it.id] = idx;
    });
    setGroups(next);
    setStepOf(map);
    setStepLabels(next.map((g, i) => {
      const h = g.find(e => e.tagName === 'H2') || g.find(e => e.tagName === 'H1');
      return (h?.textContent || '').trim() || `${i + 1}단계`;
    }));
    setStep(0);
  }, [content]);

  const canStep = groups.length >= 2;
  const stepCount = groups.length + (hasRelated ? 1 : 0);
  const stepping = stepMode && canStep;

  // 단계별 보기일 때 현재 단계만 보이게 한다(전체 보기면 모두 보임)
  useLayoutEffect(() => {
    groups.forEach((g, i) => {
      const show = !stepping || i === step;
      g.forEach(el => { el.style.display = show ? '' : 'none'; });
    });
    if (relatedRef.current) relatedRef.current.style.display = !stepping || step === groups.length ? '' : 'none';
  }, [groups, stepping, step, hasRelated]);

  const goStep = (n: number) => {
    setStep(Math.max(0, Math.min(stepCount - 1, n)));
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const switchMode = (toStep: boolean) => {
    if (toStep === stepMode) return;
    if (toStep) {
      setStep(activeId === RELATED_ID ? groups.length : (stepOf[activeId] ?? 0));
      setStepMode(true);
      scrollRef.current?.scrollTo({ top: 0 });
    } else {
      const target = step < groups.length ? groups[step]?.[0] : relatedRef.current;
      setStepMode(false);
      requestAnimationFrame(() => target?.scrollIntoView({ block: 'start' }));
    }
  };

  const handleScroll = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc || stepping) return;
    const top = sc.getBoundingClientRect().top;
    const ids = [...toc.map(t => t.id), ...(hasRelated ? [RELATED_ID] : [])];
    let current = ids[0] || '';
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top - top <= 120) current = id;
    }
    // 맨 아래까지 내렸으면 마지막 항목을 활성으로
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4 && ids.length) current = ids[ids.length - 1];
    setActiveId(current);
  }, [toc, hasRelated, stepping]);

  const goTo = (id: string) => {
    if (stepping) {
      const n = id === RELATED_ID ? groups.length : stepOf[id];
      if (n !== undefined) goStep(n);
      if (window.innerWidth < 1024) setTocOpen(false);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.innerWidth < 1024) setTocOpen(false);
  };

  const toggleToc = () => {
    setTocOpen(prev => {
      const next = !prev;
      if (window.innerWidth >= 1024) { try { localStorage.setItem(TOC_PREF_KEY, next ? '1' : '0'); } catch { /* 무시 */ } }
      return next;
    });
  };

  const hasH1 = toc.some(t => t.level === 1);
  const entries: { id: string; text: string; indent: boolean; icon?: boolean }[] = [
    ...toc.map(t => ({ id: t.id, text: t.text, indent: t.level === 2 && hasH1 })),
    ...(hasRelated ? [{ id: RELATED_ID, text: '이 차시 관련 자료', indent: false, icon: true }] : []),
  ];

  // 단계별 보기에서는 지금 단계의 마지막 제목(`##`)을 강조
  const shownActiveId = stepping
    ? (step === groups.length ? RELATED_ID : ([...toc].reverse().find(t => stepOf[t.id] === step)?.id ?? ''))
    : activeId;

  const tocList = (
    <nav aria-label="목차" className="space-y-1">
      {entries.map(e => (
        <button
          key={e.id}
          onClick={() => goTo(e.id)}
          className={`w-full text-left rounded-xl px-3 py-2.5 text-[15px] leading-snug font-bold transition-colors flex items-start gap-2 ${e.indent ? 'pl-6' : ''} ${
            shownActiveId === e.id ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          {e.icon && <Paperclip size={15} className="shrink-0 mt-0.5" />}
          <span className="min-w-0 break-words">{e.text}</span>
        </button>
      ))}
    </nav>
  );

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col h-[100dvh]">
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3 bg-slate-800 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-800 font-black text-base hover:bg-slate-100 active:scale-95 transition-all shadow shrink-0"
        >
          <ArrowLeft size={17} /> 나가기
        </button>
        <div className="flex items-center gap-2 ml-1 min-w-0 flex-1">
          <Eye size={17} className="text-white/60 shrink-0" />
          <span className="font-black text-base text-white/90 truncate">{title}</span>
        </div>
        {answers?.save && !previewOnly && status !== 'idle' && (
          <span
            className={`flex items-center gap-1.5 text-sm font-black shrink-0 ${status === 'error' ? 'text-red-300' : status === 'saved' ? 'text-emerald-300' : 'text-white/70'}`}
            role="status"
          >
            {status === 'saving' && <><Loader2 size={15} className="animate-spin" /> 저장 중…</>}
            {status === 'saved' && <><Check size={15} /> 저장됨</>}
            {status === 'error' && <><AlertCircle size={15} /> 저장 실패, 다시 시도 중</>}
          </span>
        )}
        {teacherTools && <TeacherPageTools scrollRef={scrollRef} />}
        <ActivityLinksButton links={links} dark />
        {canStep && (
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/10 shrink-0" role="group" aria-label="보기 방식">
            {([false, true] as const).map(toStep => (
              <button
                key={String(toStep)}
                onClick={() => switchMode(toStep)}
                aria-pressed={stepping === toStep}
                title={toStep ? '한 단계씩 보기' : '전체 한 번에 보기'}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg font-black text-sm sm:text-base transition-all ${
                  stepping === toStep ? 'bg-white text-slate-800' : 'text-white/80 hover:bg-white/15'
                }`}
              >
                {toStep ? <Layers size={17} /> : <ScrollText size={17} />}
                <span className="hidden sm:inline">{toStep ? '단계별' : '전체'}</span>
              </button>
            ))}
          </div>
        )}
        {entries.length > 0 && (
          <button
            onClick={toggleToc}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 text-white font-black text-base hover:bg-white/20 active:scale-95 transition-all shrink-0"
            aria-expanded={tocOpen}
            title={tocOpen ? '목차 접기' : '목차 펼치기'}
          >
            {tocOpen ? <PanelRightClose size={18} /> : <ListTree size={18} />}
            <span className="hidden sm:inline">목차</span>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex relative">
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
            <div ref={articleRef}>
              <AnswerContext.Provider value={answerCtx}>
                {markdown}
              </AnswerContext.Provider>
            </div>

            <MaterialAttachments attachments={attachments} />

            {hasRelated && (
              <section id={RELATED_ID} ref={relatedRef} className="mt-14 pt-8 border-t-2 border-surface-container" style={{ scrollMarginTop: '16px' }}>
                <h2 className="text-2xl sm:text-3xl font-black mb-2 flex items-center gap-2.5">
                  <Paperclip size={26} className="text-primary shrink-0" /> 이 차시 관련 자료
                </h2>
                <p className="text-base text-on-surface-variant font-bold mb-5">선생님이 이 차시에 함께 등록한 자료예요.</p>
                <div className="space-y-3">
                  {extraItems.map(it => {
                    const isQuiz = it.kind === 'quiz';
                    const tone = isQuiz ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600';
                    const btnCls = `px-5 py-3 rounded-xl font-black text-sm shrink-0 transition-all ${isQuiz ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white' : 'bg-blue-600 text-white'}`;
                    return (
                      <div key={it.key} className={`flex items-center gap-4 p-4 rounded-2xl border-2 ${it.ready ? (isQuiz ? 'bg-purple-50/50 border-purple-200' : 'bg-blue-50/50 border-blue-200') : 'bg-white border-surface-container'}`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                          {isQuiz ? <Gamepad2 size={22} /> : <StickyNote size={22} />}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="font-black text-lg leading-snug break-words">{isQuiz ? '퀴즈' : '보드'}: {it.title}</p>
                          <p className={`text-sm font-bold mt-0.5 ${it.ready ? (isQuiz ? 'text-purple-600' : 'text-blue-600') : 'text-on-surface-variant/60'}`}>{it.note}</p>
                        </div>
                        {it.ready && (it.href
                          ? <a href={it.href} target="_blank" rel="noopener noreferrer" className={btnCls}>열기</a>
                          : <button onClick={it.onClick} className={btnCls}>참여하기</button>)}
                      </div>
                    );
                  })}
                  {relatedMaterials.map(mat => {
                    const isLink = mat.type === 'link';
                    const href = isLink ? (mat.url?.startsWith('http') ? mat.url : `https://${mat.url}`) : undefined;
                    const inner = (
                      <>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isLink ? 'bg-cyan-100 text-cyan-600' : 'bg-amber-100 text-amber-600'}`}>
                          {isLink ? <Link2 size={22} /> : <File size={22} />}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="font-black text-lg leading-snug break-words">{mat.title}</p>
                          <p className="text-sm text-on-surface-variant font-medium truncate mt-0.5">{isLink ? mat.url : mat.file_name}</p>
                        </div>
                      </>
                    );
                    const cardCls = 'flex items-center gap-4 p-4 bg-white rounded-2xl border-2 border-surface-container hover:border-primary/40 hover:shadow-sm transition-all';
                    return isLink ? (
                      <a key={mat.id} href={href} target="_blank" rel="noopener noreferrer" className={cardCls}>
                        {inner}
                        <ExternalLink size={20} className="shrink-0 text-on-surface-variant" />
                      </a>
                    ) : (
                      <div key={mat.id} className={cardCls}>
                        <button onClick={() => onOpenFile?.(mat, false)} className="flex items-center gap-4 flex-1 min-w-0">{inner}</button>
                        <button
                          onClick={() => onOpenFile?.(mat, true)}
                          className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all shrink-0"
                          title="다운로드"
                        >
                          <Download size={20} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            {stepping && (
              <div className="mt-10 pt-6 border-t-2 border-surface-container flex items-stretch gap-3">
                <button
                  onClick={() => goStep(step - 1)}
                  disabled={step === 0}
                  className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-surface-container font-black text-base text-on-surface hover:border-primary/40 hover:bg-primary/5 disabled:opacity-30 disabled:pointer-events-none transition-all text-left"
                >
                  <ChevronLeft size={20} className="shrink-0" />
                  <span className="min-w-0"><span className="block text-xs text-on-surface-variant">이전 단계</span><span className="block truncate">{step > 0 ? (stepLabels[step - 1] ?? '') : ''}</span></span>
                </button>
                <span className="self-center shrink-0 text-sm font-black text-on-surface-variant">{step + 1} / {stepCount}</span>
                <button
                  onClick={() => goStep(step + 1)}
                  disabled={step >= stepCount - 1}
                  className="flex-1 min-w-0 flex items-center justify-end gap-2 px-4 py-3 rounded-2xl bg-primary text-white font-black text-base hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none transition-all text-right"
                >
                  <span className="min-w-0"><span className="block text-xs text-white/70">다음 단계</span><span className="block truncate">{step + 1 < stepCount ? (step + 1 < groups.length ? (stepLabels[step + 1] ?? '') : '이 차시 관련 자료') : ''}</span></span>
                  <ChevronRight size={20} className="shrink-0" />
                </button>
              </div>
            )}
            <div className="h-16" />
          </div>
        </div>

        {/* 데스크톱: 오른쪽 목차 */}
        {tocOpen && entries.length > 0 && (
          <aside className="hidden lg:block w-80 shrink-0 border-l border-surface-container bg-surface-container-lowest overflow-y-auto overscroll-contain p-5">
            <p className="text-sm font-black text-on-surface-variant/60 tracking-wide mb-3 px-1">목차</p>
            {tocList}
          </aside>
        )}

        {/* 모바일/태블릿: 상단 버튼으로 여는 목차 패널 */}
        {tocOpen && entries.length > 0 && (
          <div className="lg:hidden absolute inset-x-3 top-3 z-10 max-h-[70%] overflow-y-auto overscroll-contain rounded-2xl bg-white border border-surface-container shadow-2xl p-4">
            <p className="text-sm font-black text-on-surface-variant/60 tracking-wide mb-2 px-1">목차</p>
            {tocList}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default StudentMaterialPage;
