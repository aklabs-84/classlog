import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { getAiApps, type AiApp } from '../../lib/aiApps';

export default function AiServiceCatalog() {
  const [apps, setApps] = useState<AiApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAiApps({ category: 'education', limit: 12 })
      .then((data) => { if (!cancelled) setApps(data); })
      .catch((err) => { if (!cancelled) setError(err?.message ?? '불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-on-surface-variant">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-6 text-center text-sm font-bold text-on-surface-variant">
        {error}
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center text-sm font-bold text-on-surface-variant">
        아직 등록된 체험 활동이 없습니다.
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {apps.map((app) => {
        const url = app.appUrls[0]?.url;
        return (
          <a
            key={app.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`glass rounded-2xl border border-white/40 overflow-hidden group transition-transform ${url ? 'hover:-translate-y-0.5' : 'pointer-events-none opacity-60'}`}
          >
            {app.thumbnailUrl && (
              <div className="aspect-video w-full overflow-hidden bg-surface-container">
                <img
                  src={app.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
            )}
            <div className="p-4 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-black text-sm text-on-surface leading-snug">{app.name}</h3>
                {url && <ExternalLink size={14} className="shrink-0 mt-0.5 text-on-surface-variant" />}
              </div>
              <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                {app.description}
              </p>
            </div>
          </a>
        );
      })}
    </div>
  );
}
