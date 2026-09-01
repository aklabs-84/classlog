import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon, Loader2, BookmarkX, Bookmark, Trash2, Check, Pencil } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SlideSnippet } from './types';
import SlideStage from './SlideStage';

interface Props {
  userId: string;
  onInsert: (snippet: SlideSnippet) => void;
  onClose: () => void;
}

// 교사 개인 슬라이드 저장함 — SlideDeckEditor에서 저장한 slide_snippets를 목록으로 보여주고
// 클릭 한 번으로 현재 편집 중인 덱에 삽입할 수 있게 한다.
export default function SlideSnippetLibrary({ userId, onInsert, onClose }: Props) {
  const [snippets, setSnippets] = useState<SlideSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    supabase
      .from('slide_snippets')
      .select('id, teacher_id, title, slide, created_at')
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[SlideSnippetLibrary] fetch error:', error);
        setSnippets((data || []) as SlideSnippet[]);
        setLoading(false);
      });
  }, [userId]);

  const handleDelete = async (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    const { error } = await supabase.from('slide_snippets').delete().eq('id', id);
    if (error) console.error('[SlideSnippetLibrary] delete error:', error);
  };

  const startRename = (snippet: SlideSnippet) => {
    setRenamingId(snippet.id);
    setRenameValue(snippet.title);
  };

  const commitRename = async (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    setSnippets(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    const { error } = await supabase.from('slide_snippets').update({ title }).eq('id', id);
    if (error) console.error('[SlideSnippetLibrary] rename error:', error);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <Bookmark size={16} className="text-primary shrink-0" />
            <div>
              <p className="font-black text-sm text-on-surface">슬라이드 보관함</p>
              <p className="text-xs text-on-surface-variant mt-0.5">저장해둔 슬라이드를 현재 덱에 바로 삽입할 수 있어요</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-on-surface-variant">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : snippets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2 text-on-surface-variant">
              <BookmarkX size={28} />
              <p className="text-sm font-bold">저장된 슬라이드가 없어요</p>
              <p className="text-xs">슬라이드 썸네일의 북마크 아이콘을 눌러 저장해보세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {snippets.map(snippet => (
                <div key={snippet.id} className="group rounded-2xl border border-surface-container overflow-hidden flex flex-col">
                  <button
                    className="block w-full text-left"
                    onClick={() => { onInsert(snippet); onClose(); }}
                    title="현재 덱에 삽입"
                  >
                    <SlideStage slide={snippet.slide} editable={false} />
                  </button>
                  <div className="flex items-center gap-1.5 px-2.5 py-2 bg-surface-container/40">
                    {renamingId === snippet.id ? (
                      <>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(snippet.id); if (e.key === 'Escape') setRenamingId(null); }}
                          onBlur={() => commitRename(snippet.id)}
                          className="flex-1 min-w-0 text-xs font-bold bg-white rounded-lg px-2 py-1 border border-primary outline-none"
                        />
                        <button onClick={() => commitRename(snippet.id)} className="p-1 text-primary shrink-0">
                          <Check size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 truncate text-xs font-bold text-on-surface">{snippet.title}</span>
                        <button onClick={() => startRename(snippet)} title="이름 변경" className="p-1 text-on-surface-variant hover:text-on-surface shrink-0">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(snippet.id)} title="삭제" className="p-1 text-on-surface-variant hover:text-red-500 shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
