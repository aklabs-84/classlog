// AIServiceHub 공개 프롬프트 목록/상세 조회
// 실제 AIServiceHub 호출은 /api/ai-prompts 서버 프록시가 대신 수행한다 (API 키 노출 방지).

export interface AiPrompt {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  thumbnailUrl: string | null;
  promptContent: string | null; // 유료 프롬프트는 AIServiceHub 쪽에서 null로 내려옴
  price: number;
  isPaid: boolean;
  likeCount: number;
  createdAt: string;
}

export interface GetAiPromptsOptions {
  category?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function getAiPrompts(options: GetAiPromptsOptions = {}): Promise<AiPrompt[]> {
  const params = new URLSearchParams();
  if (options.category) params.set('category', options.category);
  if (options.tag) params.set('tag', options.tag);
  if (options.limit != null) params.set('limit', String(options.limit));
  if (options.offset != null) params.set('offset', String(options.offset));

  const query = params.toString();
  const res = await fetch(`/api/ai-prompts${query ? `?${query}` : ''}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'AI 프롬프트 목록을 불러오지 못했습니다.');
  }
  return data.prompts as AiPrompt[];
}

export async function getAiPromptById(id: string): Promise<AiPrompt | null> {
  const res = await fetch(`/api/ai-prompts?id=${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'AI 프롬프트 정보를 불러오지 못했습니다.');
  }
  return data.prompt as AiPrompt;
}
