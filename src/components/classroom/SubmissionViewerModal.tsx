import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Play, AlertTriangle, Download } from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import DOMPurify from 'dompurify';
import { downloadFile } from '../../lib/fileUtils';

interface SubmissionViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
}

type ViewerKind = 'web-html' | 'web-zip' | 'python' | 'pdf' | 'docx' | 'hwpx' | 'sheet' | 'unsupported';

const getViewerKind = (fileName: string): ViewerKind => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'html' || ext === 'htm') return 'web-html';
  if (ext === 'zip') return 'web-zip';
  if (ext === 'py') return 'python';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'hwpx') return 'hwpx';
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return 'sheet';
  return 'unsupported';
};

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js';

const SubmissionViewerModal = ({ isOpen, onClose, fileUrl, fileName }: SubmissionViewerModalProps) => {
  const kind = getViewerKind(fileName);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zipEntryUrl, setZipEntryUrl] = useState<string | null>(null);
  const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null);
  const [pyOutput, setPyOutput] = useState<string>('');
  const [pyRunning, setPyRunning] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [hwpxHtml, setHwpxHtml] = useState<string>('');
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const pyodideRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setPyOutput('');
    setDocxHtml('');
    setHwpxHtml('');
    setSheets([]);
    setActiveSheetIndex(0);
    setHtmlBlobUrl(null);
    objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];

    if (kind === 'web-html') {
      (async () => {
        try {
          const res = await fetch(fileUrl);
          const text = await res.text();
          const htmlBlob = new Blob([text], { type: 'text/html' });
          const htmlUrl = URL.createObjectURL(htmlBlob);
          objectUrlsRef.current.push(htmlUrl);
          setHtmlBlobUrl(htmlUrl);
          setLoading(false);
        } catch (e: any) {
          setError('파일을 여는 중 오류가 발생했습니다: ' + (e?.message || e));
          setLoading(false);
        }
      })();
    } else if (kind === 'web-zip') {
      (async () => {
        try {
          const res = await fetch(fileUrl);
          const blob = await res.blob();
          const zip = await JSZip.loadAsync(blob);
          const entries = Object.keys(zip.files).filter(n => !zip.files[n].dir);
          const indexPath = entries.find(n => /(^|\/)index\.html$/i.test(n))
            || entries.find(n => n.toLowerCase().endsWith('.html'));
          if (!indexPath) {
            setError('압축 파일 안에서 index.html을 찾을 수 없습니다.');
            setLoading(false);
            return;
          }
          const basedir = indexPath.includes('/') ? indexPath.slice(0, indexPath.lastIndexOf('/') + 1) : '';
          const urlMap: Record<string, string> = {};
          for (const name of entries) {
            const ext = name.split('.').pop()?.toLowerCase() || '';
            const mimeMap: Record<string, string> = {
              html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json',
              png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
              mp3: 'audio/mpeg', wav: 'audio/wav', woff: 'font/woff', woff2: 'font/woff2',
            };
            const fileBlob = await zip.files[name].async('blob');
            const typedBlob = mimeMap[ext] ? new Blob([fileBlob], { type: mimeMap[ext] }) : fileBlob;
            const url = URL.createObjectURL(typedBlob);
            objectUrlsRef.current.push(url);
            urlMap[name] = url;
          }
          let html = await zip.files[indexPath].async('text');
          html = html.replace(/(src|href)=["']([^"':][^"']*)["']/g, (match, attr, path) => {
            const resolved = basedir + path.replace(/^\.\//, '');
            const normalized = Object.keys(urlMap).find(k => k === resolved || k === path);
            return normalized ? `${attr}="${urlMap[normalized]}"` : match;
          });
          const htmlBlob = new Blob([html], { type: 'text/html' });
          const htmlUrl = URL.createObjectURL(htmlBlob);
          objectUrlsRef.current.push(htmlUrl);
          setZipEntryUrl(htmlUrl);
          setLoading(false);
        } catch (e: any) {
          setError('압축 파일을 여는 중 오류가 발생했습니다: ' + (e?.message || e));
          setLoading(false);
        }
      })();
    } else if (kind === 'docx') {
      (async () => {
        try {
          const mammoth = await import('mammoth');
          const res = await fetch(fileUrl);
          const arrayBuffer = await res.arrayBuffer();
          const { value } = await mammoth.convertToHtml({ arrayBuffer });
          setDocxHtml(DOMPurify.sanitize(value));
          setLoading(false);
        } catch (e: any) {
          setError('문서를 여는 중 오류가 발생했습니다: ' + (e?.message || e));
          setLoading(false);
        }
      })();
    } else if (kind === 'hwpx') {
      (async () => {
        try {
          const { HwpxReader } = await import('hwp-convert');
          const reader = new HwpxReader();
          const res = await fetch(fileUrl);
          const arrayBuffer = await res.arrayBuffer();
          await reader.loadFromArrayBuffer(arrayBuffer);
          const html = await reader.extractHtml({ renderImages: true, renderTables: true, renderStyles: true, embedImages: true });
          setHwpxHtml(DOMPurify.sanitize(html));
          setLoading(false);
        } catch (e: any) {
          setError('문서를 여는 중 오류가 발생했습니다: ' + (e?.message || e));
          setLoading(false);
        }
      })();
    } else if (kind === 'sheet') {
      (async () => {
        try {
          const res = await fetch(fileUrl);
          const arrayBuffer = await res.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const parsedSheets = workbook.SheetNames.map(name => ({
            name,
            html: DOMPurify.sanitize(XLSX.utils.sheet_to_html(workbook.Sheets[name])),
          }));
          setSheets(parsedSheets);
          setActiveSheetIndex(0);
          setLoading(false);
        } catch (e: any) {
          setError('표 파일을 여는 중 오류가 발생했습니다: ' + (e?.message || e));
          setLoading(false);
        }
      })();
    } else if (kind === 'python' || kind === 'pdf') {
      setLoading(false);
    } else {
      setLoading(false);
    }

    return () => {
      objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, [isOpen, fileUrl, kind]);

  const runPython = async () => {
    setPyRunning(true);
    setPyOutput('');
    try {
      if (!pyodideRef.current) {
        if (!(window as any).loadPyodide) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = PYODIDE_CDN;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Pyodide 로드 실패'));
            document.head.appendChild(script);
          });
        }
        setPyOutput('파이썬 실행 환경 준비 중...\n');
        pyodideRef.current = await (window as any).loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
        });
        pyodideRef.current.setStdout({ batched: (s: string) => setPyOutput(prev => prev + s + '\n') });
        pyodideRef.current.setStderr({ batched: (s: string) => setPyOutput(prev => prev + s + '\n') });
      } else {
        setPyOutput('');
      }
      const res = await fetch(fileUrl);
      const code = await res.text();
      await pyodideRef.current.runPythonAsync(code);
    } catch (e: any) {
      setPyOutput(prev => prev + '\n[오류] ' + (e?.message || String(e)));
    } finally {
      setPyRunning(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-black text-on-surface truncate">{fileName}</p>
            <p className="text-[10px] font-bold text-on-surface-variant">제출물 미리보기</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => downloadFile(fileUrl, fileName)}
              title="다운로드"
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            >
              <Download size={16} />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative bg-neutral-50">
          {kind === 'unsupported' && (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-on-surface-variant p-6 text-center">
              <AlertTriangle size={28} className="text-amber-500" />
              <p className="text-sm font-bold">이 파일 형식은 아직 미리보기를 지원하지 않습니다.</p>
              <p className="text-xs">다운로드 버튼으로 파일을 받아 확인해주세요.</p>
            </div>
          )}

          {kind === 'web-html' && (
            <>
              {error ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-red-500 p-6 text-center">
                  <AlertTriangle size={28} />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              ) : htmlBlobUrl && (
                <iframe
                  ref={iframeRef}
                  src={htmlBlobUrl}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  className="w-full h-full border-0"
                  title={fileName}
                />
              )}
            </>
          )}

          {kind === 'web-zip' && (
            <>
              {error ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-red-500 p-6 text-center">
                  <AlertTriangle size={28} />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              ) : zipEntryUrl && (
                <iframe
                  src={zipEntryUrl}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  className="w-full h-full border-0"
                  title={fileName}
                />
              )}
            </>
          )}

          {kind === 'python' && (
            <div className="h-full flex flex-col p-4 gap-3">
              <button
                onClick={runPython}
                disabled={pyRunning}
                className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary/90 disabled:opacity-50"
              >
                {pyRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {pyRunning ? '실행 중...' : '코드 실행'}
              </button>
              <div className="flex-1 min-h-0 bg-neutral-900 rounded-xl p-3 overflow-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                  {pyOutput || '실행 버튼을 눌러 출력 결과를 확인하세요.'}
                </pre>
              </div>
            </div>
          )}

          {kind === 'pdf' && (
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title={fileName}
            />
          )}

          {kind === 'docx' && (
            <>
              {error ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-red-500 p-6 text-center">
                  <AlertTriangle size={28} />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              ) : (
                <div className="h-full overflow-auto p-6 bg-white">
                  <div className="prose prose-sm max-w-2xl mx-auto" dangerouslySetInnerHTML={{ __html: docxHtml }} />
                </div>
              )}
            </>
          )}

          {kind === 'hwpx' && (
            <>
              {error ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-red-500 p-6 text-center">
                  <AlertTriangle size={28} />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              ) : (
                <div className="h-full overflow-auto p-6 bg-white [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-neutral-300 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-neutral-100">
                  <div className="prose prose-sm max-w-2xl mx-auto" dangerouslySetInnerHTML={{ __html: hwpxHtml }} />
                </div>
              )}
            </>
          )}

          {kind === 'sheet' && (
            <>
              {error ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-red-500 p-6 text-center">
                  <AlertTriangle size={28} />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              ) : sheets.length > 0 && (
                <div className="h-full flex flex-col">
                  {sheets.length > 1 && (
                    <div className="flex items-center gap-1 px-3 pt-2 border-b border-neutral-100 bg-white overflow-x-auto shrink-0">
                      {sheets.map((s, i) => (
                        <button
                          key={s.name + i}
                          onClick={() => setActiveSheetIndex(i)}
                          className={`px-3 py-1.5 rounded-t-lg text-xs font-bold whitespace-nowrap ${
                            i === activeSheetIndex
                              ? 'bg-primary/10 text-primary border border-b-0 border-neutral-200'
                              : 'text-on-surface-variant hover:bg-surface-container'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    className="flex-1 min-h-0 overflow-auto p-4 bg-white [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-200 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_th]:border [&_th]:border-neutral-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-neutral-100 [&_th]:text-xs"
                    dangerouslySetInnerHTML={{ __html: sheets[activeSheetIndex]?.html || '' }}
                  />
                </div>
              )}
            </>
          )}

          {loading && (kind === 'web-html' || kind === 'web-zip' || kind === 'docx' || kind === 'hwpx' || kind === 'sheet') && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SubmissionViewerModal;
export { getViewerKind };
