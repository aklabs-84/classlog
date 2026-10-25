import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getAttachmentUrl, getAttachmentDownloadUrl } from '../components/MaterialAttachments';

const STORE_PREFIX = 'attview:';
const MAX_STORE_BYTES = 2_000_000;

function readStore(path: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + path);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch { return {}; }
}

// 격리 창 안에서는 브라우저 저장공간(localStorage)을 못 쓰므로, 파일 전용 저장소를 대신 끼워 넣는다.
// 값은 부모 창(우리 사이트)이 파일 경로별 키로 따로 보관한다.
function withStorageShim(html: string, path: string): string {
  const safe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const shim = `<script>(function(){var d=${safe(readStore(path))},K=${safe(path)},m={};
function p(){try{parent.postMessage({attviewKey:K,data:d},'*')}catch(e){}}
function mk(get,set){return {getItem:function(k){var o=get();return Object.prototype.hasOwnProperty.call(o,k)?o[k]:null},setItem:function(k,v){var o=get();o[k]=String(v);set(o)},removeItem:function(k){var o=get();delete o[k];set(o)},clear:function(){set({})},key:function(i){return Object.keys(get())[i]||null},get length(){return Object.keys(get()).length}}}
try{Object.defineProperty(window,'localStorage',{value:mk(function(){return d},function(o){d=o;p()}),configurable:true})}catch(e){}
try{Object.defineProperty(window,'sessionStorage',{value:mk(function(){return m},function(o){m=o}),configurable:true})}catch(e){}
})();</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (t) => t + shim);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (t) => t + shim);
  return /^\s*<!doctype/i.test(html) ? html.replace(/^(\s*<!doctype[^>]*>)/i, (t) => t + shim) : shim + html;
}

// 수업 첨부 HTML 파일을 새 탭에서 실제 화면처럼 보여 주는 페이지.
// 파일은 격리된 창(sandbox, 우리 사이트 정보 접근 불가) 안에서만 실행한다.
export default function AttachmentView() {
  const [params] = useSearchParams();
  const path = params.get('path') ?? '';
  const name = params.get('name') || '첨부파일';
  const valid = (path.startsWith('material-attachments/') || path.startsWith('program-materials/')) && !path.includes('..');
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => (html === null ? null : withStorageShim(html, path)), [html, path]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const m = e.data;
      if (!m || m.attviewKey !== path || !m.data || typeof m.data !== 'object') return;
      try {
        const json = JSON.stringify(m.data);
        if (json.length <= MAX_STORE_BYTES) localStorage.setItem(STORE_PREFIX + path, json);
      } catch { /* 저장 공간 부족 등은 무시 */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [path]);

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
      ) : srcDoc === null ? (
        <p className="p-6 text-sm text-slate-500">불러오는 중…</p>
      ) : (
        <iframe ref={frameRef} title={name} srcDoc={srcDoc} sandbox="allow-scripts allow-popups allow-modals allow-downloads allow-forms allow-pointer-lock" allow="fullscreen" allowFullScreen className="flex-1 w-full border-0 bg-white" />
      )}
    </div>
  );
}
