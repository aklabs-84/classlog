import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { filterMyTeachingClasses } from '../../lib/projectClassFilter';

export interface MyClassOption {
  // 학생이 로그인하는 반 id (연동 학급이면 담임반 id) — live_boards.class_id에 이 값을 넣는다
  value: string;
  name: string;
}

// 내 클래스 목록 (담임 + 배정). 퀴즈와 같은 기준으로 연동 학급은 담임반 id로 바꿔 둔다.
export function useMyClassOptions(): MyClassOption[] {
  const { user } = useAuth();
  const [options, setOptions] = useState<MyClassOption[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [{ data: own }, { data: assigned }] = await Promise.all([
        supabase.from('classes')
          .select('id, name, linked_class_id, school_project_id, parent_class_id, assigned_teacher_id')
          .eq('teacher_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }),
        supabase.from('classes')
          .select('id, name, linked_class_id')
          .eq('assigned_teacher_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }),
      ]);
      if (!alive) return;
      const seen = new Set<string>();
      const list: MyClassOption[] = [];
      for (const c of [...filterMyTeachingClasses(own as any[], user.id), ...((assigned as any[]) || [])]) {
        const value = c.linked_class_id || c.id;
        if (seen.has(value)) continue;
        seen.add(value);
        list.push({ value, name: c.name });
      }
      setOptions(list);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  return options;
}

interface Props {
  value: string | null;
  onChange: (classId: string | null) => void;
  options: MyClassOption[];
  disabled?: boolean;
  compact?: boolean;
}

export default function ClassPicker({ value, onChange, options, disabled, compact }: Props) {
  // 연결된 클래스가 내 목록에 없어도(보관됨 등) 선택 상자가 비어 보이지 않게 한다
  const missing = value && !options.some(o => o.value === value);
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value || null)}
      style={{
        width: compact ? 'auto' : '100%', maxWidth: '100%', minWidth: 0,
        border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', color: '#1f2937',
        padding: compact ? '6px 8px' : '10px 10px', fontSize: compact ? 12 : 14, fontFamily: 'inherit',
      }}
    >
      <option value="">연결 안 함 (코드로만 입장)</option>
      {missing && <option value={value!}>(연결된 클래스)</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}
    </select>
  );
}
