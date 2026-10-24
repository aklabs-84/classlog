import { useEffect, useRef, useState } from 'react';
import { FileCode, Link2, FileArchive, FileText, Inbox } from 'lucide-react';
import { getViewerKind } from '../classroom/SubmissionViewerModal';

export interface ThumbSource {
  id: string;
  created_at: string;
  image_urls?: string[] | null;
  file_url?: string | null;
  link_url?: string | null;
  display_name?: string | null;
  storage_path?: string | null;
}

export interface ThumbTarget {
  /** image·html은 진짜 미리보기, 나머지는 같은 크기의 안내 칸 */
  kind: 'image' | 'html' | 'link' | 'zip' | 'file' | 'none';
  url: string;
  label?: string;
}

const MAX_HTML_BYTES = 4_000_000;

const fileNameOf = (r: ThumbSource) =>
  r.display_name || (r.storage_path ? r.storage_path.split('/').pop() : '') || 'file';

/** 카드 미리보기로 쓸 결과 하나를 고른다: ⭐ 최종 → 가장 최근. 사진 > HTML 파일. (링크·zip은 아직 미지원) */
export const pickThumb = (
  results: ThumbSource[],
  marks?: Map<string, 'final' | 'older'>,
): ThumbTarget => {
  const sorted = [...results].sort((a, b) => {
    const fa = marks?.get(a.id) === 'final' ? 1 : 0;
    const fb = marks?.get(b.id) === 'final' ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  for (const r of sorted) {
    if (r.image_urls && r.image_urls.length > 0) return { kind: 'image', url: r.image_urls[0] };
    if (r.file_url && getViewerKind(fileNameOf(r)) === 'web-html') return { kind: 'html', url: r.file_url, label: fileNameOf(r) };
  }
  // 진짜 미리보기가 없으면 종류만 알려 주는 안내 칸 (카드 크기를 맞추기 위해 항상 칸을 둔다)
  for (const r of sorted) {
    if (r.link_url) {
      let host = r.link_url;
      try { host = new URL(r.link_url).hostname.replace(/^www\./, ''); } catch { /* 주소 그대로 */ }
      return { kind: 'link', url: r.link_url, label: host };
    }
    if (r.file_url) {
      const name = fileNameOf(r);
      return { kind: getViewerKind(name) === 'web-zip' ? 'zip' : 'file', url: r.file_url, label: name };
    }
  }
  return { kind: 'none', url: '' };
};

/** 화면에 보일 때만 HTML을 불러와, 격리된 작은 창(스크립트만 허용)으로 축소해서 보여준다 */
const HtmlThumb = ({ url, label }: { url: string; label?: string }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    ro.observe(el);
    setScale(el.clientWidth / 1280);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (cancelled) return;
        if (!res.ok || text.length > MAX_HTML_BYTES) { setFailed(true); return; }
        setHtml(text);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [visible, url]);

  return (
    <div ref={boxRef} className="relative w-full aspect-video overflow-hidden rounded-lg bg-slate-100 border border-slate-200 pointer-events-none">
      {html && !failed ? (
        <iframe
          title="결과 미리보기"
          srcDoc={html}
          sandbox="allow-scripts"
          tabIndex={-1}
          loading="lazy"
          style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-slate-400">
          <FileCode size={22} />
          {failed && label && <span className="text-[13px] font-bold truncate max-w-full">{label}</span>}
          {failed && <span className="text-[13px]">파일이 커서 미리보기 생략 · 바로 열기로 확인</span>}
        </div>
      )}
    </div>
  );
};

const PLACEHOLDER: Record<string, { icon: typeof Link2; text: string }> = {
  link: { icon: Link2, text: '링크 제출' },
  zip: { icon: FileArchive, text: 'zip 파일 제출' },
  file: { icon: FileText, text: '파일 제출' },
  none: { icon: Inbox, text: '제출 없음' },
};

const ResultThumb = ({ target, className = '' }: { target: ThumbTarget; className?: string }) => {
  if (target.kind === 'image') {
    return (
      <div className={`w-full aspect-video overflow-hidden rounded-lg bg-slate-100 border border-slate-200 ${className}`}>
        <img src={target.url} alt="결과 미리보기" loading="lazy" className="w-full h-full object-cover" />
      </div>
    );
  }
  if (target.kind === 'html') return <div className={className}><HtmlThumb url={target.url} label={target.label} /></div>;
  const ph = PLACEHOLDER[target.kind];
  const Icon = ph.icon;
  return (
    <div className={`w-full aspect-video rounded-lg border flex flex-col items-center justify-center gap-1 px-3 ${target.kind === 'none' ? 'bg-slate-50 border-dashed border-slate-200 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-500'} ${className}`}>
      <Icon size={22} />
      <span className="text-[13px] font-bold">{ph.text}</span>
      {target.label && <span className="text-[13px] truncate max-w-full">{target.label}</span>}
    </div>
  );
};

export default ResultThumb;
