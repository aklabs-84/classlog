// AI Service Hub 연동 앱을 클래스의 "메인 수업도구"로 지정할 때 공통으로 쓰는 로직.
// 1) TeachingTools.tsx의 "학습 도구" 탭에서 앱을 고르고 새 클래스를 원클릭 생성할 때
// 2) Classroom.tsx의 기존 클래스 상세 화면(선생님 자료 > 학습 도구)에서 이미 있는 클래스에 지정할 때
// 두 곳에서 함께 쓴다.
import { supabase } from './supabase';
import { isDemoTeacher } from './demo';
import { getClassLimit } from './auth';
import type { AiApp } from './aiApps';

export const PRIMARY_TOOL_AUTO_WEEKS = 4;

export interface CreateClassFromHubAppResult {
  ok: boolean;
  classId?: string;
  error?: 'demo' | 'class_limit' | 'unknown';
  message?: string;
}

// 공통 자료함(class_id가 없는 내 자료) 중 activity_urls에 이 앱 링크가 걸려있는 자료를 찾아
// 1~N주차 자료를 채운다. 이미 그 주차에 자료가 있으면 지우지 않고 앱 링크만 병합한다.
export async function linkPrimaryToolMaterials({
  classId,
  teacherId,
  app,
  existingMaterials,
}: {
  classId: string;
  teacherId: string;
  app: AiApp;
  existingMaterials?: any[];
}): Promise<void> {
  const appUrl = app.appUrls[0].url;

  const classMaterials = existingMaterials ?? (
    (await supabase.from('class_materials').select('*').eq('class_id', classId)).data ?? []
  );

  const materialsByWeek = new Map<number, any>();
  classMaterials.forEach((m: any) => {
    if (m.week_number != null && !materialsByWeek.has(m.week_number)) materialsByWeek.set(m.week_number, m);
  });

  const { data: libraryMaterials } = await supabase
    .from('class_materials')
    .select('*')
    .is('class_id', null)
    .eq('teacher_id', teacherId);
  const linkedLibraryMaterials = (libraryMaterials || [])
    .filter((m: any) => Array.isArray(m.activity_urls) && m.activity_urls.some((u: any) => u?.url === appUrl))
    .sort((a: any, b: any) => (a.week_number ?? 99) - (b.week_number ?? 99));

  const usedLibraryIds = new Set<string>();
  const pickLibraryFor = (week: number) => {
    const exact = linkedLibraryMaterials.find((m: any) => m.week_number === week && !usedLibraryIds.has(m.id));
    if (exact) { usedLibraryIds.add(exact.id); return exact; }
    const next = linkedLibraryMaterials.find((m: any) => !usedLibraryIds.has(m.id));
    if (next) { usedLibraryIds.add(next.id); return next; }
    return null;
  };

  const insertRows: any[] = [];
  const updatePromises: any[] = [];

  for (let week = 1; week <= PRIMARY_TOOL_AUTO_WEEKS; week++) {
    const existing = materialsByWeek.get(week);
    if (existing) {
      const urls = Array.isArray(existing.activity_urls) ? existing.activity_urls : [];
      if (urls.some((u: any) => u?.url === appUrl)) continue;
      updatePromises.push(
        supabase.from('class_materials').update({ activity_urls: [...urls, { url: appUrl, label: app.name }] }).eq('id', existing.id)
      );
      continue;
    }

    const fromLibrary = pickLibraryFor(week);
    if (fromLibrary) {
      const urls = Array.isArray(fromLibrary.activity_urls) ? fromLibrary.activity_urls : [];
      insertRows.push({
        class_id: classId,
        teacher_id: teacherId,
        week_number: week,
        title: fromLibrary.title,
        content: fromLibrary.content ?? '',
        ai_versions: fromLibrary.ai_versions ?? [],
        activity_urls: urls.some((u: any) => u?.url === appUrl) ? urls : [...urls, { url: appUrl, label: app.name }],
        source_material_id: fromLibrary.id,
      });
    } else {
      insertRows.push({
        class_id: classId,
        teacher_id: teacherId,
        week_number: week,
        title: `${app.name} ${week}주차`,
        content: '',
        activity_urls: [{ url: appUrl, label: app.name }],
      });
    }
  }

  if (insertRows.length > 0) {
    const { error } = await supabase.from('class_materials').insert(insertRows);
    if (error) throw error;
  }
  if (updatePromises.length > 0) {
    const results = await Promise.all(updatePromises);
    const failed = results.find((r: any) => r.error);
    if (failed?.error) throw failed.error;
  }
}

