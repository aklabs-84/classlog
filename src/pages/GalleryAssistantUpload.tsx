import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { checkUploadLink, uploadViaLink, type LinkInfo } from '../lib/galleryAssistant';

const NAME_KEY = 'gallery_assistant_name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };
const saveName = (v: string) => { try { localStorage.setItem(NAME_KEY, v); } catch { /* noop */ } };

// 보조강사용(로그인 없음) 사진 올리기 화면 — 올리기만 가능하고 올린 사진을 볼 수는 없다
const GalleryAssistantUpload = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'invalid'>('loading');
  const [name, setName] = useState(readName);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [doneCount, setDoneCount] = useState(0);
  const [failures, setFailures] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkUploadLink(token).then(res => {
      if (res) { setInfo(res); setState('ok'); } else setState('invalid');
    });
  }, [token]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const trimmed = name.trim();
    if (!trimmed) { setFailures(['이름을 먼저 적어 주세요.']); return; }
    saveName(trimmed);
    setBusy(true);
    setFailures([]);
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length });
    const errs: string[] = [];
    let ok = 0;
    for (const f of list) {
      try {
        await uploadViaLink(token, trimmed, f);
        ok++;
      } catch (e: any) {
        errs.push(e?.message ?? '올리지 못했어요.');
        if (String(e?.message).includes('링크가 꺼졌') || String(e?.message).includes('장수를 모두')) break;
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setDoneCount(c => c + ok);
    setFailures([...new Set(errs)]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-bold text-gray-900 mb-1">이 링크는 지금 쓸 수 없어요</p>
          <p className="text-sm text-gray-500">꺼졌거나 새 링크로 바뀌었을 수 있어요. 주강사님께 새 링크를 받아 주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4">
      <div className="w-full max-w-md pt-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600">수업 사진 올리기</p>
          <h1 className="text-xl font-bold text-gray-900">{info?.class_name}</h1>
          <p className="text-sm text-gray-500 mt-1">수업 중 찍은 사진을 주강사님께 바로 전해요. 올린 사진은 주강사님이 확인한 뒤에 쓰여요.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <label className="block text-sm font-semibold text-gray-700">내 이름</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            placeholder="예: 김보조"
            className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base outline-none focus:border-indigo-500"
          />
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-4 text-base font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            {busy ? `올리는 중 ${progress.done}/${progress.total}` : '사진 고르기 (여러 장 가능)'}
          </button>
          <p className="text-xs text-gray-400">화면을 닫지 말고 끝날 때까지 기다려 주세요.</p>
        </div>

        {doneCount > 0 && !busy && (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-xl px-4 py-3 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5" /> 지금까지 {doneCount}장을 전했어요
          </div>
        )}
        {failures.length > 0 && (
          <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 text-sm space-y-1">
            {failures.map(f => <p key={f}>{f}</p>)}
          </div>
        )}
      </div>
    </div>
  );
};

export default GalleryAssistantUpload;
