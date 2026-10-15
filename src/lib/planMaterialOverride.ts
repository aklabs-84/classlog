import { supabase } from './supabase';

// 학교 프로젝트 담당 강사의 "내 수업용 주차 자료 복사본" 도구 모음.
// 구조: 원본(관리자 자료)은 그대로 두고, 강사 반(class_id)에 plan_origin_id=원본id 인 복사본 행을 만든다.
// 주차 계획(weekly_plan)은 건드리지 않고, 읽을 때 resolveMaterial 로 "복사본이 있으면 복사본"을 쓴다.
// DB 정의: Docs/ADD_PLAN_MATERIAL_OVERRIDE.sql

// 원본/복사본 어느 쪽이든 이 도구가 다루는 최소 필드
export interface PlanMaterialRow {
  id: string;
  class_id: string | null;
  teacher_id?: string | null;
  week_number: number;
  title: string;
  content: string | null;
  ai_versions?: unknown;
  attachments?: unknown;
  activity_urls?: unknown;
  is_published?: boolean | null;
  plan_origin_id?: string | null;
  origin_synced_at?: string | null;
  origin_dismissed_at?: string | null;
  origin_backup?: OriginBackup | null;
  content_updated_at?: string | null;
  viewer_style?: string | null;
}

// 원본 반영 직전의 내 내용 1단계 백업 (되돌리기용)
export interface OriginBackup {
  title: string;
  content: string | null;
  ai_versions: unknown;
  attachments: unknown;
  activity_urls: unknown;
  saved_at: string;
}

const COPY_COLUMNS =
  'id, class_id, teacher_id, week_number, title, content, ai_versions, attachments, activity_urls, is_published, plan_origin_id, origin_synced_at, origin_dismissed_at, origin_backup, content_updated_at, viewer_style';

// 이 반의 복사본들을 "원본 id → 복사본" 지도로 가져온다
export async function fetchOverrides(classId: string): Promise<Map<string, PlanMaterialRow>> {
  const { data, error } = await supabase
    .from('class_materials')
    .select(COPY_COLUMNS)
    .eq('class_id', classId)
    .not('plan_origin_id', 'is', null);
  if (error) throw error;
  const map = new Map<string, PlanMaterialRow>();
  for (const row of (data ?? []) as PlanMaterialRow[]) {
    if (row.plan_origin_id) map.set(row.plan_origin_id, row);
  }
  return map;
}

// 읽을 때: 이 원본의 복사본이 있으면 복사본, 없으면 원본
export function resolveMaterial<T extends { id: string }>(
  original: T,
  overrides: Map<string, PlanMaterialRow>,
): T | PlanMaterialRow {
  return overrides.get(original.id) ?? original;
}

// "원본이 업데이트됐어요" 표시 여부
// 원본 내용 변경 시각이 (마지막으로 반영한 시각, "내 버전 유지"를 누른 시각) 둘 다보다 새로우면 true
export function hasOriginUpdate(
  original: Pick<PlanMaterialRow, 'content_updated_at'>,
  copy: Pick<PlanMaterialRow, 'origin_synced_at' | 'origin_dismissed_at'>,
): boolean {
  if (!original.content_updated_at) return false;
  const orig = new Date(original.content_updated_at).getTime();
  const seen = Math.max(
    copy.origin_synced_at ? new Date(copy.origin_synced_at).getTime() : 0,
    copy.origin_dismissed_at ? new Date(copy.origin_dismissed_at).getTime() : 0,
  );
  return orig > seen;
}

// "내 수업용으로 수정": 원본을 내 반으로 복사. 이미 있으면 새로 만들지 않고 기존 복사본을 돌려준다.
export async function forkPlanMaterial(params: {
  originalId: string;
  classId: string;
  teacherId: string;
}): Promise<PlanMaterialRow> {
  const { originalId, classId, teacherId } = params;

  const { data: existing, error: exErr } = await supabase
    .from('class_materials')
    .select(COPY_COLUMNS)
    .eq('class_id', classId)
    .eq('plan_origin_id', originalId)
    .maybeSingle();
  if (exErr) throw exErr;
  if (existing) return existing as PlanMaterialRow;

  const { data: orig, error: origErr } = await supabase
    .from('class_materials')
    .select('id, week_number, title, content, ai_versions, attachments, activity_urls, content_updated_at, viewer_style')
    .eq('id', originalId)
    .single();
  if (origErr) throw origErr;

  const { data: created, error: insErr } = await supabase
    .from('class_materials')
    .insert({
      class_id: classId,
      teacher_id: teacherId,
      week_number: orig.week_number,
      title: orig.title,
      content: orig.content,
      ai_versions: orig.ai_versions ?? [],
      attachments: orig.attachments ?? [],
      activity_urls: orig.activity_urls ?? [],
      viewer_style: orig.viewer_style ?? 'default',
      is_published: true,
      plan_origin_id: orig.id,
      origin_synced_at: orig.content_updated_at,
    })
    .select(COPY_COLUMNS)
    .single();
  if (insErr) throw insErr;
  return created as PlanMaterialRow;
}

// "원본으로 교체": 지금 내 내용을 백업해 두고 원본 내용으로 덮어쓴다
export async function applyOriginUpdate(copy: PlanMaterialRow): Promise<PlanMaterialRow> {
  if (!copy.plan_origin_id) throw new Error('원본이 없는 자료입니다.');

  const { data: orig, error: origErr } = await supabase
    .from('class_materials')
    .select('title, content, ai_versions, attachments, activity_urls, content_updated_at')
    .eq('id', copy.plan_origin_id)
    .single();
  if (origErr) throw origErr;

  const backup: OriginBackup = {
    title: copy.title,
    content: copy.content,
    ai_versions: copy.ai_versions ?? [],
    attachments: copy.attachments ?? [],
    activity_urls: copy.activity_urls ?? [],
    saved_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('class_materials')
    .update({
      title: orig.title,
      content: orig.content,
      ai_versions: orig.ai_versions ?? [],
      attachments: orig.attachments ?? [],
      activity_urls: orig.activity_urls ?? [],
      origin_synced_at: orig.content_updated_at,
      origin_backup: backup,
      updated_at: new Date().toISOString(),
    })
    .eq('id', copy.id)
    .select(COPY_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlanMaterialRow;
}

// "되돌리기": 원본으로 교체하기 직전의 내 내용으로 복구 (1단계만)
export async function undoOriginUpdate(copy: PlanMaterialRow): Promise<PlanMaterialRow> {
  const b = copy.origin_backup;
  if (!b) throw new Error('되돌릴 백업이 없습니다.');
  const { data, error } = await supabase
    .from('class_materials')
    .update({
      title: b.title,
      content: b.content,
      ai_versions: b.ai_versions ?? [],
      attachments: b.attachments ?? [],
      activity_urls: b.activity_urls ?? [],
      origin_backup: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', copy.id)
    .select(COPY_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlanMaterialRow;
}

// "내 버전 유지": 지금 원본 변경 시각까지는 확인했다고 기록해서 알림을 끈다 (원본이 또 바뀌면 다시 뜸)
export async function dismissOriginUpdate(copy: PlanMaterialRow, originalContentUpdatedAt: string): Promise<PlanMaterialRow> {
  const { data, error } = await supabase
    .from('class_materials')
    .update({ origin_dismissed_at: originalContentUpdatedAt })
    .eq('id', copy.id)
    .select(COPY_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlanMaterialRow;
}
