// AIServiceHub 공개 앱 API 프록시
// AIServiceHub의 x-api-key는 서버 비밀값이라 브라우저에서 직접 호출할 수 없음 →
// 클래스로그 서버에서 대신 호출해 결과만 클라이언트로 전달한다.

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const baseUrl = process.env.AISERVICEHUB_BASE_URL || 'https://ai-service-hub.vercel.app';
  const apiKey = process.env.AISERVICEHUB_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'AISERVICEHUB_API_KEY not configured on server' });
  }

  const { id, category, tag, limit, offset } = req.query;

  const upstreamUrl = new URL(
    id ? `/api/public/apps/${encodeURIComponent(String(id))}` : '/api/public/apps',
    baseUrl
  );
  if (!id) {
    if (category) upstreamUrl.searchParams.set('category', String(category));
    if (tag) upstreamUrl.searchParams.set('tag', String(tag));
    if (limit) upstreamUrl.searchParams.set('limit', String(limit));
    if (offset) upstreamUrl.searchParams.set('offset', String(offset));
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: { 'x-api-key': apiKey },
    });
    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (error: any) {
    console.error('[api/ai-apps] error:', error?.message);
    return res.status(500).json({ error: 'AIServiceHub 앱 조회 중 오류가 발생했습니다.' });
  }
}
