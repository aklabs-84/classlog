import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getAttachmentUrl, getAttachmentDownloadUrl } from '../components/MaterialAttachments';

// 수업 첨부 HTML 파일을 새 탭에서 실제 화면처럼 보여 주는 페이지.
// 파일은 격리된 창(sandbox, 우리 사이트 정보 접근 불가) 안에서만 실행한다.
export default function AttachmentView() {
  const [params] = useSearchParams();
  const path = params.get('path') ?? '';
  const name = params.get('name') || '첨부파일';
  const valid = path.startsWith('material-attachments/') && !path.includes('..');
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    document.title = name;
    if (!valid) { setFailed(true); return; }
    fetch(getAttachmentUrl(path))
      .then((r) => { if (!r.ok) throw new Error('fail'); return r.text(); })
      .then(setHtml)
      .catch(() => setFailed(true));
  }, [path, name, valid]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <span className="flex-1 truncate font-bold text-sm text-slate-800">{name}</span>
        {valid && (
          <a href={getAttachmentDownloadUrl(path, name)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700">
            <Download size={14} /> 다운로드
          </a>
        )}
      </div>
      {failed ? (
        <p className="p-6 text-sm text-slate-600">파일을 불러오지 못했어요. 다운로드해서 열어 주세요.</p>
      ) : html === null ? (
        <p className="p-6 text-sm text-slate-500">불러오는 중…</p>
      ) : (
        <iframe title={name} srcDoc={html} sandbox="allow-scripts allow-popups" className="flex-1 w-full border-0 bg-white" />
      )}
    </div>
  );
}
