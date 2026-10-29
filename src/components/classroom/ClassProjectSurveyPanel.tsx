import { useCallback, useEffect, useState } from 'react';
import { BarChart2, Loader2, Play, StopCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { appToast } from '../../lib/appDialog';
import { ShortcutRow } from './ShortcutRow';

interface ProjectSurvey {
  id: string;
  title: string;
  week_number: number | null;
  survey_phase: 'pre' | 'post' | null;
  is_open: boolean;
  response_count: number;
  scope: 'common' | 'school' | 'class';
}

// 담당 선생님 클래스룸: 프로젝트 관리자가 만든 설문을 우리 반에만 열고 닫는다 (학생 화면 "수업 끝 설문" 칸이 켜진다)
export default function ClassProjectSurveyPanel({ classId }: { classId: string }) {
  const [items, setItems] = useState<ProjectSurvey[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('teacher_class_project_surveys', { p_class_id: classId });
    setItems((data as ProjectSurvey[]) ?? []);
  }, [classId]);

  useEffect(() => { setItems(null); load(); }, [load]);

  const toggle = async (s: ProjectSurvey) => {
    setBusyId(s.id);
    const { error } = await supabase.rpc('teacher_set_survey_open', { p_form_id: s.id, p_class_id: classId, p_open: !s.is_open });
    setBusyId(null);
    if (error) { appToast('설문을 바꾸지 못했습니다. 다시 시도해 주세요.'); return; }
    setItems(prev => (prev ?? []).map(x => x.id === s.id ? { ...x, is_open: !s.is_open } : x));
  };

  if (!items || items.length === 0) return null;
  return (
    <>
      {items.map(s => (
        <ShortcutRow
          key={s.id}
          tone="red"
          kind="설문"
          title={s.title}
          highlight={s.is_open}
          summary={[s.scope === 'common' ? '공통' : s.scope === 'school' ? '우리 학교 전용' : '우리 반 전용', s.week_number ? `${s.week_number}주차` : null, s.survey_phase === 'post' ? '사후' : s.survey_phase === 'pre' ? '사전' : null, `우리 반 응답 ${s.response_count}명`].filter(Boolean).join(' · ')}
          help={'"설문 시작"을 누르면 우리 반 학생 화면의 "수업 끝 설문" 칸이 빨갛게 켜져요. 끝나면 "종료"를 눌러 주세요.'}
          action={
            <button
              onClick={() => toggle(s)}
              disabled={busyId === s.id}
              className={`flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg text-white disabled:opacity-50 ${s.is_open ? 'bg-neutral-500' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : s.is_open ? <StopCircle size={12} /> : <Play size={12} />}
              {s.is_open ? '종료' : '설문 시작'}
            </button>
          }
        />
      ))}
    </>
  );
}
