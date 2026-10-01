import { supabase } from '../../lib/supabase';

export const QUIZ_AUDIO_MAX_BYTES = 5 * 1024 * 1024;

// 아이폰 사파리에서도 재생되는 형식만 허용 (확장자 → MIME)
const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

export type AudioUploadResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'type' | 'size' | 'upload' };

// 문제 오디오를 Supabase Storage(quiz-audio)에 올리고 public URL 반환
export async function uploadQuizAudio(file: File): Promise<AudioUploadResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = AUDIO_TYPES[ext];
  if (!contentType) return { ok: false, reason: 'type' };
  if (file.size > QUIZ_AUDIO_MAX_BYTES) return { ok: false, reason: 'size' };

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('quiz-audio')
    .upload(fileName, file, { contentType, upsert: false });
  if (error || !data) return { ok: false, reason: 'upload' };

  const { data: { publicUrl } } = supabase.storage.from('quiz-audio').getPublicUrl(data.path);
  return { ok: true, url: publicUrl };
}
