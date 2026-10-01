interface MediaQuestion {
  audio_url?: string | null;
  youtube_id?: string | null;
  youtube_start?: number | null;
  youtube_end?: number | null;
  explanation_audio_url?: string | null;
  explanation_youtube_id?: string | null;
  explanation_youtube_start?: number | null;
  explanation_youtube_end?: number | null;
}

// 정답·해설 화면에 보여줄 자료: 해설용 자료가 하나라도 있으면 그것만, 없으면 문제 자료를 다시 보여줌
export function getResultMedia(q: MediaQuestion) {
  const hasExplanationMedia = !!(q.explanation_audio_url || q.explanation_youtube_id);
  return hasExplanationMedia
    ? {
        isExplanation: true,
        audioUrl: q.explanation_audio_url ?? null,
        youtubeId: q.explanation_youtube_id ?? null,
        youtubeStart: q.explanation_youtube_start ?? null,
        youtubeEnd: q.explanation_youtube_end ?? null,
      }
    : {
        isExplanation: false,
        audioUrl: q.audio_url ?? null,
        youtubeId: q.youtube_id ?? null,
        youtubeStart: q.youtube_start ?? null,
        youtubeEnd: q.youtube_end ?? null,
      };
}
