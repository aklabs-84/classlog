import { supabase } from './supabase';
import heic2any from 'heic2any';
import { compressImage } from './gallery';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gallery-upload`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type ReviewStatus = 'pending' | 'approved' | 'hidden';

export interface UploadKey {
  id: string;
  class_id: string;
  token: string;
  is_active: boolean;
}

export const buildUploadLink = (token: string) => `${window.location.origin}/gallery-upload/${token}`;

// ── 주강사(로그인) 쪽: 올리기 링크 관리 ─────────────────────────────────
export async function getUploadKey(classId: string): Promise<UploadKey | null> {
  const { data, error } = await supabase
    .from('class_gallery_upload_keys')
    .select('id, class_id, token, is_active')
    .eq('class_id', classId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const newToken = () => {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
};

// 없으면 만들고, 있으면 새 토큰으로 교체한다(이전 링크는 즉시 무효)
export async function createOrRotateUploadKey(teacherId: string, classId: string): Promise<UploadKey> {
  const token = newToken();
  const existing = await getUploadKey(classId);
  if (existing) {
    const { data, error } = await supabase
      .from('class_gallery_upload_keys')
      .update({ token, is_active: true, rotated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('id, class_id, token, is_active')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('class_gallery_upload_keys')
    .insert({ teacher_id: teacherId, class_id: classId, token })
    .select('id, class_id, token, is_active')
    .single();
  if (error) throw error;
  return data;
}

export async function setUploadKeyActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('class_gallery_upload_keys').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function setReviewStatus(ids: string[], status: ReviewStatus): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('class_gallery_items').update({ review_status: status }).in('id', ids);
  if (error) throw error;
}

// ── 보조강사(비로그인) 쪽 ──────────────────────────────────────────────
export interface LinkInfo { class_name: string; used_today: number; daily_limit: number }

const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

export async function checkUploadLink(token: string): Promise<LinkInfo | null> {
  try {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const UPLOAD_ERRORS: Record<string, string> = {
  invalid_link: '링크가 꺼졌거나 바뀌었어요. 주강사님께 새 링크를 받아 주세요.',
  daily_limit: '오늘 올릴 수 있는 장수를 모두 썼어요.',
  bad_type: '사진 파일만 올릴 수 있어요.',
  bad_size: '사진 크기가 너무 커요.',
  name_required: '이름을 먼저 적어 주세요.',
};

// 사진 한 장을 줄여서(HEIC는 JPEG로 변환 후) 올린다. 실패하면 Error(사용자용 문구)
export async function uploadViaLink(token: string, name: string, file: File, weekNumber?: number | null): Promise<void> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
  let src: File = file;
  if (isHeic) {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    src = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  }
  if (!src.type.startsWith('image/')) throw new Error(UPLOAD_ERRORS.bad_type);
  const blob = await compressImage(src);
  const form = new FormData();
  form.append('token', token);
  form.append('name', name);
  if (weekNumber != null) form.append('week_number', String(weekNumber));
  form.append('file', new File([blob], src.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }));

  const res = await fetch(FN_URL, { method: 'POST', headers, body: form });
  if (!res.ok) {
    let code = '';
    try { code = (await res.json()).error; } catch { /* noop */ }
    throw new Error(UPLOAD_ERRORS[code] ?? '올리지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}

export async function setFeatured(id: string, featured: boolean): Promise<void> {
  const { error } = await supabase.from('class_gallery_items').update({ is_featured: featured }).eq('id', id);
  if (error) throw error;
}
