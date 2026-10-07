import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Loader2, X } from 'lucide-react';

export interface ImportableMaterial {
  id: string;
  title: string;
  content: string | null;
  week_number: number | null;
  className: string;
  activity_urls?: { url: string; label: string }[];
}

// 수업 도구(class_materials)에 있는 내 자료 목록
export async function loadImportableMaterials(userId: string): Promise<ImportableMaterial[]> {
  const { data: myClasses } = await supabase.from('classes').select('id, name').eq('teacher_id', userId);
  const classMap: Record<string, string> = {};
  (myClasses || []).forEach(c => { classMap[c.id] = c.name; });

  const { data } = await supabase
    .from('class_materials')
    .select('id, title, content, week_number, class_id, activity_urls')
    .eq('teacher_id', userId)
    .order('created_at', { ascending: false });
  return (data || []).map((m: any) => ({
    id: m.id,
    title: m.title,
    content: m.content,
    week_number: m.week_number,
    className: m.class_id ? (classMap[m.class_id] || '') : '자료실 (수업 미배정)',
    activity_urls: m.activity_urls || [],
  }));
}

export default function ImportableMaterialPicker({ userId, title = '내 수업 자료에서 가져오기', onPick, onClose }: {
  userId: string;
  title?: string;
  onPick: (m: ImportableMaterial) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ImportableMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadImportableMaterials(userId).then(list => { if (alive) { setItems(list); setLoading(false); } });
    return () => { alive = false; };
  }, [userId]);

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter(m => m.title.toLowerCase().includes(q) || m.className.toLowerCase().includes(q)) : items;

  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-lg h-full max-h-[75vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-container-high shrink-0">
          <h3 className="font-black text-sm">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant"><X size={16} /></button>
        </div>
        <div className="px-4 pt-3 shrink-0">
          <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="제목 또는 수업 이름으로 검색"
            className="w-full px-3 py-2 bg-surface-container rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-on-surface-variant/40" /></div>
          ) : shown.length === 0 ? (
            <p className="text-xs text-on-surface-variant/50 text-center py-10">가져올 수 있는 수업 자료가 없습니다</p>
          ) : (
            shown.map(m => (
              <button key={m.id} onClick={() => onPick(m)} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-primary/5 transition-all">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-on-surface truncate">{m.title}</p>
                  {m.week_number != null && (
                    <span className="text-[10px] font-black text-on-surface-variant/60 bg-surface-container px-1.5 py-0.5 rounded-full shrink-0">{m.week_number}주차</span>
                  )}
                </div>
                <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{m.className}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
