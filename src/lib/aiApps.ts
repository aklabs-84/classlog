// AIServiceHub 공개 앱 목록/상세 조회
// 실제 AIServiceHub 호출은 /api/ai-service 서버 프록시가 대신 수행한다 (API 키 노출 방지).

export interface AiAppUrl {
  url: string;
  label: string;
}

export interface AiApp {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  appUrls: AiAppUrl[];
  price: number;
  isPaid: boolean;
  likeCount: number;
  createdAt: string;
  gateMode?: boolean; // 입장권으로만 열리는 앱이면 true (열 때 입장권을 받아야 함)
}

export interface GetAiAppsOptions {
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function getAiApps(options: GetAiAppsOptions = {}): Promise<AiApp[]> {
  const params = new URLSearchParams({ resource: 'apps' });
  if (options.category) params.set('category', options.category);
  if (options.tag) params.set('tag', options.tag);
  if (options.limit != null) params.set('limit', String(options.limit));
  if (options.offset != null) params.set('offset', String(options.offset));

  const res = await fetch(`/api/ai-service?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'AI 앱 목록을 불러오지 못했습니다.');
  }
  return data.apps as AiApp[];
}

export async function getAiAppById(id: string): Promise<AiApp | null> {
  const res = await fetch(`/api/ai-service?resource=apps&id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'AI 앱 정보를 불러오지 못했습니다.');
  }
  return data.app as AiApp;
}

// ── 선생님 화면용: 입장권 모드 앱 열기 ─────────────────────────────
// 선생님이 수업 자료 미리보기·발표 화면 등에서 연결 링크를 누를 때, 입장권 모드 앱이면 로그인 정보로 입장권을 받아 연다.
let appsCache: Promise<AiApp[]> | null = null;
export function getAiAppsCached(): Promise<AiApp[]> {
  if (!appsCache) {
    appsCache = getAiApps({ limit: 100 }).catch((e) => { appsCache = null; throw e; });
  }
  return appsCache;
}

const urlKey = (raw: string) => {
  try { const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); return `${u.origin}${u.pathname.replace(/\/+$/, '')}`; } catch { return ''; }
};

export function findGatedApp(apps: AiApp[], rawUrl: string): AiApp | undefined {
  const k = urlKey(rawUrl);
  if (!k) return undefined;
  return apps.find((a) => a.gateMode && a.appUrls?.some((x) => urlKey(x.url) === k));
}

// 팝업 차단을 피하려고 빈 창을 먼저 열고, 입장권을 받아 오면 그 창의 주소를 바꾼다
export async function openGatedAppAsTeacher(rawUrl: string, appId: string, accessToken: string | undefined): Promise<boolean> {
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  try {
    if (!accessToken) throw new Error('no session');
    const res = await fetch('/api/ai-service?resource=ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ app_id: appId }),
    });
    if (!res.ok) throw new Error(`ticket ${res.status}`);
    const { ticket } = await res.json();
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    if (ticket) u.searchParams.set('t', ticket);
    if (win) win.location.href = u.toString(); else window.location.href = u.toString();
    return true;
  } catch {
    win?.close();
    return false;
  }
}
