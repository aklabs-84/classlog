import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ArrowLeft, Eye, ListTree, PanelRightClose, Link2, File, ExternalLink, Download, Paperclip } from 'lucide-react';
import ActivityLinksButton, { type ActivityLink } from './ActivityLinksButton';

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

interface Props {
  title: string;
  content: string;
  links?: ActivityLink[];
  mdComponents: any;
  relatedMaterials?: RelatedMaterial[];
  onOpenFile?: (mat: RelatedMaterial, download: boolean) => void;
  onClose: () => void;
}

const RELATED_ID = 'student-material-related';
const TOC_PREF_KEY = 'studentMaterialTocOpen';

const readTocPref = (): boolean => {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  if (!isDesktop) return false;
  try { return localStorage.getItem(TOC_PREF_KEY) !== '0'; } catch { return true; }
};

const StudentMaterialPage = ({ title, content, links, mdComponents, relatedMaterials = [], onOpenFile, onClose }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [tocOpen, setTocOpen] = useState<boolean>(readTocPref);

  const hasRelated = relatedMaterials.length > 0;

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
  }, [content]);

  const handleScroll = useCallback(() => {
    const sc = scrollRef.current;
    if (!sc) return;
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
  }, [toc, hasRelated]);

  const goTo = (id: string) => {
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

  const tocList = (
    <nav aria-label="목차" className="space-y-1">
      {entries.map(e => (
        <button
          key={e.id}
          onClick={() => goTo(e.id)}
          className={`w-full text-left rounded-xl px-3 py-2.5 text-[15px] leading-snug font-bold transition-colors flex items-start gap-2 ${e.indent ? 'pl-6' : ''} ${
            activeId === e.id ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
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
        <ActivityLinksButton links={links} dark />
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                {content}
              </ReactMarkdown>
            </div>

            {hasRelated && (
              <section id={RELATED_ID} className="mt-14 pt-8 border-t-2 border-surface-container" style={{ scrollMarginTop: '16px' }}>
                <h2 className="text-2xl sm:text-3xl font-black mb-2 flex items-center gap-2.5">
                  <Paperclip size={26} className="text-primary shrink-0" /> 이 차시 관련 자료
                </h2>
                <p className="text-base text-on-surface-variant font-bold mb-5">선생님이 이 차시에 함께 등록한 자료예요.</p>
                <div className="space-y-3">
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
