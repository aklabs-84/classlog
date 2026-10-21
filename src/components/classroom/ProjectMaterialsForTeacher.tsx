import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { supabase } from '../../lib/supabase';
import { safeHttpUrl } from '../../lib/safeUrl';
import { BookOpen, ChevronDown, Download, ExternalLink, Eye, FileText, Loader2, Sparkles } from 'lucide-react';
import { getAttachmentDownloadUrl } from '../MaterialAttachments';

interface Item {
  id: string;
  title: string;
  content: string | null;
  week_number: number | null;
  school_id: string | null;
  class_id: string | null;
  links: { label: string; url: string }[];
  files: { name: string; url: string; size: number; path?: string }[];
  hub_apps: { id: string; name: string; url: string }[];
}

const isHtmlFile = (name: string) => /\.html?$/i.test(name);

// 저장소 안 경로: 저장돼 있으면 그대로, 없으면 공개 주소에서 뽑는다 (program-materials/ 아래 파일만 인정)
const storagePathOf = (f: { url: string; path?: string }): string | null => {
  let p = f.path;
  if (!p) {
    const m = (f.url || '').match(/\/student-attachments\/([^?#]+)/);
    if (m) { try { p = decodeURIComponent(m[1]); } catch { p = undefined; } }
  }
  return p && p.startsWith('program-materials/') && !p.includes('..') ? p : null;
};

const formatSize =(b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

// 담당 선생님 반 페이지: 프로젝트 관리자가 공개한 수업 자료(공통 + 우리 학교 전용)를 읽기 전용으로 보여준다
export default function ProjectMaterialsForTeacher({ schoolId, classId }: { schoolId: string; classId?: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sp } = await supabase.from('school_projects').select('parent_project_id').eq('id', schoolId).maybeSingle();
      if (!sp?.parent_project_id) { if (alive) setItems([]); return; }
      const { data } = await supabase
        .from('program_materials')
        .select('id, title, content, week_number, school_id, class_id, links, files, hub_apps')
        .eq('program_project_id', sp.parent_project_id)
        .eq('is_published', true)
        .or(`school_id.is.null,school_id.eq.${schoolId}`)
        .order('week_number', { ascending: true, nullsFirst: true });
      // 다른 반 전용 자료는 숨기고, 공통·학교 전체·우리 반 전용만 보여준다
      const mine = ((data || []) as any[]).filter(m => !m.class_id || m.class_id === classId);
      if (alive) setItems(mine.map(m => ({ ...m, links: m.links || [], files: m.files || [], hub_apps: m.hub_apps || [] })));
    })();
    return () => { alive = false; };
  }, [schoolId, classId]);

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
                {m.class_id ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">우리 반 전용</span> : m.school_id && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">우리 학교 전용</span>}
              </div>
              {(m.links.length > 0 || m.files.length > 0 || m.hub_apps.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {m.hub_apps.map(a => (
                    <a key={`h${a.id}`} href={safeHttpUrl(a.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-fuchsia-700 bg-fuchsia-50 hover:bg-fuchsia-100 px-3 py-1.5 rounded-lg max-w-full">
                      <Sparkles size={12} className="shrink-0" /> <span className="truncate">{a.name}</span> <ExternalLink size={11} className="shrink-0 opacity-60" />
                    </a>
                  ))}
                  {m.links.map((l, i) => (
                    <a key={`l${i}`} href={safeHttpUrl(l.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg max-w-full">
                      <ExternalLink size={12} className="shrink-0" /> <span className="truncate">{l.label || l.url}</span>
                    </a>
                  ))}
                  {m.files.map((f, i) => {
                    const path = storagePathOf(f);
                    if (isHtmlFile(f.name) && path) {
                      // HTML 파일: 이름을 누르면 새 탭에서 실제 화면으로 열고, 옆 버튼으로 내려받는다
                      return (
                        <span key={`f${i}`} className="flex items-center max-w-full rounded-lg bg-surface-container overflow-hidden">
                          <a href={`/attachment-view?path=${encodeURIComponent(path)}&name=${encodeURIComponent(f.name)}`} target="_blank" rel="noopener noreferrer" title="새 탭에서 화면으로 보기" className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:bg-surface-container-high px-3 py-1.5 min-w-0">
                            <Eye size={12} className="shrink-0" /> <span className="truncate">{f.name}</span>
                            <span className="text-on-surface-variant/50 shrink-0">{formatSize(f.size)}</span>
                          </a>
                          <a href={getAttachmentDownloadUrl(path, f.name)} title="다운로드" aria-label={`${f.name} 다운로드`} className="shrink-0 px-2.5 py-1.5 text-on-surface-variant hover:bg-surface-container-high border-l border-slate-200 dark:border-slate-700">
                            <Download size={13} />
                          </a>
                        </span>
                      );
                    }
                    return (
                      <a key={`f${i}`} href={safeHttpUrl(f.url)} target="_blank" rel="noopener noreferrer" download={f.name} className="flex items-center gap-1 text-xs font-bold text-on-surface-variant bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-lg max-w-full">
                        <FileText size={12} className="shrink-0" /> <span className="truncate">{f.name}</span>
                        <span className="text-on-surface-variant/50 shrink-0">{formatSize(f.size)}</span>
                      </a>
                    );
                  })}
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
