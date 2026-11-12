import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Download, Copy, Maximize2, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useScrollLock } from '../../hooks/useScrollLock';

// 링크·글자를 QR 그림으로 바꿔 주는 도구. 모두 이 컴퓨터 안에서 만들어서 입력한 내용이 밖으로 나가지 않는다.
type ClassOpt = { id: string; name: string; entry_code: string | null };
const COLORS = [
  { id: 'black', label: '검정', hex: '#111111' },
  { id: 'purple', label: '보라', hex: '#5b21b6' },
];
const SIZES = [
  { id: 'm', label: '보통', px: 1024 },
  { id: 'l', label: '크게', px: 2048 },
];

const QrGenerator = () => {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('black');
  const [sizeId, setSizeId] = useState('m');
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const previewRef = useRef<HTMLImageElement>(null);
  useScrollLock(full);

  // 내 반 목록은 도구를 열 때 한 번만 (입장 링크 빠르게 넣기용)
  useEffect(() => {
    if (!user) return;
    let stop = false;
    supabase.from('classes').select('id, name, entry_code')
      .or(`teacher_id.eq.${user.id},assigned_teacher_id.eq.${user.id}`)
      .eq('is_archived', false).not('entry_code', 'is', null).order('name')
      .then(({ data, error }) => { if (!stop && !error) setClasses((data ?? []) as ClassOpt[]); });
    return () => { stop = true; };
  }, [user?.id]);

  const hex = useMemo(() => COLORS.find(c => c.id === color)?.hex ?? '#111111', [color]);
  const px = useMemo(() => SIZES.find(s => s.id === sizeId)?.px ?? 1024, [sizeId]);
  const value = text.trim();

  useEffect(() => {
    if (!value) { setDataUrl(''); setErr(''); return; }
    let stop = false;
    QRCode.toDataURL(value, { width: px, margin: 2, errorCorrectionLevel: 'M', color: { dark: hex, light: '#ffffff' } })
      .then(u => { if (!stop) { setDataUrl(u); setErr(''); } })
      .catch(() => { if (!stop) { setDataUrl(''); setErr('내용이 너무 길어서 QR로 만들 수 없어요. 조금 줄여 주세요.'); } });
    return () => { stop = true; };
  }, [value, px, hex]);

  // 제목을 함께 넣은 인쇄용 그림(PNG)
  const buildPng = async (): Promise<Blob | null> => {
    if (!dataUrl) return null;
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const pad = Math.round(px * 0.06);
    const head = title.trim() ? Math.round(px * 0.14) : 0;
    const canvas = document.createElement('canvas');
    canvas.width = px + pad * 2;
    canvas.height = px + pad * 2 + head;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (head) {
      ctx.fillStyle = hex;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let fs = Math.round(px * 0.08);
      ctx.font = `800 ${fs}px sans-serif`;
      while (ctx.measureText(title.trim()).width > canvas.width - pad * 2 && fs > 20) { fs -= 4; ctx.font = `800 ${fs}px sans-serif`; }
      ctx.fillText(title.trim(), canvas.width / 2, pad + head / 2);
    }
    ctx.drawImage(img, pad, pad + head, px, px);
    return await new Promise(r => canvas.toBlob(b => r(b), 'image/png'));
  };

  const download = async () => {
    const blob = await buildPng();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${(title.trim() || 'code').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const copy = async () => {
    try {
      const blob = await buildPng();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr('이 브라우저에서는 복사가 안 돼요. "이미지로 저장"을 써 주세요.');
    }
  };

  const fillClass = (id: string) => {
    const c = classes.find(x => x.id === id);
    if (!c?.entry_code) return;
    setText(`${window.location.origin}/classroom-entry?code=${c.entry_code}`);
    if (!title.trim()) setTitle(`${c.name} 입장`);
  };

  const chip = (on: boolean) =>
    `px-4 py-2 rounded-xl text-sm font-bold transition-all ${on ? 'bg-primary text-white shadow' : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary'}`;

  return (
    <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-black text-on-surface mb-2">QR로 만들 링크나 글자</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            placeholder="https://… 주소를 붙여넣거나 글자를 입력하세요"
            className="w-full rounded-2xl border border-surface-container-high bg-surface p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {classes.length > 0 && (
          <div>
            <label className="block text-sm font-black text-on-surface mb-2">내 반 학생 입장 링크 넣기</label>
            <select
              value=""
              onChange={e => fillClass(e.target.value)}
              className="w-full rounded-xl border border-surface-container-high bg-surface px-3 py-3 text-sm"
            >
              <option value="">반을 고르면 입장 링크가 위 칸에 들어가요</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-black text-on-surface mb-2">QR 위에 넣을 제목 (선택)</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value.slice(0, 40))}
            placeholder="예: 3반 수업 입장"
            className="w-full rounded-xl border border-surface-container-high bg-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <div className="text-sm font-black text-on-surface mb-2">색</div>
            <div className="flex gap-2">{COLORS.map(c => <button key={c.id} onClick={() => setColor(c.id)} className={chip(color === c.id)}>{c.label}</button>)}</div>
          </div>
          <div>
            <div className="text-sm font-black text-on-surface mb-2">저장 크기</div>
            <div className="flex gap-2">{SIZES.map(s => <button key={s.id} onClick={() => setSizeId(s.id)} className={chip(sizeId === s.id)}>{s.label}</button>)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5">
        <div className="w-full max-w-sm aspect-square rounded-3xl bg-white border border-surface-container-high flex flex-col items-center justify-center p-4 shadow-sm">
          {dataUrl ? (
            <>
              {title.trim() && <div className="font-black text-lg mb-2 text-center break-keep" style={{ color: hex }}>{title.trim()}</div>}
              <img ref={previewRef} src={dataUrl} alt="만들어진 QR 코드" className="w-full min-h-0 object-contain" />
            </>
          ) : (
            <p className="text-sm text-on-surface-variant text-center px-6 break-keep">{err || '왼쪽에 링크나 글자를 넣으면 여기에 QR이 바로 나타나요'}</p>
          )}
        </div>
        {err && dataUrl && <p className="text-sm text-error">{err}</p>}

        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={download} disabled={!dataUrl} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-primary text-white font-black text-sm disabled:opacity-40 active:scale-95 transition-all">
            <Download size={16} /> 이미지로 저장
          </button>
          <button onClick={copy} disabled={!dataUrl} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-container-low text-on-surface font-bold text-sm disabled:opacity-40 hover:bg-primary/10 active:scale-95 transition-all">
            {copied ? <><Check size={16} /> 복사됨</> : <><Copy size={16} /> 복사</>}
          </button>
          <button onClick={() => setFull(true)} disabled={!dataUrl} className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-container-low text-on-surface font-bold text-sm disabled:opacity-40 hover:bg-primary/10 active:scale-95 transition-all">
            <Maximize2 size={16} /> 크게 띄우기
          </button>
        </div>
      </div>

      {full && dataUrl && createPortal(
        <div className="fixed inset-0 z-[10050] bg-white flex flex-col items-center justify-center p-6" onClick={() => setFull(false)}>
          <button className="absolute top-5 right-5 w-12 h-12 rounded-2xl bg-surface-container-low flex items-center justify-center" aria-label="닫기"><X size={22} /></button>
          {title.trim() && <div className="font-black text-4xl mb-6 text-center break-keep" style={{ color: hex }}>{title.trim()}</div>}
          <img src={dataUrl} alt="QR 코드" className="max-h-[80vh] max-w-[90vw] aspect-square object-contain" />
        </div>,
        document.body,
      )}
    </div>
  );
};

export default QrGenerator;
