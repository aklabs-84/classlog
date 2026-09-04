import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X as XIcon, ImageOff, ExternalLink } from 'lucide-react';
import { getAiApps, type AiApp } from '../lib/aiApps';

// AIServiceHub에 등록된 앱 중 하나를 골라 그 웹앱 URL을 가져오는 모달.
// 수업 자료 에디터에서 "활동 앱 URL"을 직접 타이핑하는 대신 목록에서 찾아 고를 수 있게 한다.
export default function AiServiceLinkPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string, label: string) => void;
  onClose: () => void;
}) {
  const [apps, setApps] = useState<AiApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAiApps({ limit: 100 })
      .then((data) => { if (!cancelled) setApps(data.filter((a) => a.appUrls[0]?.url)); })
      .catch((err) => { if (!cancelled) setError(err?.message ?? '불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [apps, search]);

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">AIServiceHub에서 찾기</p>
            <p className="text-xs text-on-surface-variant mt-0.5">연결할 활동 앱을 검색해서 선택하세요</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0">
            <XIcon size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-surface-container shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low border border-surface-container">
            <Search size={14} className="text-on-surface-variant shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 설명, 태그로 검색"
              className="flex-1 min-w-0 bg-transparent text-sm font-bold outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-12 gap-3 opacity-60">
              <p className="font-black text-sm text-center">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 opacity-40">
              <ImageOff size={36} />
              <p className="font-black text-sm">일치하는 앱이 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((app) => (
                <button
                  key={app.id}
                  onClick={() => { onSelect(app.appUrls[0].url, app.name); onClose(); }}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-2xl hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-surface-container flex items-center justify-center">
                    {app.thumbnailUrl ? (
                      <img src={app.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff size={16} className="text-on-surface-variant/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-on-surface truncate">{app.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1 opacity-60">{app.description}</p>
                  </div>
                  <ExternalLink size={14} className="text-on-surface-variant group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
