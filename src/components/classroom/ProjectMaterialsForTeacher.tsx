import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { supabase } from '../../lib/supabase';
import { BookOpen, ChevronDown, ExternalLink, FileText, Loader2 } from 'lucide-react';

interface Item {
  id: string;
  title: string;
  content: string | null;
  week_number: number | null;
  school_id: string | null;
  links: { label: string; url: string }[];
  files: { name: string; url: string; size: number }[];
}

const formatSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

// 담당 선생님 반 페이지: 프로젝트 관리자가 공개한 수업 자료(공통 + 우리 학교 전용)를 읽기 전용으로 보여준다
export default function ProjectMaterialsForTeacher({ schoolId }: { schoolId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sp } = await supabase.from('school_projects').select('parent_project_id').eq('id', schoolId).maybeSingle();
      if (!sp?.parent_project_id) { if (alive) setItems([]); return; }
      const { data } = await supabase
        .from('program_materials')
        .select('id, title, content, week_number, school_id, links, files')
        .eq('program_project_id', sp.parent_project_id)
        .eq('is_published', true)
        .or(`school_id.is.null,school_id.eq.${schoolId}`)
        .order('week_number', { ascending: true, nullsFirst: true });
      if (alive) setItems(((data || []) as any[]).map(m => ({ ...m, links: m.links || [], files: m.files || [] })));
    })();
    return () => { alive = false; };
  }, [schoolId]);

  if (items === null) return <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-primary" /></div>;
  const empty = items.length === 0;

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-3xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen size={18} className="text-primary" />
        <h3 className="font-black text-base">프로젝트 수업 자료</h3>
        <span className="text-[11px] font-bold text-on-surface-variant/70">관리자가 공유한 자료 · 읽기 전용</span>
      </div>
      {empty && <p className="text-xs font-bold text-on-surface-variant/60">아직 공개된 프로젝트 수업 자료가 없습니다. (관리자가 '강사에게 바로 공개'로 저장한 자료만 보입니다)</p>}
      <div className="space-y-2">
        {items.map(m => {
          const hasMemo = !!m.content && m.content.replace(/<[^>]*>/g, '').trim().length > 0;
          const open = openId === m.id;
          return (
            <div key={m.id} className="bg-surface-container-lowest rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {m.week_number != null && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary">{m.week_number}주차</span>}
                <span className="font-bold text-sm">{m.title}</span>
                {m.school_id && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">우리 학교 전용</span>}
              </div>
              {(m.links.length > 0 || m.files.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {m.links.map((l, i) => (
                    <a key={`l${i}`} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg max-w-full">
                      <ExternalLink size={12} className="shrink-0" /> <span className="truncate">{l.label || l.url}</span>
                    </a>
                  ))}
                  {m.files.map((f, i) => (
                    <a key={`f${i}`} href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} className="flex items-center gap-1 text-xs font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-lg max-w-full">
                      <FileText size={12} className="shrink-0" /> <span className="truncate">{f.name}</span>
                      <span className="text-on-surface-variant/50 shrink-0">{formatSize(f.size)}</span>
                    </a>
                  ))}
                </div>
              )}
              {hasMemo && (
                <>
                  <button type="button" onClick={() => setOpenId(open ? null : m.id)} className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary">
                    <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} /> 상세 설명 보기
                  </button>
                  {open && <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(m.content!) }} />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
