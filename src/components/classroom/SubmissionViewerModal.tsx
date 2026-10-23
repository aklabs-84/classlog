import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Play, Square, AlertTriangle, Download } from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import DOMPurify from 'dompurify';
import { downloadFile, fetchWithProgress } from '../../lib/fileUtils';
import PercentLoader from '../common/PercentLoader';

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

const SubmissionViewerModal = ({ isOpen, onClose, fileUrl, fileName }: SubmissionViewerModalProps) => {
  const kind = getViewerKind(fileName);
  const [loading, setLoading] = useState(true);
  const [loadPercent, setLoadPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipEntryUrl, setZipEntryUrl] = useState<string | null>(null);
  const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null);
  const [pyCode, setPyCode] = useState<string>('');
  const [pyOutput, setPyOutput] = useState<string>('');
  const [pyRunning, setPyRunning] = useState(false);
  const [pyImages, setPyImages] = useState<string[]>([]);
  const [pyStdinInput, setPyStdinInput] = useState('');
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [hwpxHtml, setHwpxHtml] = useState<string>('');
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const pyWorkerRef = useRef<Worker | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const terminatePyWorker = () => {
    pyWorkerRef.current?.terminate();
    pyWorkerRef.current = null;
  };

  useEffect(() => {
    return () => terminatePyWorker();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      terminatePyWorker();
      setPyRunning(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setLoadPercent(null);
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
          const res = await fetchWithProgress(fileUrl, setLoadPercent);
          const text = await res.text();
          const htmlBlob = new Blob([text], { type: 'text/html;charset=utf-8' });
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
          const res = await fetchWithProgress(fileUrl, setLoadPercent);
          const blob = await res.blob();
          const zip = await JSZip.loadAsync(blob);
          const entries = Object.keys(zip.files)
            .filter(n => !zip.files[n].dir && !/(^|\/)(__MACOSX|node_modules)\//.test(n) && !/(^|\/)\.DS_Store$/.test(n));
          const depth = (n: string) => n.split('/').length;
          const htmls = entries.filter(n => n.toLowerCase().endsWith('.html')).sort((x, y) => depth(x) - depth(y));
          const indexPath = htmls.find(n => /(^|\/)index\.html$/i.test(n)) || htmls[0];
          if (!indexPath) {
            setError('압축 파일 안에서 열 수 있는 html 파일을 찾을 수 없습니다. 다운로드 버튼으로 받아 확인해주세요.');
            setLoading(false);
            return;
          }
          const html0 = await zip.files[indexPath].async('text');
          if (/<script[^>]+src=["'][^"']*\.(tsx|ts|jsx)["']/i.test(html0)) {
            setError('이 압축 파일은 완성본이 아니라 "만들기 전 소스 파일"이라 화면에서 바로 열 수 없어요. 다운로드 버튼으로 받아 확인해주세요. (학생에게 빌드된 결과 또는 index.html 하나로 다시 제출하도록 안내해도 좋아요)');
            setLoading(false);
            return;
          }
          const basedir = indexPath.includes('/') ? indexPath.slice(0, indexPath.lastIndexOf('/') + 1) : '';
          const mimeMap: Record<string, string> = {
            html: 'text/html;charset=utf-8', css: 'text/css;charset=utf-8', js: 'text/javascript;charset=utf-8', mjs: 'text/javascript;charset=utf-8', json: 'application/json',
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon',
            mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
          };
          const urlMap: Record<string, string> = {};
          const track = (blob: Blob) => { const u = URL.createObjectURL(blob); objectUrlsRef.current.push(u); return u; };
          const safeDecode = (v: string) => { try { return decodeURIComponent(v); } catch { return v; } };
          const resolve = (from: string, ref: string): string | undefined => {
            if (/^(https?:|data:|blob:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) return undefined;
            const clean = safeDecode(ref.split('#')[0].split('?')[0]);
            if (!clean) return undefined;
            const parts = (clean.startsWith('/') ? clean.slice(1) : from + clean).split('/');
            const out: string[] = [];
            parts.forEach(seg => { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); });
            const full = out.join('/');
            if (urlMap[full]) return urlMap[full];
            if (clean.startsWith('/') && urlMap[basedir + full]) return urlMap[basedir + full];
            return undefined;
          };
          const extOf = (n: string) => n.split('.').pop()?.toLowerCase() || '';
          // 1) css·html·js 외 파일 먼저 주소 만들기
          for (const name of entries) {
            const ext = extOf(name);
            if (ext === 'css' || ext === 'html') continue;
            const fb = await zip.files[name].async('blob');
            urlMap[name] = track(mimeMap[ext] ? new Blob([fb], { type: mimeMap[ext] }) : fb);
          }
          // 2) css는 안의 url(...) 경로를 바꾼 뒤 주소 만들기
          for (const name of entries.filter(n => extOf(n) === 'css')) {
            const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '';
            const css = (await zip.files[name].async('text')).replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g, (m, q, ref) => {
              const r = resolve(dir, ref.trim());
              return r ? `url(${q}${r}${q})` : m;
            });
            urlMap[name] = track(new Blob([css], { type: mimeMap.css }));
          }
          const baseDirForHtml = basedir;
          const html = html0.replace(/(src|href)=(["'])([^"']+)\2/g, (m, attr, q, ref) => {
            const r = resolve(baseDirForHtml, ref);
            return r ? `${attr}=${q}${r}${q}` : m;
          });
          const htmlBlob = new Blob([html], { type: mimeMap.html });
          const htmlUrl = track(htmlBlob);
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
          const res = await fetchWithProgress(fileUrl, setLoadPercent);
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
          const res = await fetchWithProgress(fileUrl, setLoadPercent);
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
          const res = await fetchWithProgress(fileUrl, setLoadPercent);
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
    } else if (kind === 'python') {
      terminatePyWorker();
      setPyOutput('');
      setPyImages([]);
      setPyRunning(false);
      (async () => {
        try {
          const res = await fetchWithProgress(fileUrl, setLoadPercent);
          const text = await res.text();
          setPyCode(text);
          setLoading(false);
        } catch (e: any) {
          setError('코드를 불러오는 중 오류가 발생했습니다: ' + (e?.message || e));
          setLoading(false);
        }
      })();
    } else if (kind === 'pdf') {
      setLoading(false);
    } else {
      setLoading(false);
    }

    return () => {
      objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, [isOpen, fileUrl, kind]);

  const runPython = () => {
    terminatePyWorker();
    setPyRunning(true);
    setPyOutput('');
    setPyImages([]);
    const stdin = pyStdinInput.split('\n');
    const worker = new Worker(new URL('../../workers/pyodideWorker.ts', import.meta.url));
    pyWorkerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data || {};
      if (data.type === 'stdout') {
        setPyOutput(prev => prev + data.text + '\n');
      } else if (data.type === 'status') {
        setPyOutput(prev => prev + data.text + '\n');
      } else if (data.type === 'done') {
        setPyImages(data.images || []);
        setPyRunning(false);
        terminatePyWorker();
      } else if (data.type === 'error') {
        setPyOutput(prev => prev + '\n[오류] ' + data.text);
        setPyRunning(false);
        terminatePyWorker();
      }
    };
    worker.onerror = (e: ErrorEvent) => {
      setPyOutput(prev => prev + '\n[오류] ' + (e.message || '알 수 없는 오류가 발생했습니다.'));
      setPyRunning(false);
      terminatePyWorker();
    };
    worker.postMessage({ type: 'run', code: pyCode, stdin });
  };

  const stopPython = () => {
    terminatePyWorker();
    setPyRunning(false);
    setPyOutput(prev => prev + '\n[중단됨] 실행을 중지했습니다.');
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-white">
      <div className="w-full h-full flex flex-col overflow-hidden">
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
                <div className="w-full h-full flex flex-col">
                                <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800">
                  🔊 학생이 만든 페이지라 열자마자 소리(음성 안내)가 날 수 있어요.
                </div>
                <iframe
                  ref={iframeRef}
                  src={htmlBlobUrl}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  className="w-full flex-1 min-h-0 border-0"
                  title={fileName}
                />
                </div>
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
                <div className="w-full h-full flex flex-col">
                <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800">
                  🔊 학생이 만든 페이지라 열자마자 소리(음성 안내)가 날 수 있어요.
                </div>
                <iframe
                  src={zipEntryUrl}
                  sandbox="allow-scripts allow-forms allow-popups allow-modals"
                  className="w-full flex-1 min-h-0 border-0"
                  title={fileName}
                />
                </div>
              )}
            </>
          )}

          {kind === 'python' && (
            <div className="h-full flex flex-col lg:flex-row gap-3 p-4 min-h-0">
              <div className="h-48 shrink-0 lg:h-auto lg:flex-1 lg:w-1/2 min-h-0 flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant shrink-0">제출된 코드</label>
                <pre className="flex-1 min-h-0 overflow-auto bg-neutral-900 text-neutral-100 text-xs font-mono rounded-xl p-3 whitespace-pre-wrap">
                  {pyCode || '코드를 불러오는 중...'}
                </pre>
              </div>
              <div className="flex-1 min-h-0 lg:w-1/2 flex flex-col gap-3">
                <div className="shrink-0">
                  <label className="text-[11px] font-bold text-on-surface-variant mb-1 block">
                    입력값 (코드가 input()을 호출하는 순서대로 한 줄에 하나씩 입력, 필요 없으면 비워두세요)
                  </label>
                  <textarea
                    value={pyStdinInput}
                    onChange={e => setPyStdinInput(e.target.value)}
                    placeholder={'예)\n1\n3\n2'}
                    rows={3}
                    className="w-full text-xs font-mono px-2.5 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:border-primary resize-none"
                  />
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={runPython}
                    disabled={pyRunning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-black hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pyRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    {pyRunning ? '실행 중...' : '코드 실행'}
                  </button>
                  {pyRunning && (
                    <button
                      onClick={stopPython}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-black hover:bg-red-100"
                    >
                      <Square size={14} />
                      중단
                    </button>
                  )}
                </div>
                <div className="flex-1 min-h-0 bg-neutral-900 rounded-xl p-3 overflow-auto">
                  <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                    {pyOutput || '실행 버튼을 눌러 출력 결과를 확인하세요.'}
                  </pre>
                </div>
                {pyImages.length > 0 && (
                  <div className="shrink-0 max-h-[45%] overflow-auto bg-white rounded-xl border border-neutral-200 p-3 flex flex-col gap-3">
                    {pyImages.map((img, i) => (
                      <img
                        key={i}
                        src={`data:image/png;base64,${img}`}
                        alt={`그래프 결과 ${i + 1}`}
                        className="max-w-full rounded-lg border border-neutral-100 mx-auto"
                      />
                    ))}
                  </div>
                )}
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

          {loading && (kind === 'web-html' || kind === 'web-zip' || kind === 'docx' || kind === 'hwpx' || kind === 'sheet' || kind === 'python') && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 px-6">
              <PercentLoader percent={loadPercent} label="파일 여는 중" />
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
