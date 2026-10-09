import { supabase } from './supabase';
import { getStudentLimit } from './auth';

// 학교 프로젝트 AI 도우미(FloatingCopilot) 전용 저장 함수 모음.
// SchoolProjectSchoolsPage.tsx(handleAddSchool/handleAddClass)와 SchoolPlanTab.tsx(handleSave)의 저장 방식을 그대로 따른다.
// 화면 쪽 저장 규칙이 바뀌면 이 파일도 같이 맞출 것(의도적으로 화면 코드를 건드리지 않고 복제함).
// 모든 호출은 로그인한 선생님의 권한(RLS)으로 실행되며, AI는 이 함수를 직접 호출하지 못한다 — 확인 카드의 [실행] 버튼이 호출한다.

export interface WeeklyPlanItem {
  week: number;
  topic: string;
  url?: string;
  material_id?: string;
  recap?: string[];
  requires_result?: boolean;
  requires_activity?: boolean;
}

export interface ProjectClassInfo {
  id: string;
  name: string;
  isRoot: boolean;
  studentCount: number;
}

export interface ProjectSchoolInfo {
  id: string;
  name: string;
  region: string | null;
  rootClassId: string | null;
  classes: ProjectClassInfo[];
  planWeeks: number;
}

export interface ProjectContext {
  projectId: string;
  projectName: string;
  commonPlanWeeks: number;
  schools: ProjectSchoolInfo[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
  navigateTo?: string;
}

const generateEntryCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// 이 사업의 관리자(admin_id)가 맞는지 확인 — 맞으면 사업 이름을 돌려준다.
async function assertProjectAdmin(projectId: string, userId: string): Promise<{ name: string } | null> {
  const { data } = await supabase
    .from('school_projects')
    .select('id, name, admin_id, parent_project_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!data || data.admin_id !== userId || data.parent_project_id) return null;
  return { name: data.name };
}

// 대상 학교가 이 사업에 속하고 내가 관리하는 학교인지 확인
async function assertSchoolInProject(schoolId: string, projectId: string, userId: string) {
  const { data } = await supabase
    .from('school_projects')
    .select('id, name, school_name, region, admin_id, parent_project_id')
    .eq('id', schoolId)
    .maybeSingle();
  if (!data || data.parent_project_id !== projectId || data.admin_id !== userId) return null;
  return data;
}

// AI에게 건네줄 현재 사업 상태(학교/반 목록). AI는 이 목록의 id만 골라 쓸 수 있다.
export async function loadProjectContext(projectId: string, userId: string): Promise<ProjectContext | null> {
  const project = await assertProjectAdmin(projectId, userId);
  if (!project) return null;

  const [{ data: common }, { data: schoolRows }] = await Promise.all([
    supabase.from('classes').select('weekly_plan').eq('school_project_id', projectId).is('parent_class_id', null).maybeSingle(),
    supabase.from('school_projects').select('id, name, school_name, region').eq('parent_project_id', projectId).neq('status', 'archived').order('created_at', { ascending: true }),
  ]);

  const schools = schoolRows || [];
  const schoolIds = schools.map(s => s.id);
  let classRows: any[] = [];
  if (schoolIds.length > 0) {
    const { data } = await supabase
      .from('classes')
      .select('id, name, school_project_id, parent_class_id, weekly_plan, created_at')
      .in('school_project_id', schoolIds)
      .order('created_at', { ascending: true });
    classRows = data || [];
  }

  const classIds = classRows.map(c => c.id);
  const studentCounts: Record<string, number> = {};
  if (classIds.length > 0) {
    const { data: studentRows } = await supabase.from('students').select('class_id').in('class_id', classIds);
    (studentRows || []).forEach(r => { studentCounts[r.class_id] = (studentCounts[r.class_id] || 0) + 1; });
  }

  return {
    projectId,
    projectName: project.name,
    commonPlanWeeks: Array.isArray(common?.weekly_plan) ? common!.weekly_plan.length : 0,
    schools: schools.map(s => {
      const rows = classRows.filter(c => c.school_project_id === s.id);
      const root = rows.find(c => c.parent_class_id === null) || null;
      return {
        id: s.id,
        name: s.school_name || s.name,
        region: s.region ?? null,
        rootClassId: root?.id ?? null,
        planWeeks: Array.isArray(root?.weekly_plan) ? root!.weekly_plan.length : 0,
        classes: rows.map(c => ({
          id: c.id,
          name: c.name,
          isRoot: c.parent_class_id === null,
          studentCount: studentCounts[c.id] || 0,
        })),
      };
    }),
  };
}

// AI 시스템 프롬프트에 넣을 사업 상태 텍스트. 학생 이름은 보내지 않고 인원수만 보낸다(개인정보 최소화).
export function formatProjectContextForAI(ctx: ProjectContext): string {
  const schoolLines = ctx.schools.length === 0
    ? '(아직 학교가 없습니다)'
    : ctx.schools.map(s => {
        const subs = s.classes.filter(c => !c.isRoot);
        const classText = subs.length === 0
          ? '일반 반 없음'
          : subs.map(c => `${c.name}[id:${c.id}, 학생 ${c.studentCount}명]`).join(', ');
        return `- ${s.name}[id:${s.id}]${s.region ? ` · ${s.region}` : ''} · 주차 계획 ${s.planWeeks}주차 · 반: ${classText}`;
      }).join('\n');
  return `사업 이름: ${ctx.projectName}\n사업 공통 주차 계획: ${ctx.commonPlanWeeks}주차\n학교 ${ctx.schools.length}개:\n${schoolLines}`;
}

// ── 1. 학교 + 반 만들기 ────────────────────────────────────────────────────────
export interface CreateSchoolPayload {
  name?: string;
  region?: string;
  start_date?: string;
  end_date?: string;
  class_names?: string[];
}

export async function createSchoolWithClasses(projectId: string, userId: string, payload: CreateSchoolPayload): Promise<ActionResult> {
  const name = (payload.name || '').trim();
  if (!name) return { ok: false, message: '학교 이름을 확인하지 못했어요. 다시 말씀해 주세요.' };
  if (!isDate(payload.start_date) || !isDate(payload.end_date)) return { ok: false, message: '수업 시작일과 종료일이 필요해요. 다시 말씀해 주세요.' };
  if (payload.end_date < payload.start_date) return { ok: false, message: '종료일은 시작일 이후여야 해요.' };
  const classNames = (payload.class_names || []).map(n => n.trim()).filter(n => n.length > 0);

  const project = await assertProjectAdmin(projectId, userId);
  if (!project) return { ok: false, message: '이 사업의 관리자만 학교를 추가할 수 있어요.' };

  const { data: newSchool, error: schoolErr } = await supabase
    .from('school_projects')
    .insert({
      name,
      school_name: name,
      admin_id: userId,
      parent_project_id: projectId,
      region: (payload.region || '').trim() || null,
      start_date: payload.start_date,
      end_date: payload.end_date,
      entry_code: generateEntryCode(),
      status: 'active',
    })
    .select('id')
    .single();
  if (schoolErr || !newSchool) return { ok: false, message: '학교 추가에 실패했어요. 잠시 후 다시 시도해 주세요.' };

  const { data: programRoot } = await supabase
    .from('classes')
    .select('weekly_plan')
    .eq('school_project_id', projectId)
    .is('parent_class_id', null)
    .maybeSingle();

  const { data: rootClass, error: rootErr } = await supabase
    .from('classes')
    .insert({
      name: `${name} (전체)`,
      subject: project.name,
      teacher_id: userId,
      entry_code: generateEntryCode(),
      school_project_id: newSchool.id,
      weekly_plan: programRoot?.weekly_plan || [],
    })
    .select('id')
    .single();
  if (rootErr || !rootClass) {
    // 대표 반이 없는 반쪽짜리 학교가 남지 않도록 되돌린다
    await supabase.from('school_projects').delete().eq('id', newSchool.id);
    return { ok: false, message: '학교 대표 반을 만들지 못해서 학교 추가를 취소했어요. 잠시 후 다시 시도해 주세요.' };
  }

  let created = 0;
  for (const className of classNames) {
    const { error } = await supabase.from('classes').insert({
      name: className,
      subject: project.name,
      teacher_id: userId,
      entry_code: generateEntryCode(),
      school_project_id: newSchool.id,
      parent_class_id: rootClass.id,
    });
    if (!error) created += 1;
  }

  const failed = classNames.length - created;
  return {
    ok: true,
    message: failed > 0
      ? `✅ '${name}'을(를) 만들었어요. 반은 ${created}개 만들었고 ${failed}개는 실패했어요. 학교 화면에서 부족한 반을 추가해 주세요.`
      : `✅ '${name}'을(를) 만들었어요.${created > 0 ? ` 반 ${created}개도 함께 만들었어요.` : ''}`,
    navigateTo: `/school-projects/${projectId}/schools`,
  };
}

// ── 2. 주차 계획 복사 ───────────────────────────────────────────────────────────
// 원본: 다른 학교의 계획('school') 또는 사업 공통 계획('common'). 대상: 학교 단위(그 학교의 모든 반에 적용 + 학교 단위로 고정).
export interface CopyPlanPayload {
  source?: 'common' | 'school';
  source_school_id?: string;
  target_school_ids?: string[];
}

async function readPlanOfSchool(schoolId: string): Promise<WeeklyPlanItem[] | null> {
  const { data } = await supabase
    .from('classes')
    .select('weekly_plan, parent_class_id')
    .eq('school_project_id', schoolId);
  const rows = data || [];
  const root = rows.find(r => r.parent_class_id === null) || rows[0];
  if (!root) return null;
  return Array.isArray(root.weekly_plan) ? (root.weekly_plan as WeeklyPlanItem[]) : [];
}

// 실행 전 확인 카드용: 덮어쓰게 될 반(이미 따로 고정된 계획이 있는 반) 수를 센다.
export async function previewPlanCopy(projectId: string, userId: string, payload: CopyPlanPayload): Promise<{ weeks: number; overwriteClasses: number; targetCount: number } | null> {
  const plan = await resolvePlanSource(projectId, userId, payload);
  if (!plan) return null;
  const targets = payload.target_school_ids || [];
  const { data } = await supabase
    .from('classes')
    .select('id, weekly_plan, weekly_plan_custom')
    .in('school_project_id', targets);
  const json = JSON.stringify(plan);
  const overwriteClasses = (data || []).filter(r => r.weekly_plan_custom && JSON.stringify(r.weekly_plan || []) !== json).length;
  return { weeks: plan.length, overwriteClasses, targetCount: targets.length };
}

async function resolvePlanSource(projectId: string, userId: string, payload: CopyPlanPayload): Promise<WeeklyPlanItem[] | null> {
  if (!(await assertProjectAdmin(projectId, userId))) return null;
  if (payload.source === 'school') {
    if (!payload.source_school_id || !(await assertSchoolInProject(payload.source_school_id, projectId, userId))) return null;
    return readPlanOfSchool(payload.source_school_id);
  }
  const { data } = await supabase
    .from('classes')
    .select('weekly_plan')
    .eq('school_project_id', projectId)
    .is('parent_class_id', null)
    .maybeSingle();
  return Array.isArray(data?.weekly_plan) ? (data!.weekly_plan as WeeklyPlanItem[]) : [];
}

export async function copyWeeklyPlan(projectId: string, userId: string, payload: CopyPlanPayload): Promise<ActionResult> {
  const targets = (payload.target_school_ids || []).filter(id => id !== payload.source_school_id);
  if (targets.length === 0) return { ok: false, message: '계획을 적용할 학교를 확인하지 못했어요. 다시 말씀해 주세요.' };

  const plan = await resolvePlanSource(projectId, userId, payload);
  if (!plan) return { ok: false, message: '원본 계획을 찾지 못했어요. 학교 이름을 다시 확인해 주세요.' };
  if (plan.length === 0) return { ok: false, message: '원본 계획이 비어 있어서 복사하지 않았어요.' };

  for (const id of targets) {
    if (!(await assertSchoolInProject(id, projectId, userId))) {
      return { ok: false, message: '이 사업에 속하지 않은 학교가 포함되어 있어서 중단했어요.' };
    }
  }

  // 주차 번호는 순서대로 다시 매긴다(SchoolPlanTab.handleSave와 동일). 이미 공개된 연결 자료는 그대로 참조한다.
  const cleaned = plan.map((p, i) => ({ ...p, week: i + 1 }));
  const { error } = await supabase
    .from('classes')
    .update({ weekly_plan: cleaned, weekly_plan_custom: true })
    .in('school_project_id', targets);
  if (error) return { ok: false, message: '계획을 적용하지 못했어요. 잠시 후 다시 시도해 주세요.' };

  return {
    ok: true,
    message: `✅ ${targets.length}개 학교의 모든 반에 ${cleaned.length}주차 계획을 적용했어요. (학교 단위로 고정됨)`,
    navigateTo: `/school-projects/${projectId}/schools`,
  };
}

// ── 3. 학교 통째로 복사 ─────────────────────────────────────────────────────────
// 복사: 학교 이름/지역/기간(새로 입력), 대표 반, 반 이름·과목 연결, 주차 계획, 수업 시간/알림/AI 안내 설정.
// 복사 안 함: 학생, 담당 교사, 입장 코드(새로 발급), 설문, 업로드 자료.
export interface CloneSchoolPayload {
  source_school_id?: string;
  name?: string;
  region?: string;
  start_date?: string;
  end_date?: string;
}

const CLASS_SETTING_COLUMNS = [
  'student_guide_prompt', 'teacher_report_prompt', 'min_obs_chars', 'blocked_keywords', 'ai_review_enabled',
  'class_start_time', 'class_end_time', 'end_alarm_minutes', 'break_times', 'schedule_mode', 'class_days_of_week',
] as const;

export async function cloneSchool(projectId: string, userId: string, payload: CloneSchoolPayload): Promise<ActionResult> {
  const name = (payload.name || '').trim();
  if (!name) return { ok: false, message: '새 학교 이름을 확인하지 못했어요. 다시 말씀해 주세요.' };
  if (!isDate(payload.start_date) || !isDate(payload.end_date)) return { ok: false, message: '새 학교의 수업 시작일과 종료일이 필요해요.' };
  if (payload.end_date < payload.start_date) return { ok: false, message: '종료일은 시작일 이후여야 해요.' };
  if (!(await assertProjectAdmin(projectId, userId))) return { ok: false, message: '이 사업의 관리자만 학교를 복사할 수 있어요.' };
  const source = payload.source_school_id ? await assertSchoolInProject(payload.source_school_id, projectId, userId) : null;
  if (!source) return { ok: false, message: '복사할 원본 학교를 찾지 못했어요. 학교 이름을 다시 확인해 주세요.' };

  const { data: srcClasses } = await supabase
    .from('classes')
    .select('*')
    .eq('school_project_id', source.id)
    .order('created_at', { ascending: true });
  const rows = srcClasses || [];
  const srcRoot = rows.find(r => r.parent_class_id === null);
  if (!srcRoot) return { ok: false, message: '원본 학교에 대표 반이 없어서 복사할 수 없어요.' };
  const srcSubs = rows.filter(r => r.parent_class_id === srcRoot.id);

  const { data: newSchool, error: schoolErr } = await supabase
    .from('school_projects')
    .insert({
      name,
      school_name: name,
      admin_id: userId,
      parent_project_id: projectId,
      region: (payload.region || '').trim() || null,
      start_date: payload.start_date,
      end_date: payload.end_date,
      entry_code: generateEntryCode(),
      status: 'active',
    })
    .select('id')
    .single();
  if (schoolErr || !newSchool) return { ok: false, message: '학교 복사에 실패했어요. 잠시 후 다시 시도해 주세요.' };

  const pickSettings = (row: any) => {
    const out: Record<string, unknown> = {};
    for (const col of CLASS_SETTING_COLUMNS) if (row[col] !== undefined && row[col] !== null) out[col] = row[col];
    return out;
  };

  const { data: newRoot, error: rootErr } = await supabase
    .from('classes')
    .insert({
      name: `${name} (전체)`,
      subject: srcRoot.subject,
      teacher_id: userId,
      entry_code: generateEntryCode(),
      school_project_id: newSchool.id,
      weekly_plan: srcRoot.weekly_plan || [],
      weekly_plan_custom: !!srcRoot.weekly_plan_custom,
      ...pickSettings(srcRoot),
    })
    .select('id')
    .single();
  if (rootErr || !newRoot) {
    await supabase.from('school_projects').delete().eq('id', newSchool.id);
    return { ok: false, message: '대표 반을 복사하지 못해서 학교 복사를 취소했어요. 잠시 후 다시 시도해 주세요.' };
  }

  let created = 0;
  for (const sub of srcSubs) {
    const { error } = await supabase.from('classes').insert({
      name: sub.name,
      subject: sub.subject,
      teacher_id: userId,
      entry_code: generateEntryCode(),
      school_project_id: newSchool.id,
      parent_class_id: newRoot.id,
      course_id: sub.course_id ?? null,
      weekly_plan: sub.weekly_plan || [],
      weekly_plan_custom: !!sub.weekly_plan_custom,
      ...pickSettings(sub),
    });
    if (!error) created += 1;
  }

  const failed = srcSubs.length - created;
  return {
    ok: true,
    message: failed > 0
      ? `✅ '${source.school_name || source.name}'을(를) 복사해 '${name}'을(를) 만들었어요. 반 ${created}개를 복사했고 ${failed}개는 실패했어요. 학교 화면에서 확인해 주세요.`
      : `✅ '${source.school_name || source.name}'을(를) 복사해 '${name}'을(를) 만들었어요. 반 ${created}개와 주차 계획이 복사됐어요. 학생과 담당 교사는 새로 지정해 주세요.`,
    navigateTo: `/school-projects/${projectId}/schools`,
  };
}

// ── 4. 학생 명단 등록 ───────────────────────────────────────────────────────────
// Classroom.tsx handleBulkRegister()와 같은 이름 파싱/플랜 한도. 이미 등록된 동명 학생은 건너뛰고 결과에 알린다.
export interface AddStudentsPayload {
  class_id?: string;
  names?: string[];
}

export async function addStudentsToClass(projectId: string, userId: string, profile: any, payload: AddStudentsPayload): Promise<ActionResult> {
  const names = (payload.names || []).map(n => n.trim()).filter(n => n.length > 0);
  if (!payload.class_id) return { ok: false, message: '학생을 넣을 반을 확인하지 못했어요. 어느 반인지 다시 말씀해 주세요.' };
  if (names.length === 0) return { ok: false, message: '추가할 학생 이름을 확인하지 못했어요. 다시 말씀해 주세요.' };

  // 이 사업 안의 반인지 확인
  const { data: cls } = await supabase
    .from('classes')
    .select('id, name, school_project_id')
    .eq('id', payload.class_id)
    .maybeSingle();
  if (!cls?.school_project_id || !(await assertSchoolInProject(cls.school_project_id, projectId, userId))) {
    return { ok: false, message: '이 사업에 속한 반이 아니어서 학생을 추가할 수 없어요.' };
  }

  const { data: existing } = await supabase.from('students').select('full_name').eq('class_id', cls.id);
  const existingNames = new Set((existing || []).map(s => (s.full_name || '').trim()));

  const parsed = names.map(rawText => {
    let name = rawText;
    let number: string | null = null;
    const match = rawText.match(/(\d+)번?/);
    if (match) {
      number = match[1];
      name = rawText.replace(match[0], '').trim().replace(/^[\s.\-]+|[\s.\-]+$/g, '');
    }
    return { class_id: cls.id, full_name: name, student_number: number, tag: '학생' };
  }).filter(s => s.full_name.length > 0);

  const seen = new Set<string>();
  const toInsert = parsed.filter(s => {
    const n = s.full_name.trim();
    if (existingNames.has(n) || seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  const skipped = parsed.length - toInsert.length;
  if (toInsert.length === 0) return { ok: false, message: '모두 이미 등록된 이름이라 추가하지 않았어요.' };

  const studentLimit = getStudentLimit(profile);
  const currentCount = existing?.length ?? 0;
  if (currentCount + toInsert.length > studentLimit) {
    const remaining = Math.max(0, studentLimit - currentCount);
    return { ok: false, message: `한 학급에는 최대 ${studentLimit}명까지 등록할 수 있어요.\n현재 ${currentCount}명이라 ${remaining}명만 추가할 수 있어요.` };
  }

  const { error } = await supabase.from('students').insert(toInsert);
  if (error) {
    const limitHit = typeof error.message === 'string' && error.message.includes('STUDENT_LIMIT_EXCEEDED');
    return { ok: false, message: limitHit ? `한 학급에는 최대 ${studentLimit}명까지 등록할 수 있어요.` : '학생 추가에 실패했어요. 이 반에 학생을 추가할 권한이 없을 수도 있어요.' };
  }

  return {
    ok: true,
    message: `✅ '${cls.name}'에 학생 ${toInsert.length}명을 추가했어요.${skipped > 0 ? ` (이미 있는 이름 ${skipped}명은 건너뛰었어요)` : ''}`,
    navigateTo: `/school-projects/${projectId}/schools/${cls.school_project_id}/classes/${cls.id}`,
  };
}
