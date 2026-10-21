import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, CheckCircle2, Loader2, AlertCircle, Link2, UserCheck } from 'lucide-react';
import { checkUploadLink, uploadViaLink, submitVideoLink, type LinkInfo } from '../lib/galleryAssistant';
import { plainDrop } from '../hooks/useFileDrop';

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
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [tab, setTab] = useState<'photo' | 'video'>('photo');
  const [videoUrl, setVideoUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isTeacher = !!info?.teacher;

  useEffect(() => {
    checkUploadLink(token).then(res => {
      if (res) { setInfo(res); setState('ok'); } else setState('invalid');
    });
  }, [token]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const trimmed = isTeacher ? (info?.teacher_name ?? '주강사') : name.trim();
    if (!trimmed) { setFailures(['이름을 먼저 적어 주세요.']); return; }
    if (!isTeacher) saveName(trimmed);
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
    setToast(ok > 0
      ? { ok: errs.length === 0, msg: errs.length === 0 ? `✅ ${ok}장을 주강사님께 전했어요` : `${ok}장 전달, ${errs.length}장은 올리지 못했어요` }
      : { ok: false, msg: '사진을 올리지 못했어요' });
    setTimeout(() => setToast(null), 4000);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleVideo = async () => {
    const trimmed = isTeacher ? (info?.teacher_name ?? '주강사') : name.trim();
    if (!trimmed) { setFailures(['이름을 먼저 적어 주세요.']); return; }
    if (!videoUrl.trim()) return;
    if (!isTeacher) saveName(trimmed);
    setBusy(true);
    setFailures([]);
    try {
      await submitVideoLink(token, trimmed, videoUrl.trim());
      setDoneCount(c => c + 1);
      setVideoUrl('');
      setToast({ ok: true, msg: '✅ 영상 링크를 전했어요' });
    } catch (e: any) {
      setFailures([e?.message ?? '올리지 못했어요.']);
      setToast({ ok: false, msg: '영상 링크를 올리지 못했어요' });
    }
    setTimeout(() => setToast(null), 4000);
    setBusy(false);
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
      {toast && (
        <div role="status" className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] rounded-2xl px-5 py-3 text-base font-bold text-white shadow-lg ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>{toast.msg}</div>
      )}
      <div className="w-full max-w-md pt-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600">수업 사진 올리기</p>
          <h1 className="text-xl font-bold text-gray-900">{info?.class_name}</h1>
          <p className="text-sm text-gray-500 mt-1">수업 중 찍은 사진을 주강사님께 바로 전해요. 올린 사진은 주강사님이 확인한 뒤에 쓰여요.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          {isTeacher ? (
            <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 rounded-xl px-3 py-3 text-sm font-bold">
              <UserCheck className="w-5 h-5" /> 주강사님으로 올리는 중이에요 (바로 반영돼요)
            </div>
          ) : (
            <>
              <label className="block text-sm font-semibold text-gray-700">내 이름</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={30}
                placeholder="예: 김보조"
                className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base outline-none focus:border-indigo-500"
              />
            </>
          )}
          <div className="grid grid-cols-2 gap-2 bg-gray-100 rounded-xl p-1">
            <button type="button" onClick={() => setTab('photo')} className={`rounded-lg py-2 text-sm font-bold ${tab === 'photo' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>사진</button>
            <button type="button" onClick={() => setTab('video')} className={`rounded-lg py-2 text-sm font-bold ${tab === 'video' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'}`}>영상 링크</button>
          </div>
          {tab === 'video' ? (
            <div className="space-y-3">
              <input
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                inputMode="url"
                placeholder="https://youtu.be/… 또는 구글 드라이브 링크"
                className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={busy || !videoUrl.trim()}
                onClick={handleVideo}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-4 text-base font-bold disabled:opacity-60"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
                영상 링크 전하기
              </button>
              <p className="text-xs text-gray-400">유튜브·구글 드라이브·비메오 링크만 돼요. 드라이브는 "링크가 있는 사람 보기"로 공유해 주세요.</p>
            </div>
          ) : (
          <>
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
            {...plainDrop(files => handleFiles(files), { accept: 'image/*,.heic,.heif', multiple: true, disabled: busy })}
            className="data-[over=true]:ring-4 data-[over=true]:ring-primary/40 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-4 text-base font-bold disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            {busy ? `올리는 중 ${progress.done}/${progress.total}` : '사진 고르기 또는 끌어다 놓기 (여러 장 가능)'}
          </button>
          <p className="text-xs text-gray-400">화면을 닫지 말고 끝날 때까지 기다려 주세요.</p>
          </>
          )}
          {!isTeacher && (
            <p className="text-xs text-gray-400 pt-1">주강사님이신가요? 크롬·사파리에서 이 링크를 열고 로그인해 두면 자동으로 알아봐요. (카카오톡 안에서 열면 로그인이 안 보일 수 있어요)</p>
          )}
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
