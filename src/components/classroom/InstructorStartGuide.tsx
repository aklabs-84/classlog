import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import SignaturePad, { type SignaturePadHandle } from '../common/SignaturePad';
import {
  useInstructorDocs, DOC_ACCEPT, DOC_KIND_LABEL, validateDocFile, uploadDocFile, openDocFile, fetchDocBytes,
  stampSignatureOnPdf, subStatusLabel, type DocRequirement, type DocSubmission,
} from '../../lib/instructorDocs';
import {
  ClipboardList, X, Loader2, Upload, Download, Check, Clock, AlertTriangle, ChevronRight, BookOpen, FileText, ExternalLink,
} from 'lucide-react';

interface Props {
  /** 이 반이 속한 프로젝트(또는 학교) id — 최상위 프로젝트는 서버에서 찾아 온다 */
  schoolProjectId: string;
}

const TONE = {
  none: 'bg-surface-container-high text-on-surface-variant',
  wait: 'bg-amber-50 text-amber-700',
  ok: 'bg-green-50 text-green-700',
  bad: 'bg-red-50 text-red-600',
} as const;

/** 배정받은 강사의 반 화면 맨 위에 항상 보이는 "시작 안내" 띠 + 제출 창 */
export default function InstructorStartGuide({ schoolProjectId }: Props) {
  const { user } = useAuth();
  const [rootId, setRootId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('idoc_root_project', { p_id: schoolProjectId }).then(({ data }) => {
      if (!cancelled) setRootId((data as string | null) || null);
    });
    return () => { cancelled = true; };
  }, [schoolProjectId]);

  if (!rootId || !user) return null;
  return <Inner projectId={rootId} schoolId={schoolProjectId} userId={user.id} open={open} setOpen={setOpen} />;
}

function Inner({ projectId, schoolId, userId, open, setOpen }: { projectId: string; schoolId: string; userId: string; open: boolean; setOpen: (v: boolean) => void }) {
  const { reqs: allReqs, subs, loading: docsLoading, reload } = useInstructorDocs(projectId);
  // 이 반의 학교가 '학교만 따로 지정'이면 그 학교 서류만, 아니면 사업 공통 서류만 (담당자 계정은 서버가 전부 주므로 화면에서도 거른다)
  const [custom, setCustom] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.from('instructor_doc_school_settings').select('mode').eq('school_id', schoolId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setCustom((data as any)?.mode === 'custom'); });
    return () => { cancelled = true; };
  }, [schoolId]);
  const loading = docsLoading || custom === null;
  const reqs = useMemo(() => allReqs.filter(r => (custom ? r.school_id === schoolId : !r.school_id)), [allReqs, custom, schoolId]);
  const subMap = useMemo(() => {
    const m = new Map<string, DocSubmission>();
    subs.filter(s => s.instructor_id === userId).forEach(s => m.set(s.requirement_id, s));
    return m;
  }, [subs, userId]);

  const required = reqs.filter(r => r.required);
  const doneReq = required.filter(r => subMap.has(r.id)).length;
  const rejected = reqs.filter(r => subMap.get(r.id)?.status === 'rejected').length;
  const allDone = required.length > 0 && doneReq === required.length && rejected === 0;

  // 처음 한 번만 자동으로 열어 준다 (가이드를 먼저 보도록 — 서류가 없어도 연다. 서류를 다 냈으면 열지 않는다)
  const seenKey = `idoc_seen_${projectId}_${userId}`;
  useEffect(() => {
    if (loading || allDone) return;
    try {
      if (!localStorage.getItem(seenKey)) { localStorage.setItem(seenKey, '1'); setOpen(true); }
    } catch { /* 저장 못 해도 띠는 계속 보임 */ }
  }, [loading, allDone, seenKey, setOpen]);

  if (loading) return null;
  // 서류가 하나도 요청되지 않은 사업이면 띠를 숨기지 않고 작은 버튼만 둔다 (가이드를 볼 곳이므로)
  const emptyReqs = reqs.length === 0;

  return (
    <>
      {allDone || emptyReqs ? (
        <button
          onClick={() => setOpen(true)}
          className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-black border border-green-200"
        >
          <ClipboardList size={13} /> 시작 안내 {allDone && <Check size={13} />}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`mb-3 w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left border-2 ${
            rejected > 0 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'
          }`}
        >
          <ClipboardList size={20} className={rejected > 0 ? 'text-red-600' : 'text-amber-600'} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-black text-on-surface">
              시작 안내 · 제출 서류 {doneReq}/{required.length} 완료
            </span>
            <span className="block text-xs text-on-surface-variant">
              {rejected > 0 ? `다시 내야 하는 서류가 ${rejected}건 있어요` : '눌러서 서류를 내고 사용 방법도 확인하세요'}
            </span>
          </span>
          <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-black text-primary">열기 <ChevronRight size={14} /></span>
        </button>
      )}
      {open && createPortal(
        <GuideModal projectId={projectId} reqs={reqs} subMap={subMap} onClose={() => setOpen(false)} onSaved={reload} />,
        document.body,
      )}
    </>
  );
}

