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
