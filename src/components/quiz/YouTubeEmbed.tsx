// 실시간 퀴즈 문제용 유튜브 영상: 링크에서 영상 ID만 뽑아 저장하고, 재생은 개인정보 보호 도메인(youtube-nocookie)으로 임베드

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// watch / youtu.be / shorts / embed 링크 또는 11자리 ID 자체에서 영상 ID 추출. 실패 시 null
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (YT_ID_RE.test(raw)) return raw;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
        id = m ? m[1] : null;
      }
    }
    return id && YT_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

interface Props {
  videoId: string;
  start?: number | null;
  end?: number | null;
  className?: string;
}

export const YouTubeEmbed = ({ videoId, start, end, className = '' }: Props) => {
  if (!YT_ID_RE.test(videoId)) return null;
  const params = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1' });
  if (start != null && start > 0) params.set('start', String(Math.floor(start)));
  if (end != null && end > 0) params.set('end', String(Math.floor(end)));
  return (
    <div className={`relative w-full aspect-video rounded-xl overflow-hidden bg-black ${className}`}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`}
        title="문제 영상"
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
};
