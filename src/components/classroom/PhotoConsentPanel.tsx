import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Power, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  buildConsentLink, createOrRotateConsentKey, fetchConsents, getConsentKey, setConsentKeyActive, withdrawConsent,
  type ConsentKey, type ConsentRow,
} from '../../lib/photoConsent';
import { appConfirm } from '../../lib/appDialog';

interface Student { id: string; full_name: string }

// 사진·얼굴 노출 동의 서명 링크 관리 + 학생별 동의 현황
const PhotoConsentPanel = ({ userId, classId }: { userId: string; classId: string }) => {
  const [key, setKey] = useState<ConsentKey | null>(null);
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [sig, setSig] = useState<ConsentRow | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!classId) return;
    try {
      const [k, r, s] = await Promise.all([
        getConsentKey(classId),
        fetchConsents(classId),
        supabase.from('students').select('id, full_name').eq('class_id', classId).order('full_name'),
      ]);
      setKey(k); setRows(r); setStudents((s.data ?? []) as Student[]);
    } catch (e: any) { setError(e?.message ?? '불러오지 못했어요.'); }
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e: any) { setError(e?.message ?? '처리하지 못했어요.'); } finally { setBusy(false); }
  };

  // 학생마다 가장 최근 서명(철회 안 된 것)을 기준으로 상태를 정한다
  const status = useMemo(() => {
    const latest = (s: Student) => rows.find(r => r.student_id === s.id) ?? rows.find(r => !r.student_id && r.student_name === s.full_name);
    const list = students.map(s => {
      const r = latest(s);
      const state: 'none' | 'withdrawn' | 'no' | 'record' | 'promo' =
        !r ? 'none' : r.withdrawn_at ? 'withdrawn' : r.consent_promo ? 'promo' : r.consent_record ? 'record' : 'no';
      return { s, r, state };
    });
    const matchedIds = new Set(list.map(x => x.r?.id).filter(Boolean));
    const unmatched = rows.filter(r => !matchedIds.has(r.id));
    return { list, unmatched };
  }, [students, rows]);

  const notOk = status.list.filter(x => x.state === 'none' || x.state === 'no' || x.state === 'withdrawn');
  const label: Record<string, { t: string; c: string }> = {
    none: { t: '미확인', c: 'bg-gray-100 text-gray-600' },
    withdrawn: { t: '철회', c: 'bg-rose-100 text-rose-700' },
    no: { t: '동의 안 함', c: 'bg-rose-100 text-rose-700' },
    record: { t: '기록·보고만', c: 'bg-amber-100 text-amber-700' },
    promo: { t: '홍보까지', c: 'bg-emerald-100 text-emerald-700' },
  };

  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(buildConsentLink(key.token));
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-indigo-600" />
        <p className="text-sm font-bold text-gray-900">사진·얼굴 노출 동의 서명</p>
        {key && <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${key.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{key.is_active ? '켜짐' : '꺼짐'}</span>}
        <button onClick={load} className="ml-auto p-1 text-gray-400 hover:text-gray-700" aria-label="새로고침"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-gray-500">수업 시간에 이 링크(또는 가정통신문 QR)로 보호자·학생이 휴대폰에서 서명해요. 학생 명단은 서명 화면에 보이지 않아요.</p>

      {!key ? (
        <button disabled={busy} onClick={() => run(async () => setKey(await createOrRotateConsentKey(userId, classId)))}
          className="inline-flex items-center gap-1 bg-indigo-600 text-white text-sm font-semibold rounded-lg px-3 py-2">동의 서명 링크 만들기</button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={copy} className="inline-flex items-center gap-1 bg-indigo-600 text-white text-sm font-semibold rounded-lg px-3 py-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? '복사됨' : '링크 복사'}
          </button>
          <button disabled={busy} onClick={() => run(async () => { await setConsentKeyActive(key.id, !key.is_active); setKey({ ...key, is_active: !key.is_active }); })}
            className="inline-flex items-center gap-1 border border-gray-300 text-gray-700 text-sm rounded-lg px-3 py-2"><Power className="w-4 h-4" /> {key.is_active ? '끄기' : '켜기'}</button>
          <button disabled={busy} onClick={async () => { if (await appConfirm('새 링크를 만들면 지금 링크는 바로 못 쓰게 됩니다. 계속할까요?')) run(async () => setKey(await createOrRotateConsentKey(userId, classId))); }}
            className="inline-flex items-center gap-1 border border-gray-300 text-gray-700 text-sm rounded-lg px-3 py-2"><RefreshCw className="w-4 h-4" /> 새 링크</button>
        </div>
      )}

      {students.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          {notOk.length > 0 ? (
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              동의가 확인되지 않은 학생 {notOk.length}명이 있어요. 사진을 공유하거나 올리기 전에 이 학생들이 나온 사진인지 확인하세요.
            </p>
          ) : <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">모든 학생의 동의가 확인됐어요.</p>}
          <button onClick={() => setOpen(o => !o)} className="text-xs text-indigo-600 underline">{open ? '학생별 현황 접기' : `학생별 현황 보기 (${students.length}명)`}</button>
          {open && (
            <ul className="divide-y divide-gray-100 text-sm">
              {status.list.map(({ s, r, state }) => (
                <li key={s.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-gray-800">{s.full_name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${label[state].c}`}>{label[state].t}</span>
                  {r && <button onClick={() => setSig(r)} className="text-xs text-gray-500 underline">서명</button>}
                </li>
              ))}
              {status.unmatched.map(r => (
                <li key={r.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-gray-800">{r.student_name} <span className="text-xs text-gray-400">(명단과 이름이 달라 연결 안 됨)</span></span>
                  <button onClick={() => setSig(r)} className="text-xs text-gray-500 underline">서명</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {sig && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4" onClick={() => setSig(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center">
              <p className="font-bold text-gray-900 flex-1">{sig.student_name}</p>
              <button onClick={() => setSig(null)} aria-label="닫기"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <p className="text-xs text-gray-500">
              {sig.signer_relation === 'guardian' ? '보호자' : '학생 본인'} {sig.signer_name} · {new Date(sig.signed_at).toLocaleString('ko-KR')}<br />
              수업 기록·보고 {sig.consent_record ? '동의' : '미동의'} / 홍보 {sig.consent_promo ? '동의' : '미동의'}
              {sig.withdrawn_at && <b className="text-rose-600"> · 철회됨</b>}
            </p>
            <img src={sig.signature} alt="서명" className="w-full border border-gray-200 rounded-lg bg-white" />
            <button disabled={busy} onClick={() => run(async () => { await withdrawConsent(sig.id, !sig.withdrawn_at); setSig(null); await load(); })}
              className="w-full border border-gray-300 text-sm rounded-lg py-2 text-gray-700 inline-flex items-center justify-center gap-1">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} {sig.withdrawn_at ? '철회 취소' : '동의 철회로 표시'}
            </button>
          </div>
        </div>, document.body)}
    </div>
  );
};

export default PhotoConsentPanel;
