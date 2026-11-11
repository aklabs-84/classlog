import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getAiAppsCached, findGatedApp, openGatedAppAsTeacher, type AiApp } from '../lib/aiApps';
import { ExternalLink, ChevronDown } from 'lucide-react';

export interface ActivityLink {
  url: string;
  label: string;
  gateAppId?: string; // 입장권으로만 열리는 허브 앱이면 그 앱 id (열 때 입장권을 받아와야 함)
}

// 수업 자료에 연결된 활동 앱 링크(들)를 여는 버튼.
// 1개면 바로 여는 버튼, 여러 개면 드롭다운으로 골라서 열 수 있다.
// 학생 화면, 교사 미리보기/발표/슬라이드 화면에서 공통으로 쓴다.
export default function ActivityLinksButton({ links, dark = false, onGatedOpen }: { links?: ActivityLink[]; dark?: boolean; onGatedOpen?: (link: ActivityLink) => void }) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<AiApp[]>([]);
  const valid = (links ?? []).filter((l) => l.url);
  const hasLinks = valid.length > 0;
  // 학생 화면은 onGatedOpen 으로 직접 처리한다. 그 외(선생님 미리보기·발표 등)는 여기서 입장권 모드 앱을 찾아 연다
  useEffect(() => {
    if (onGatedOpen || !hasLinks) return;
    getAiAppsCached().then(setApps).catch(() => {});
  }, [onGatedOpen, hasLinks]);
  const handleClick = (e: React.MouseEvent, link: ActivityLink) => {
    if (onGatedOpen) {
      if (link.gateAppId) { e.preventDefault(); onGatedOpen(link); }
      return;
    }
    const app = findGatedApp(apps, link.url);
    if (!app) return;
    e.preventDefault();
    supabase.auth.getSession().then(({ data }) =>
      openGatedAppAsTeacher(link.url, app.id, data.session?.access_token).then((ok) => {
        if (!ok) window.alert('앱을 여는 데 실패했어요. 로그인 상태를 확인하고 다시 눌러 주세요.');
      }),
    );
  };
  if (valid.length === 0) return null;

  const toHref = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

  if (valid.length === 1) {
    return (
      <a
        href={toHref(valid[0].url)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => handleClick(e, valid[0])}
        className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white font-black text-sm hover:opacity-90 active:scale-95 transition-all shadow shrink-0 max-w-full"
      >
        <ExternalLink size={15} className="shrink-0" /> <span className="truncate">{valid[0].label || '체험해보기'}</span>
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
                onClick={(e) => { setOpen(false); handleClick(e, link); }}
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
