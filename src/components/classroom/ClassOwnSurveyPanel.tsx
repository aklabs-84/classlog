import { useEffect, useState } from 'react';
import { Loader2, Play, StopCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { appToast } from '../../lib/appDialog';
import { ShortcutRow } from './ShortcutRow';

interface OwnSurvey {
  id: string;
  title: string;
  status: 'draft' | 'open' | 'closed';
  pin_code: string | null;
  response_count: number | null;
}

// 선생님이 직접(또는 AI 연결로) 만들어 이 반에 연결한 설문을 수업 활동 탭에서 바로 시작·종료한다.
// 시작/종료는 설문 도구와 똑같이 survey_forms.status만 바꾼다. 끝난 설문은 목록이 길어지지 않게 숨긴다.
export default function ClassOwnSurveyPanel({ classId, teacherId }: { classId: string; teacherId: string }) {
  const [items, setItems] = useState<OwnSurvey[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    (async () => {
      let res: any = await supabase.from('survey_forms')
        .select('id, title, status, pin_code, survey_responses(count)')
        .eq('teacher_id', teacherId).eq('class_id', classId).in('status', ['draft', 'open'])
        .order('created_at', { ascending: false }).limit(20);
      if (res.error) {
        res = await supabase.from('survey_forms').select('id, title, status, pin_code')
          .eq('teacher_id', teacherId).eq('class_id', classId).in('status', ['draft', 'open'])
          .order('created_at', { ascending: false }).limit(20);
      }
      if (!alive) return;
      setItems(((res.data as any[]) || []).map(f => ({
        id: f.id, title: f.title, status: f.status, pin_code: f.pin_code,
        response_count: f.survey_responses?.[0]?.count ?? null,
      })));
    })();
    return () => { alive = false; };
  }, [classId, teacherId]);

  const toggle = async (s: OwnSurvey) => {
    const next = s.status === 'open' ? 'closed' : 'open';
    setBusyId(s.id);
    const { error } = await supabase.from('survey_forms').update({ status: next }).eq('id', s.id).eq('teacher_id', teacherId);
    setBusyId(null);
    if (error) { appToast('설문을 바꾸지 못했습니다. 다시 시도해 주세요.'); return; }
    // 끝낸 설문은 목록에서 빠지고, 시작한 설문은 빨간 줄로 바뀐다
    setItems(prev => (prev ?? []).flatMap(x => x.id !== s.id ? [x] : next === 'closed' ? [] : [{ ...x, status: 'open' as const }]));
  };

  if (!items || items.length === 0) return null;
  return (
    <>
      {items.map(s => {
        const open = s.status === 'open';
        return (
          <ShortcutRow
            key={s.id}
            tone="red"
            kind="설문"
            title={s.title}
            highlight={open}
            endLabel="종료"
            onEnd={() => toggle(s)}
            summary={[open ? '진행 중' : '시작 전', s.pin_code ? `입장 번호 ${s.pin_code}` : null, open && s.response_count !== null ? `응답 ${s.response_count}명` : null].filter(Boolean).join(' · ')}
            help={'"설문 시작"을 누르면 학생이 입장 번호로 들어와 답할 수 있어요. 결과는 수업도구의 설문에서 볼 수 있고, 끝나면 "종료"를 눌러 주세요.'}
            action={
              <button
                onClick={() => toggle(s)}
                disabled={busyId === s.id}
                className={`flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg text-white disabled:opacity-50 ${open ? 'bg-neutral-500' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : open ? <StopCircle size={12} /> : <Play size={12} />}
                {open ? '종료' : '설문 시작'}
              </button>
            }
          />
        );
      })}
    </>
  );
}
