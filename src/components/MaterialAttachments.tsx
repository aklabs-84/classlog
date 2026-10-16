import { useState } from 'react';
import { Paperclip, Download, ChevronDown, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface MaterialAttachment {
  name: string;
  path: string;
  size: number;
}

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

export const getAttachmentUrl = (path: string) =>
  supabase.storage.from('student-attachments').getPublicUrl(path).data.publicUrl;


// 저장소 주소로 바로 열면 HTML은 코드 글자로만 보이고, 다른 주소의 파일은 download 속성이 무시된다.
// 그래서 "저장소가 다운로드로 내려주는 주소"를 따로 만든다.
export const getAttachmentDownloadUrl = (path: string, name: string) =>
  supabase.storage.from('student-attachments').getPublicUrl(path, { download: name }).data.publicUrl;

const isHtmlFile = (name: string) => /\.html?$/i.test(name);

// 첨부파일 한 줄: 이름을 누르면 열기(HTML은 미리보기 창, 그 외는 새 탭), 오른쪽 버튼은 다운로드
function AttachmentRow({ a, dark, menu, onPicked }: { a: MaterialAttachment; dark: boolean; menu?: boolean; onPicked?: () => void }) {
  const html = isHtmlFile(a.name);
  const base = menu
    ? `flex items-center gap-2 px-4 py-2.5 text-sm font-bold transition-colors ${dark ? 'text-white hover:bg-white/10' : 'text-on-surface hover:bg-surface-container-low'}`
    : `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${dark ? 'text-white hover:bg-white/10' : 'bg-white text-on-surface hover:bg-primary/5 border border-surface-container'}`;
  const label = (
    <>
      {html ? <Eye size={14} className="shrink-0 opacity-60" /> : <Paperclip size={14} className="shrink-0 opacity-60" />}
      <span className="truncate flex-1 text-left">{a.name}</span>
      <span className="shrink-0 text-[11px] opacity-50">{formatFileSize(a.size)}</span>
    </>
  );
  return (
    <div className={base}>
      {html ? (
        <a href={`/attachment-view?path=${encodeURIComponent(a.path)}&name=${encodeURIComponent(a.name)}`} target="_blank" rel="noopener noreferrer" onClick={onPicked} className="flex items-center gap-2 flex-1 min-w-0" title="새 탭에서 화면으로 보기">{label}</a>
      ) : (
        <a href={getAttachmentUrl(a.path)} target="_blank" rel="noopener noreferrer" onClick={onPicked} className="flex items-center gap-2 flex-1 min-w-0" title="새 탭에서 열기">{label}</a>
      )}
      <a href={getAttachmentDownloadUrl(a.path, a.name)} title="다운로드" aria-label={`${a.name} 다운로드`} className="shrink-0 p-1.5 rounded-lg hover:bg-black/10">
        <Download size={15} />
      </a>
    </div>
  );
}

// 수업 자료에 첨부된 파일 목록. 학생 화면, 교사 미리보기/발표/슬라이드 화면에서 공통으로 쓴다.
export default function MaterialAttachments({ attachments, dark = false }: { attachments?: MaterialAttachment[] | null; dark?: boolean }) {
  const list = (attachments ?? []).filter((a) => a?.path);
  if (list.length === 0) return null;

  return (
    <div className={`mt-6 rounded-2xl border p-4 ${dark ? 'bg-white/5 border-white/10' : 'bg-surface-container-low border-surface-container'}`}>
      <p className={`flex items-center gap-1.5 text-xs font-black mb-2 ${dark ? 'text-white/70' : 'text-on-surface-variant'}`}>
        <Paperclip size={13} /> 수업 첨부자료 {list.length}개
      </p>
      <div className="flex flex-col gap-1.5">
        {list.map((a, i) => (
          <AttachmentRow key={`${a.path}-${i}`} a={a} dark={dark} />
        ))}
      </div>
    </div>
  );
}

// 발표/슬라이드처럼 본문 아래에 목록을 둘 자리가 없는 화면용 — 상단 바의 "첨부자료" 드롭다운 버튼
export function MaterialAttachmentsButton({ attachments, dark = false }: { attachments?: MaterialAttachment[] | null; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const list = (attachments ?? []).filter((a) => a?.path);
  if (list.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-sm active:scale-95 transition-all ${
          dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-900/5 text-slate-700 hover:bg-slate-900/10'
        }`}
      >
        <Paperclip size={15} /> <span>첨부자료 {list.length}</span> <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 top-full mt-2 w-72 max-h-[60vh] overflow-y-auto rounded-2xl border shadow-2xl z-50 py-2 ${
              dark ? 'bg-[#15151f] border-white/10' : 'bg-white border-surface-container'
            }`}
          >
            {list.map((a, i) => (
              <AttachmentRow key={`${a.path}-${i}`} a={a} dark={dark} menu onPicked={() => setOpen(false)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
