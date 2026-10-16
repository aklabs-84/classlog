import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Presentation } from 'lucide-react';
import { supabase } from '../lib/supabase';

// 선생님 전용 — 자료 화면에서 이 클래스에 연결된 협업보드 목록을 보고, 고르면 새 탭에서 연다.
// 학생 화면에는 이 컴포넌트를 그리지 않는다(부모가 teacherTools일 때만 렌더). 목록 조회는 로그인한 선생님 권한으로만 된다.

interface BoardRow { id: string; title: string | null; updated_at: string | null }

interface Props {
  classId: string;
}

const TeacherBoardsButton = ({ classId }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [boards, setBoards] = useState<BoardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 열 때마다 최신 목록을 다시 불러온다 (수업 중 새로 만든 보드도 바로 보이게)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    supabase
      .from('whiteboards')
      .select('id, title, updated_at')
      .eq('class_id', classId)
      .eq('is_template', false)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setFailed(true);
        setBoards(error ? [] : ((data as BoardRow[]) ?? []));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [open, classId]);

  // 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openBoard = (id: string) => {
    window.open(`/whiteboard/${id}`, '_blank', 'noopener');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 text-white font-black text-base hover:bg-white/20 active:scale-95 transition-all"
        title="이 클래스에 연결된 협업보드 보기"
      >
        <Presentation size={18} />
        <span className="hidden sm:inline">협업보드</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-32px)] rounded-2xl bg-white text-slate-800 shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-[15px] font-black">연결된 협업보드</div>
          <div className="max-h-[50vh] overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-5 text-[15px] text-slate-500"><Loader2 size={16} className="animate-spin" /> 불러오는 중…</div>
            )}
            {!loading && failed && (
              <div className="px-4 py-5 text-[15px] text-red-500">보드 목록을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.</div>
            )}
            {!loading && !failed && boards && boards.length === 0 && (
              <div className="px-4 py-5 text-[15px] text-slate-500">연결된 협업보드가 없어요.</div>
            )}
            {!loading && boards && boards.map(b => (
              <button
                key={b.id}
                onClick={() => openBoard(b.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-[15px] font-bold hover:bg-slate-50 border-b border-slate-50 last:border-b-0"
              >
                <span className="truncate">{b.title || '제목 없는 보드'}</span>
                <ExternalLink size={15} className="text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherBoardsButton;
