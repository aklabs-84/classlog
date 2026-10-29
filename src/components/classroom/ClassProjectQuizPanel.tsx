import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ShortcutRow } from './ShortcutRow';

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

  if (items === null || items.length === 0) return null;

  const start = (id: string) =>
    navigate('/teaching-tools', { state: { activeToolId: 'quiz', openQuizSetId: id, autoStart: true } });

  return (
    <>
      {items.map(q => (
        <ShortcutRow
          key={q.id}
          tone="violet"
          icon={<Gamepad2 size={16} />}
          kind="퀴즈"
          title={q.title}
          summary={`문제 ${q.question_count}개${liveSetIds.has(q.id) ? ' · 진행 중인 방이 있어요' : ''}`}
          help={'"퀴즈 시작"을 누르면 퀴즈 방이 열리고, 우리 반 학생 화면의 "퀴즈 입장" 칸이 빨갛게 켜져요.'}
          action={
            <button
              onClick={() => start(q.id)}
              className="flex items-center gap-1 text-xs font-black px-3 py-2 rounded-lg text-white bg-violet-600 hover:bg-violet-700"
            >
              <Play size={12} /> {liveSetIds.has(q.id) ? '이어서 진행' : '퀴즈 시작'}
            </button>
          }
        />
      ))}
    </>
  );
}
