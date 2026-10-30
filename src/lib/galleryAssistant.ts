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
  allow_attendance?: boolean;
}

export const buildUploadLink = (token: string) => `${window.location.origin}/gallery-upload/${token}`;

// ── 주강사(로그인) 쪽: 올리기 링크 관리 ─────────────────────────────────
export async function getUploadKey(classId: string): Promise<UploadKey | null> {
  const { data, error } = await supabase
    .from('class_gallery_upload_keys')
    .select('id, class_id, token, is_active, allow_attendance')
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
      .select('id, class_id, token, is_active, allow_attendance')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from('class_gallery_upload_keys')
    .insert({ teacher_id: teacherId, class_id: classId, token })
    .select('id, class_id, token, is_active, allow_attendance')
    .single();
  if (error) throw error;
  return data;
}

export async function setUploadKeyActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('class_gallery_upload_keys').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function setUploadKeyAttendance(id: string, allow: boolean): Promise<void> {
  const { error } = await supabase.from('class_gallery_upload_keys').update({ allow_attendance: allow }).eq('id', id);
  if (error) throw error;
}

export async function setReviewStatus(ids: string[], status: ReviewStatus): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('class_gallery_items').update({ review_status: status }).in('id', ids);
  if (error) throw error;
}

// ── 보조강사(비로그인) 쪽 ──────────────────────────────────────────────
export interface LinkInfo { class_name: string; used_today: number; daily_limit: number; teacher?: boolean; teacher_name?: string | null; attendance_enabled?: boolean }

// 로그인해 있으면 그 정보를 함께 보내 서버가 '주강사'인지 확인하게 한다 (없으면 보조강사로 취급)
async function buildHeaders(): Promise<Record<string, string>> {
  let bearer = ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) bearer = data.session.access_token;
  } catch { /* noop */ }
  return { apikey: ANON_KEY, Authorization: `Bearer ${bearer}` };
}

export async function checkUploadLink(token: string): Promise<LinkInfo | null> {
  try {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { ...(await buildHeaders()), 'Content-Type': 'application/json' },
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
  bad_link: '유튜브·구글 드라이브·비메오 링크(https)만 올릴 수 있어요.',
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

  const res = await fetch(FN_URL, { method: 'POST', headers: await buildHeaders(), body: form });
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

// 영상 링크 한 개를 전한다. 실패하면 Error(사용자용 문구)
export async function submitVideoLink(token: string, name: string, videoUrl: string): Promise<void> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { ...(await buildHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, name, video_url: videoUrl }),
  });
  if (!res.ok) {
    let code = '';
    try { code = (await res.json()).error; } catch { /* noop */ }
    throw new Error(UPLOAD_ERRORS[code] ?? '올리지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
}

// ── 보조강사 출석 (오늘 날짜만, 주강사가 허용한 링크만) ─────────────────────
export type AttStatus = 'present' | 'absent' | 'late' | 'early_leave' | 'excused';
export interface AttendanceSnapshot {
  date: string;
  students: { id: string; full_name: string }[];
  records: { student_id: string; status: AttStatus; marked_by: string | null; marked_at: string | null }[];
}

const ATT_ERRORS: Record<string, string> = {
  attendance_off: '주강사님이 출석 기능을 꺼 두셨어요.',
  invalid_link: UPLOAD_ERRORS.invalid_link,
  name_required: UPLOAD_ERRORS.name_required,
};

async function attCall(token: string, payload: Record<string, unknown>): Promise<AttendanceSnapshot> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { ...(await buildHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...payload }),
  });
  if (!res.ok) {
    let code = '';
    try { code = (await res.json()).error; } catch { /* noop */ }
    throw new Error(ATT_ERRORS[code] ?? '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  return await res.json();
}

export const fetchAttendance = (token: string) => attCall(token, { action: 'att_get' });
export const markAttendance = (token: string, name: string, studentId: string, status: AttStatus | null) =>
  attCall(token, { action: 'att_set', name, student_id: studentId, status });
