import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Loader2, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProjectQuiz {
  id: string;
  title: string;
  question_count: number;
}

// 담당 선생님 클래스룸: 프로젝트 관리자가 우리 반에 보낸 퀴즈를 바로 시작한다 (학생 화면 "퀴즈 입장" 칸이 켜진다)
export default function ClassProjectQuizPanel({ classId, teacherId }: { classId: string; teacherId: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ProjectQuiz[] | null>(null);
  const [liveSetIds, setLiveSetIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: sets }, { data: live }] = await Promise.all([
        supabase.from('quiz_sets').select('id, title, quiz_questions(count)')
          .eq('teacher_id', teacherId).eq('class_id', classId).not('source_set_id', 'is', null)
          .order('created_at', { ascending: false }),
        supabase.from('quiz_sessions').select('quiz_set_id')
          .eq('teacher_id', teacherId).eq('class_id', classId).neq('state', 'FINAL'),
      ]);
      if (!alive) return;
      setItems(((sets as any[]) || []).map(s => ({ id: s.id, title: s.title, question_count: s.quiz_questions?.[0]?.count ?? 0 })));
      setLiveSetIds(new Set(((live as any[]) || []).map(x => x.quiz_set_id)));
    })();
    return () => { alive = false; };
  }, [classId, teacherId]);

  if (items === null) return <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-primary" /></div>;
  if (items.length === 0) return null;

  const start = (id: string) =>
    navigate('/teaching-tools', { state: { activeToolId: 'quiz', openQuizSetId: id, autoStart: true } });

  return (
    <div className="rounded-2xl border-2 border-neutral-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gamepad2 size={18} className="text-neutral-500" />
        <h3 className="font-black text-sm">학교 프로젝트 퀴즈</h3>
      </div>
      <p className="text-xs font-bold text-neutral-500 leading-relaxed">
        "퀴즈 시작"을 누르면 퀴즈 방이 열리고, 우리 반 학생 화면의 "퀴즈 입장" 칸이 빨갛게 켜져요.
      </p>
      <div className="space-y-2">
        {items.map(q => (
          <div key={q.id} className="flex items-center gap-3 rounded-xl bg-white border border-neutral-200 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{q.title}</p>
              <p className="text-[11px] font-bold text-neutral-400 mt-0.5">
                {`문제 ${q.question_count}개`}{liveSetIds.has(q.id) ? ' · 진행 중인 방이 있어요' : ''}
              </p>
            </div>
            <button
              onClick={() => start(q.id)}
              className="shrink-0 flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg text-white bg-red-500 hover:bg-red-600"
            >
              <Play size={12} /> {liveSetIds.has(q.id) ? '이어서 진행' : '퀴즈 시작'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
