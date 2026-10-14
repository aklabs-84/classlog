import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { checkConsentLink, submitConsent } from '../lib/photoConsent';

// 보호자(또는 학생)가 휴대폰으로 사진·얼굴 노출 동의서에 서명하는 화면 (로그인 없음)
const PhotoConsentSign = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [className, setClassName] = useState('');
  const [state, setState] = useState<'loading' | 'ok' | 'invalid' | 'done'>('loading');
  const [studentName, setStudentName] = useState('');
  const [signerName, setSignerName] = useState('');
  const [relation, setRelation] = useState<'guardian' | 'self'>('guardian');
  const [agreeRecord, setAgreeRecord] = useState(false);
  const [agreePromo, setAgreePromo] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    checkConsentLink(token).then(r => { if (r) { setClassName(r.class_name); setState('ok'); } else setState('invalid'); });
  }, [token]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current!.getContext('2d')!;
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    setHasInk(true);
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const submit = async () => {
    setError('');
    if (!studentName.trim() || !signerName.trim()) { setError('학생 이름과 서명하는 분 이름을 적어 주세요.'); return; }
    if (!hasInk) { setError('아래 칸에 서명해 주세요.'); return; }
    setBusy(true);
    try {
      await submitConsent({
        token, student_name: studentName, signer_name: signerName, relation,
        consent_record: agreeRecord, consent_promo: agreePromo,
        signature: canvasRef.current!.toDataURL('image/png'),
      });
      setState('done');
    } catch (e: any) {
      setError(e?.message ?? '제출하지 못했어요.');
    } finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (state === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="font-bold text-gray-900 mb-1">이 링크는 지금 쓸 수 없어요</p>
          <p className="text-sm text-gray-500">선생님께 새 링크를 받아 주세요.</p>
        </div>
      </div>
    );
  }
  if (state === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="font-bold text-gray-900 text-lg mb-1">제출했어요</p>
          <p className="text-sm text-gray-500">감사합니다. 동의 내용은 선생님께 전달됐어요. 이 화면은 닫으셔도 돼요.</p>
        </div>
      </div>
    );
  }

  const check = 'w-5 h-5 mt-0.5 accent-indigo-600 shrink-0';
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center p-4">
      <div className="w-full max-w-md py-6 space-y-4">
        <div>
          <p className="text-xs font-semibold text-indigo-600 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> 사진·얼굴 노출 동의서</p>
          <h1 className="text-xl font-bold text-gray-900">{className}</h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm text-gray-600 space-y-2">
          <p>수업 중 촬영한 사진·영상에 학생의 얼굴이 나올 수 있어요. 아래 목적에 쓰는 것에 동의하는지 선택해 주세요.</p>
          <p className="text-xs text-gray-400">동의하지 않아도 수업 참여에는 아무 불이익이 없어요. 동의는 언제든 선생님께 말씀하시면 철회할 수 있어요. 만 14세 미만 학생은 보호자(법정대리인)가 서명해 주세요.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <label className="flex gap-3 text-sm text-gray-800"><input type="checkbox" className={check} checked={agreeRecord} onChange={e => setAgreeRecord(e.target.checked)} />
            <span><b>수업 기록·결과 보고</b>에 사용하는 것에 동의합니다. (수업 갤러리, 학교·기관에 제출하는 결과 보고)</span></label>
          <label className="flex gap-3 text-sm text-gray-800"><input type="checkbox" className={check} checked={agreePromo} onChange={e => setAgreePromo(e.target.checked)} />
            <span><b>홍보 활동</b>에 사용하는 것에 동의합니다. (SNS, 블로그, 홍보물 등 외부 공개)</span></label>
          <p className="text-xs text-gray-400">둘 다 체크하지 않으면 "동의하지 않음"으로 기록돼요.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">학생 이름</label>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} maxLength={30} className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">서명하는 분</label>
            <div className="flex gap-2 mb-2">
              {([['guardian', '보호자'], ['self', '학생 본인']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setRelation(k)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold border ${relation === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}>{l}</button>
              ))}
            </div>
            <input value={signerName} onChange={e => setSignerName(e.target.value)} maxLength={30} placeholder="서명하는 분 이름" className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base outline-none focus:border-indigo-500" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-gray-700">서명 (손가락으로 그려 주세요)</label>
              <button type="button" onClick={clear} className="text-xs text-gray-500 underline">지우기</button>
            </div>
            <canvas ref={canvasRef} width={600} height={240}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{ touchAction: 'none' }}
              className="w-full h-40 border border-gray-300 rounded-xl bg-white" />
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button onClick={submit} disabled={busy} className="w-full bg-indigo-600 text-white rounded-xl py-4 text-base font-bold disabled:opacity-60 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-5 h-5 animate-spin" />} 제출하기
        </button>
      </div>
    </div>
  );
};

export default PhotoConsentSign;
