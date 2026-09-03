import { supabase } from './supabase';

interface DesiredGroup {
  name: string;
  color: string;
  sort_order: number;
}

interface Assignment {
  studentId: string;
  groupName: string;
}

/**
 * 조 편성을 새 구성으로 교체한다.
 * 같은 이름의 기존(활성) 조는 id를 재사용하고 멤버만 교체하며,
 * 새 구성에 없는 기존 조는 하드 삭제 대신 보관(is_archived) 처리한다.
 * 이렇게 하면 student_results.group_id(ON DELETE SET NULL)가 끊기지 않아
 * 과거 제출 기록의 조 배지가 계속 유지된다.
 */
export async function regenerateClassGroups(
  classId: string,
  desiredGroups: DesiredGroup[],
  assignments: Assignment[]
): Promise<Record<string, string>> {
  const { data: existingGroups } = await supabase
    .from('class_groups')
    .select('id, name')
    .eq('class_id', classId)
    .eq('is_archived', false);

  const existing = existingGroups || [];
  const existingByName = new Map(existing.map(g => [g.name, g.id as string]));
  const desiredNames = new Set(desiredGroups.map(g => g.name));
  const groupIdByName: Record<string, string> = {};

  for (const g of desiredGroups) {
    const existingId = existingByName.get(g.name);
    if (existingId) {
      await supabase
        .from('class_groups')
        .update({ color: g.color, sort_order: g.sort_order })
        .eq('id', existingId);
      groupIdByName[g.name] = existingId;
    } else {
      const { data } = await supabase
        .from('class_groups')
        .insert({ class_id: classId, name: g.name, color: g.color, sort_order: g.sort_order })
        .select()
        .single();
      if (data) groupIdByName[g.name] = data.id;
    }
  }

  const toArchive = existing.filter(g => !desiredNames.has(g.name));
  if (toArchive.length > 0) {
    const archiveIds = toArchive.map(g => g.id);
    await supabase.from('class_group_members').delete().in('group_id', archiveIds);
    await supabase.from('class_groups').update({ is_archived: true }).in('id', archiveIds);
  }

  const reusedOrNewIds = Object.values(groupIdByName);
  if (reusedOrNewIds.length > 0) {
    await supabase.from('class_group_members').delete().in('group_id', reusedOrNewIds);
  }

  const inserts = assignments
    .filter(a => groupIdByName[a.groupName])
    .map(a => ({ group_id: groupIdByName[a.groupName], student_id: a.studentId }));
  if (inserts.length > 0) {
    await supabase.from('class_group_members').insert(inserts);
  }

  return groupIdByName;
}
