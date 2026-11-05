import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// Pro 플랜 한도 (알림 기준과 동일: 70% 노랑, 90% 빨강)
const GB = 1024 ** 3;
const DB_LIMIT = 8 * GB;
const STORAGE_LIMIT = 100 * GB;
const REQUEST_ALERT = 100000; // api/slack.ts 요청 급증 알림의 절대 하한과 동일

interface UsageStats {
  db_bytes: number;
  storage_bytes: number;
  requests: { day: string; total: number }[];
}

function colorOf(pct: number) {
  return pct >= 90 ? '#c4402f' : pct >= 70 ? '#c98a10' : '#2f8f5b';
}

function fmtBytes(b: number) {
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${Math.round(b / 1048576)} MB`;
}

function Gauge({ title, big, sub, pct }: { title: string; big: string; sub: string; pct: number }) {
  const shown = Math.min(Math.max(pct, 0), 100);
  const color = colorOf(pct);
  return (
    <div className="text-center py-2 transition-transform hover:-translate-y-1">
      <svg viewBox="0 0 120 70" className="w-full mx-auto" style={{ maxWidth: 200 }} role="img" aria-label={`${title} ${big}`}>
        <path d="M10 62A50 50 0 0 1 110 62" fill="none" stroke="#e6eae4" strokeWidth="10" strokeLinecap="round" />
        <path d="M10 62A50 50 0 0 1 110 62" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          pathLength={100} strokeDasharray={`${Math.max(shown, 0.7)} 100`} />
      </svg>
      <div className="text-3xl font-extrabold tabular-nums" style={{ color: '#1c2420' }}>{big}</div>
      <div className="font-bold text-gray-800 mt-1">{title}</div>
      <div className="text-sm text-gray-500 tabular-nums">{sub}</div>
    </div>
  );
}

export default function ServerUsagePanel() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_usage_stats');
    if (err) setError(err.message);
    else setStats(data as UsageStats);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading && !stats) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-400" size={32} /></div>;
  }
  if (error || !stats) {
    return <p className="py-10 text-center text-sm text-red-600">사용량을 불러오지 못했어요{error ? `: ${error}` : ''}</p>;
  }

  const dbPct = (stats.db_bytes / DB_LIMIT) * 100;
  const stPct = (stats.storage_bytes / STORAGE_LIMIT) * 100;
  const latest = stats.requests[stats.requests.length - 1];
  const reqPct = latest ? (latest.total / REQUEST_ALERT) * 100 : 0;
  const fmtPct = (p: number) => `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">서버 사용량</h2>
          <p className="text-sm text-gray-500">초록 70% 미만 · 노랑 70~90% · 빨강 90% 이상 (알림 기준과 같음)</p>
        </div>
        <button onClick={load} aria-label="새로고침" className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-colors">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
        <Gauge title="데이터베이스" big={fmtPct(dbPct)} sub={`${fmtBytes(stats.db_bytes)} / 8 GB`} pct={dbPct} />
        <Gauge title="파일 저장" big={fmtPct(stPct)} sub={`${fmtBytes(stats.storage_bytes)} / 100 GB`} pct={stPct} />
        <Gauge
          title={latest ? `하루 요청 수 (${latest.day.slice(5).replace('-', '/')})` : '하루 요청 수'}
          big={latest ? `${latest.total.toLocaleString()}건` : '기록 없음'}
          sub={latest ? `경보 기준 ${REQUEST_ALERT.toLocaleString()}건 대비 ${Math.round(reqPct)}%` : '매일 오전 9시 10분에 기록돼요'}
          pct={reqPct}
        />
      </div>

      {stats.requests.length > 1 && (
        <div className="border-t border-gray-200 pt-4">
          <p className="font-bold text-gray-800">하루 요청 수 (날짜별)</p>
          <p className="text-sm text-gray-500 mb-3">막대가 높을수록 그날 요청이 많았어요</p>
          <div className="flex items-end gap-2">
            {stats.requests.map(r => {
              const max = Math.max(...stats.requests.map(x => x.total));
              return (
                <div key={r.day} className="flex-1 flex flex-col items-center min-w-0">
                  <span className="text-xs text-gray-700 tabular-nums mb-1">{r.total.toLocaleString()}</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max((r.total / max) * 64, 3)}px`, background: '#2f8f5b' }} />
                  <span className="text-xs text-gray-500 tabular-nums mt-1">{r.day.slice(5).replace('-', '/')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="border-t border-gray-200 pt-4 text-sm text-gray-500">
        전송량·Vercel 비용은 직접 읽을 수 없어요 →{' '}
        <a className="text-emerald-700 underline" href="https://supabase.com/dashboard/org/_/usage" target="_blank" rel="noreferrer">Supabase 사용량 보기</a>
        {' · '}
        <a className="text-emerald-700 underline" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Vercel 비용 보기</a>
      </p>
    </div>
  );
}