function GuideModal({ projectId, reqs, subMap, onClose, onSaved }: {
  projectId: string; reqs: DocRequirement[]; subMap: Map<string, DocSubmission>; onClose: () => void; onSaved: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg flex items-center gap-2"><ClipboardList size={20} className="text-primary" /> 시작 안내</h2>
          <button onClick={onClose} aria-label="닫기"><X size={20} /></button>
        </div>

        <GuideBooks />

        <div>
          <h3 className="text-sm font-black mb-2">내가 낼 서류</h3>
          {reqs.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">아직 요청된 서류가 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {reqs.map(r => {
                const s = subMap.get(r.id);
                const st = subStatusLabel(s);
                const expanded = openId === r.id;
                const locked = s?.status === 'approved';
                return (
                  <li key={r.id} className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest">
                    <button className="w-full flex items-center gap-2 p-3 text-left" onClick={() => setOpenId(expanded ? null : r.id)}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold">{r.title}{!r.required && <span className="ml-1 text-[11px] font-normal text-on-surface-variant">(선택)</span>}</span>
                        <span className="block text-[11px] text-on-surface-variant">{DOC_KIND_LABEL[r.kind]}</span>
                      </span>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-full ${TONE[st.tone]}`}>
                        {st.tone === 'ok' && <Check size={12} />}{st.tone === 'wait' && <Clock size={12} />}{st.tone === 'bad' && <AlertTriangle size={12} />}
                        {st.text}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-3 pb-3 space-y-3 border-t border-outline-variant/20 pt-3">
                        {r.description && <p className="text-xs text-on-surface-variant whitespace-pre-wrap">{r.description}</p>}
                        {s?.status === 'rejected' && s.review_note && (
                          <p className="text-xs font-bold text-red-600 bg-red-50 rounded-lg px-2.5 py-2">다시 내 주세요: {s.review_note}</p>
                        )}
                        {r.form_path && (
                          <button onClick={() => openDocFile(r.form_path!)} className="inline-flex items-center gap-1 text-xs font-bold text-primary underline">
                            <Download size={13} /> 양식 내려받기 ({r.form_name})
                          </button>
                        )}
                        {locked ? (
                          <p className="text-xs font-bold text-green-700">담당자가 확인을 마쳤어요. 더 낼 필요가 없어요.</p>
                        ) : (
                          <SubmitForm projectId={projectId} req={r} sub={s} onDone={() => { onSaved(); setOpenId(null); }} />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const GUIDE_BOOKS = [
  { key: 'essential', title: '기본편', desc: '처음엔 이것만 보세요', file: '/guide/instructor-essential.pdf', tone: 'bg-primary/5 border-primary/20' },
  { key: 'detail', title: '상세편', desc: '막힐 때 찾아보세요', file: '/guide/instructor-detail.pdf', tone: 'bg-surface-container border-outline-variant/40' },
] as const;

/** 클래스룸 사용 가이드(PDF 2권) — 앱 안에서 바로 펼쳐 본다 */
function GuideBooks() {
  const [book, setBook] = useState<(typeof GUIDE_BOOKS)[number] | null>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm font-black flex items-center gap-2"><BookOpen size={18} className="text-primary" /> 클래스룸 사용 가이드</p>
      <p className="text-xs text-on-surface-variant">처음이라면 <b>기본편</b>부터 보세요. 화면 사진과 함께 어디를 누르는지 알려 드려요.</p>
      <div className="grid grid-cols-2 gap-2">
        {GUIDE_BOOKS.map(b => (
          <button key={b.key} onClick={() => setBook(b)} className={`rounded-2xl border-2 p-3 text-left ${b.tone}`}>
            <span className="block text-sm font-black">{b.key === 'essential' ? '📘' : '📗'} {b.title}</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">{b.desc}</span>
          </button>
        ))}
      </div>
      {book && createPortal(
        <div className="fixed inset-0 z-[210] bg-black/60 flex items-center justify-center p-0 sm:p-4" onClick={() => setBook(null)}>
          <div className="bg-surface w-full h-full sm:max-w-5xl sm:h-[92vh] sm:rounded-3xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-outline-variant/30">
              <h3 className="font-black text-base">{book.key === 'essential' ? '📘' : '📗'} 강사 가이드 · {book.title}</h3>
              <div className="flex items-center gap-3">
                <a href={book.file} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary underline">
                  <ExternalLink size={13} /> 새 창으로 열기
                </a>
                <button onClick={() => setBook(null)} aria-label="닫기"><X size={20} /></button>
              </div>
            </div>
            <iframe src={book.file} title={`강사 가이드 ${book.title}`} className="flex-1 w-full bg-white" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function SubmitForm({ projectId, req, sub, onDone }: { projectId: string; req: DocRequirement; sub?: DocSubmission; onDone: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState(sub?.signed_name || '');
  const [hasInk, setHasInk] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const folder = user?.id || '';

  const call = async (args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc('submit_instructor_doc', { p_requirement: req.id, ...args });
    if (error || (data as any)?.error) throw new Error((data as any)?.error || 'rpc');
  };
  const run = async (fn: () => Promise<void>) => {
    setErr(null); setBusy(true);
    try { await fn(); onDone(); } catch { setErr('제출에 실패했어요. 잠시 후 다시 시도해 주세요.'); } finally { setBusy(false); }
  };

  if (req.kind === 'file') {
    const pick = (f: File) => {
      const v = validateDocFile(f);
      if (v) { setErr(v); return; }
      run(async () => {
        const path = await uploadDocFile(projectId, folder, req.id.slice(0, 8), f, f.name.split('.').pop() || 'pdf');
        await call({ p_file_path: path, p_file_name: f.name });
      });
    };
    return (
      <div className="space-y-2">
        {sub?.file_name && <p className="text-xs flex items-center gap-1"><FileText size={13} /> 낸 파일: <b className="truncate">{sub.file_name}</b></p>}
        <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold cursor-pointer">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {sub ? '다시 올리기' : '파일 올리기'}
          <input type="file" accept={DOC_ACCEPT} className="hidden" disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
        </label>
        <p className="text-[11px] text-on-surface-variant">PDF, HWP, HWPX, JPG, PNG · 10MB 이하</p>
        {err && <p className="text-xs font-bold text-red-600">{err}</p>}
      </div>
    );
  }

  const needSign = req.kind === 'signature' || req.kind === 'contract_sign';
  const ready = agree && (!needSign || (name.trim() && hasInk));

  const submit = () => run(async () => {
    if (req.kind === 'consent') { await call({ p_consent: true }); return; }
    const sig = await padRef.current?.toBlob();
    if (!sig) throw new Error('no sig');
    const sigPath = await uploadDocFile(projectId, folder, `sig-${req.id.slice(0, 8)}`, sig, 'png');
    if (req.kind === 'signature') {
      await call({ p_consent: true, p_signature_path: sigPath, p_signed_name: name });
      return;
    }
    // 계약서 서명: 원본 PDF 마지막 장에 서명을 찍어 서명본을 만든다
    const pdfBytes = await fetchDocBytes(req.contract_path!);
    const sigBytes = new Uint8Array(await sig.arrayBuffer());
    const stamped = await stampSignatureOnPdf(pdfBytes, sigBytes, name);
    const signedBlob = new Blob([stamped as BlobPart], { type: 'application/pdf' });
    const signedPath = await uploadDocFile(projectId, folder, `signed-${req.id.slice(0, 8)}`, signedBlob, 'pdf');
    await call({ p_consent: true, p_signature_path: sigPath, p_signed_pdf_path: signedPath, p_signed_name: name });
  });

  return (
    <div className="space-y-3">
      {req.kind === 'contract_sign' && req.contract_path && (
        <button onClick={() => openDocFile(req.contract_path!)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant text-sm font-bold">
          <FileText size={15} /> 계약서 읽어 보기 ({req.contract_name})
        </button>
      )}
      {req.consent_text && (
        <div className="text-xs bg-surface-container rounded-xl p-3 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{req.consent_text}</div>
      )}
      <label className="flex items-start gap-2 text-sm font-bold">
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={e => setAgree(e.target.checked)} />
        {req.kind === 'contract_sign' ? '계약서 내용을 읽고 동의합니다' : '위 내용을 읽고 동의합니다'}
      </label>
      {needSign && (
        <>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="이름 (서명하는 분)" maxLength={30}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm bg-surface-container-lowest" />
          <SignaturePad ref={padRef} onChange={setHasInk} />
        </>
      )}
      {sub && <p className="text-[11px] text-on-surface-variant">이미 낸 기록이 있어요. 다시 내면 이전 기록은 바뀝니다.</p>}
      <button disabled={!ready || busy} onClick={submit}
        className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
        {busy && <Loader2 size={15} className="animate-spin" />}
        {req.kind === 'contract_sign' ? '서명하고 제출하기' : req.kind === 'signature' ? '서명하고 제출하기' : '동의하고 제출하기'}
      </button>
      {err && <p className="text-xs font-bold text-red-600">{err}</p>}
    </div>
  );
}
