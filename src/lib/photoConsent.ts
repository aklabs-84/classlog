import { supabase } from './supabase';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/photo-consent`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ConsentKey { id: string; class_id: string; token: string; is_active: boolean }
export interface ConsentRow {
  id: string;
  student_id: string | null;
  student_name: string;
  signer_name: string;
  signer_relation: 'guardian' | 'self';
  consent_record: boolean;
  consent_promo: boolean;
  signature: string;
  signed_at: string;
  withdrawn_at: string | null;
}

export const buildConsentLink = (token: string) => `${window.location.origin}/photo-consent/${token}`;

const newToken = () => {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
};

export async function getConsentKey(classId: string): Promise<ConsentKey | null> {
  const { data, error } = await supabase.from('class_consent_keys').select('id, class_id, token, is_active').eq('class_id', classId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createOrRotateConsentKey(teacherId: string, classId: string): Promise<ConsentKey> {
  const token = newToken();
  const existing = await getConsentKey(classId);
  if (existing) {
    const { data, error } = await supabase.from('class_consent_keys')
      .update({ token, is_active: true, rotated_at: new Date().toISOString() }).eq('id', existing.id)
      .select('id, class_id, token, is_active').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('class_consent_keys')
    .insert({ teacher_id: teacherId, class_id: classId, token }).select('id, class_id, token, is_active').single();
  if (error) throw error;
  return data;
}

export async function setConsentKeyActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('class_consent_keys').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function fetchConsents(classId: string): Promise<ConsentRow[]> {
  const { data, error } = await supabase.from('class_photo_consents')
    .select('id, student_id, student_name, signer_name, signer_relation, consent_record, consent_promo, signature, signed_at, withdrawn_at')
    .eq('class_id', classId).order('signed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConsentRow[];
}

export async function withdrawConsent(id: string, withdrawn: boolean): Promise<void> {
  const { error } = await supabase.from('class_photo_consents').update({ withdrawn_at: withdrawn ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}

// ── 비로그인(서명하는 사람) 쪽 ──
const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' };

export async function checkConsentLink(token: string): Promise<{ class_name: string } | null> {
  try {
    const res = await fetch(FN_URL, { method: 'POST', headers, body: JSON.stringify({ token }) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function submitConsent(payload: {
  token: string; student_name: string; signer_name: string; relation: 'guardian' | 'self';
  consent_record: boolean; consent_promo: boolean; signature: string;
}): Promise<void> {
  const res = await fetch(FN_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    let code = '';
    try { code = (await res.json()).error; } catch { /* noop */ }
    throw new Error(
      code === 'invalid_link' ? '링크가 꺼졌거나 바뀌었어요. 선생님께 새 링크를 받아 주세요.'
      : code === 'daily_limit' ? '오늘 받을 수 있는 서명 수를 넘었어요. 내일 다시 시도해 주세요.'
      : '제출하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
    );
  }
}