// AI Service Hub 앱을 이미 있는 클래스에 "연결"만 한다(공개 처리, class_enabled_tools row 생성).
// 메인 수업도구 지정·주차 자료 자동 연결은 Classroom.tsx의 "학습 도구" 섹션에서 별도로 진행한다.
// — 이렇게 연결된 앱만 해당 클래스의 "수업 자료실" 모달에 노출된다(연결 안 한 앱은 목록에서 숨김).
export async function connectHubAppToClass({
  classId,
  app,
}: {
  classId: string;
  app: AiApp;
}): Promise<{ ok: boolean; message?: string }> {
  const toolId = `external:${app.id}`;
  const { error } = await supabase
    .from('class_enabled_tools')
    .upsert({ class_id: classId, tool_id: toolId, is_published: true, updated_at: new Date().toISOString() }, { onConflict: 'class_id,tool_id' });
  if (error) {
    console.error('connectHubAppToClass error:', error);
    return { ok: false, message: error.message || '도구 연결 중 오류가 발생했습니다.' };
  }
  return { ok: true };
}

// AI Service Hub 앱을 메인 수업도구로 지정하고 새 클래스를 원클릭 생성한다.
export async function createClassFromHubApp({
  user,
  profile,
  app,
  className,
}: {
  user: { id: string; email?: string | null };
  profile: any;
  app: AiApp;
  className: string;
}): Promise<CreateClassFromHubAppResult> {
  if (isDemoTeacher(user)) {
    return { ok: false, error: 'demo', message: '체험 계정에서는 새 학급을 만들 수 없어요. 무료로 가입하면 나만의 학급을 만들 수 있어요!' };
  }

  if (profile?.plan !== 'admin') {
    const classLimit = getClassLimit(profile);
    const { count } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', user.id);
    if ((count ?? 0) >= classLimit) {
      return { ok: false, error: 'class_limit', message: `현재 플랜에서는 클래스를 최대 ${classLimit}개까지 만들 수 있어요. 업그레이드하면 더 많은 클래스를 만들 수 있습니다.` };
    }
  }

  const entryCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 6);

  try {
    const { data: newClass, error: createError } = await supabase
      .from('classes')
      .insert({
        teacher_id: user.id,
        name: className,
        subject: app.name,
        class_type: 'subject',
        student_guide_prompt: '수업 시간에 배운 내용과 본인의 활동 역할을 구체적으로 작성하세요. 단답형이나 단순 감상평은 지양해 주세요.',
        teacher_report_prompt: '교육부 기재 요령을 준수하여 사실 기반의 객관적인 문체(~함, ~임)로 작성해줘. 학생의 개별적인 성취가 잘 드러나야 해.',
        min_obs_chars: 0,
        blocked_keywords: [],
        ai_review_enabled: true,
        weekly_plan: [],
        entry_code: entryCode,
        start_date: toDateStr(today),
        end_date: toDateStr(endDate),
      })
      .select()
      .single();
    if (createError) throw createError;

    const classId = newClass.id as string;
    const toolId = `external:${app.id}`;

    const { error: toggleError } = await supabase
      .from('class_enabled_tools')
      .upsert({ class_id: classId, tool_id: toolId, is_published: true, updated_at: new Date().toISOString() }, { onConflict: 'class_id,tool_id' });
    if (toggleError) throw toggleError;

    const { error: primaryError } = await supabase
      .from('classes')
      .update({ primary_tool_id: toolId })
      .eq('id', classId);
    if (primaryError) throw primaryError;

    await linkPrimaryToolMaterials({ classId, teacherId: user.id, app, existingMaterials: [] });

    return { ok: true, classId };
  } catch (err: any) {
    console.error('createClassFromHubApp error:', err);
    return { ok: false, error: 'unknown', message: err?.message || '클래스 생성 중 오류가 발생했습니다.' };
  }
}
