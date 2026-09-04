import { useState } from 'react';
import { ExternalLink, ChevronDown } from 'lucide-react';

export interface ActivityLink {
  url: string;
  label: string;
}

// 수업 자료에 연결된 활동 앱 링크(들)를 여는 버튼.
// 1개면 바로 여는 버튼, 여러 개면 드롭다운으로 골라서 열 수 있다.
// 학생 화면, 교사 미리보기/발표/슬라이드 화면에서 공통으로 쓴다.
export default function ActivityLinksButton({ links, dark = false }: { links?: ActivityLink[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const valid = (links ?? []).filter((l) => l.url);
  if (valid.length === 0) return null;

  const toHref = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

  if (valid.length === 1) {
    return (
      <a
        href={toHref(valid[0].url)}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white font-black text-sm hover:opacity-90 active:scale-95 transition-all shadow shrink-0"
      >
        <ExternalLink size={15} /> {valid[0].label || '체험해보기'}
      </a>
    );
  }

  return (
    <div className="relative ml-auto shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white font-black text-sm hover:opacity-90 active:scale-95 transition-all shadow"
      >
        <ExternalLink size={15} /> 체험해보기 <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 top-full mt-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border shadow-2xl z-50 py-2 ${
              dark ? 'bg-[#15151f] border-white/10' : 'bg-white border-surface-container'
            }`}
          >
            {valid.map((link, i) => (
              <a
                key={i}
                href={toHref(link.url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                  dark ? 'text-white hover:bg-white/10' : 'text-on-surface hover:bg-surface-container-low'
                }`}
              >
                <ExternalLink size={14} className="shrink-0 opacity-60" />
                <span className="truncate">{link.label || link.url}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
