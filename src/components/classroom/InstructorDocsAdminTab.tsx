import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  useInstructorDocs, DOC_KIND_LABEL, DOC_ACCEPT, validateDocFile, uploadDocFile, openDocFile, subStatusLabel,
  type DocKind, type DocRequirement, type DocSubmission,
} from '../../lib/instructorDocs';
import {
  Plus, X, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, Paperclip, CheckSquare, PenLine, FileSignature,
  Check, Clock, AlertTriangle, Radio, Download,
} from 'lucide-react';

interface Props {
  projectId: string;
  /** teacher_id → 이름 (이미 불러온 반 목록에서 만든 이름표) */
  teacherNames: Record<string, string>;
  /** 학교 화면에서 쓸 때: 그 학교 id. 없으면 사업(프로젝트) 전체 화면 */
  schoolId?: string;
  /** 사업 화면에서 학교 이름표 */
  schools?: { id: string; name: string }[];
  /** 강사 id → 맡은 학교 id 목록 (어떤 서류가 누구에게 적용되는지 계산용) */
  teacherSchools?: Record<string, string[]>;
}

const KIND_ICON: Record<DocKind, typeof Paperclip> = {
  file: Paperclip, consent: CheckSquare, signature: PenLine, contract_sign: FileSignature,
};

const TONE_STYLE = {
  none: 'bg-surface-container-high text-on-surface-variant',
  wait: 'bg-amber-50 text-amber-700',
  ok: 'bg-green-50 text-green-700',
  bad: 'bg-red-50 text-red-600',
} as const;

interface EditState {
  id: string | null;
  title: string;
  kind: DocKind;
  description: string;
  consent_text: string;
  required: boolean;
  form_path: string | null;
  form_name: string | null;
  contract_path: string | null;
  contract_name: string | null;
}

const emptyEdit = (): EditState => ({
  id: null, title: '', kind: 'file', description: '', consent_text: '', required: true,
  form_path: null, form_name: null, contract_path: null, contract_name: null,
});

type Mode = 'common' | 'custom';

export default function InstructorDocsAdminTab({ projectId, teacherNames, schoolId, schools = [], teacherSchools = {} }: Props) {
  const { reqs: allReqs, subs, loading, error, live, reload } = useInstructorDocs(projectId, { seed: !schoolId });

  // 학교별 방식 (공통 적용 / 학교별 지정)
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const loadModes = useCallback(async () => {
    const { data } = await supabase.from('instructor_doc_school_settings').select('school_id, mode').eq('project_id', projectId);
    const m: Record<string, Mode> = {};
    (data || []).forEach((r: any) => { m[r.school_id] = r.mode; });
    setModes(m);
  }, [projectId]);
  useEffect(() => { loadModes(); }, [loadModes]);
  const modeOf = (sid: string): Mode => modes[sid] || 'common';
  const mode: Mode = schoolId ? modeOf(schoolId) : 'common';
  const schoolName = (sid: string | null) => schools.find(x => x.id === sid)?.name || '학교';

  // 이 화면에서 직접 관리하는 서류: 사업 화면=공통, 학교 화면(학교별 지정일 때)=그 학교 전용
  const myReqs = useMemo(
    () => allReqs.filter(r => (r.school_id ?? null) === (schoolId && mode === 'custom' ? schoolId : null)),
    [allReqs, schoolId, mode],
  );
  const commonReqs = useMemo(() => allReqs.filter(r => !r.school_id), [allReqs]);
  const canEditList = !schoolId || mode === 'custom';
  // 제출 현황 표에 나오는 서류
  const reqs = useMemo(() => {
    if (!schoolId) return allReqs;
    return mode === 'custom' ? allReqs.filter(r => r.school_id === schoolId) : commonReqs;
  }, [allReqs, commonReqs, schoolId, mode]);
  // 이 강사에게 이 서류가 적용되는가
  const applies = (iid: string, r: DocRequirement) => {
    if (schoolId) return true;
    const mine = teacherSchools[iid] || [];
    if (!r.school_id) return mine.length === 0 || mine.some(sid => modeOf(sid) !== 'custom');
    return mine.includes(r.school_id) && modeOf(r.school_id) === 'custom';
  };
  const [modeBusy, setModeBusy] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'form' | 'contract' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [detail, setDetail] = useState<{ req: DocRequirement; instructorId: string } | null>(null);

  const instructors = useMemo(
    () => Object.entries(teacherNames).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [teacherNames],
  );
  const subMap = useMemo(() => {
    const m = new Map<string, DocSubmission>();
    subs.forEach(s => m.set(`${s.requirement_id}:${s.instructor_id}`, s));
    return m;
  }, [subs]);
  const reqsFor = (iid: string) => reqs.filter(r => r.required && applies(iid, r));
  const doneCount = (iid: string) =>
    reqsFor(iid).filter(r => subMap.get(`${r.id}:${iid}`)?.status !== undefined).length;
  const visibleInstructors = onlyMissing
    ? instructors.filter(i => doneCount(i.id) < reqsFor(i.id).length)
    : instructors;

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  const handleFormFile = async (which: 'form' | 'contract', file: File) => {
    const err = validateDocFile(file, which === 'contract');
    if (err) { flash(err); return; }
    setUploading(which);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = await uploadDocFile(projectId, '_forms', which, file, ext);
      setEdit(e => e && (which === 'form'
        ? { ...e, form_path: path, form_name: file.name }
        : { ...e, contract_path: path, contract_name: file.name }));
    } catch {
      flash('업로드에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!edit) return;
    if (!edit.title.trim()) { flash('서류 이름을 적어 주세요.'); return; }
    if (edit.kind === 'contract_sign' && !edit.contract_path) { flash('서명받을 계약서 PDF를 올려 주세요.'); return; }
    if ((edit.kind === 'consent' || edit.kind === 'signature') && !edit.consent_text.trim()) {
      flash('동의문(서약 내용)을 적어 주세요.'); return;
    }
    setSaving(true);
    const row = {
      title: edit.title.trim(),
      kind: edit.kind,
      description: edit.description.trim() || null,
      consent_text: edit.kind === 'consent' || edit.kind === 'signature' ? edit.consent_text.trim() : null,
      required: edit.required,
      form_path: edit.form_path, form_name: edit.form_name,
      contract_path: edit.kind === 'contract_sign' ? edit.contract_path : null,
      contract_name: edit.kind === 'contract_sign' ? edit.contract_name : null,
    };
    const { error: err } = edit.id
      ? await supabase.from('instructor_doc_requirements').update(row).eq('id', edit.id)
      : await supabase.from('instructor_doc_requirements').insert({ ...row, project_id: projectId, school_id: schoolId && mode === 'custom' ? schoolId : null, sort_order: (myReqs[myReqs.length - 1]?.sort_order ?? 0) + 1 });
    setSaving(false);
    if (err) { flash('저장에 실패했어요. 다시 시도해 주세요.'); return; }
    setEdit(null);
    reload();
  };

  const remove = async (r: DocRequirement) => {
    const n = subs.filter(s => s.requirement_id === r.id).length;
    const warn = n > 0 ? `\n이미 제출된 ${n}건의 기록도 함께 사라져요.` : '';
    if (!confirm(`'${r.title}' 서류를 삭제할까요?${warn}`)) return;
    const { error: err } = await supabase.from('instructor_doc_requirements').delete().eq('id', r.id);
    if (err) { flash('삭제에 실패했어요.'); return; }
    reload();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const a = myReqs[idx], b = myReqs[idx + dir];
    if (!a || !b) return;
    // 순서값이 같을 수 있어 목록 순서대로 다시 번호를 매겨 두 칸만 바꾼다
    const order = myReqs.map(r => r.id);
    [order[idx], order[idx + dir]] = [order[idx + dir], order[idx]];
    await Promise.all(order.map((id, i) =>
      supabase.from('instructor_doc_requirements').update({ sort_order: i + 1 }).eq('id', id)));
    reload();
  };

  const changeMode = async (next: Mode) => {
    if (!schoolId || next === mode) return;
    setModeBusy(true);
    const { data, error: err } = await supabase.rpc('set_school_docs_mode', { p_school: schoolId, p_mode: next });
    setModeBusy(false);
    if (err || (data as any)?.error) { flash('바꾸지 못했어요. 다시 시도해 주세요.'); return; }
    await loadModes();
    reload();
  };

  // 학교별 지정을 처음 켰을 때, 공통 서류를 그대로 복사해서 시작
  const copyCommon = async () => {
    if (!schoolId || commonReqs.length === 0) return;
    const rows = commonReqs.map((r, i) => ({
      project_id: projectId, school_id: schoolId, title: r.title, description: r.description, kind: r.kind,
      consent_text: r.consent_text, form_path: r.form_path, form_name: r.form_name,
      contract_path: r.contract_path, contract_name: r.contract_name, required: r.required, sort_order: i + 1,
    }));
    const { error: err } = await supabase.from('instructor_doc_requirements').insert(rows);
    if (err) { flash('복사하지 못했어요.'); return; }
    reload();
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;
  if (error) return <p className="py-10 text-center text-sm text-red-600">불러오지 못했어요. 새로고침 후 다시 시도해 주세요.</p>;

  return (
    <div className="space-y-6">
      {msg && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] bg-on-surface text-surface px-4 py-2 rounded-full text-sm font-bold shadow-lg">{msg}</div>}

      {schoolId && (
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 sm:p-5">
          <h3 className="font-black text-base mb-1">이 학교는 어떤 서류를 받을까요?</h3>
          <p className="text-xs text-on-surface-variant mb-3">언제든 바꿀 수 있어요. 이미 낸 기록은 지워지지 않습니다.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {([
              ['common', '사업 공통 서류 그대로', `사업 전체에서 정한 서류 ${commonReqs.length}개를 이 학교 강사에게도 똑같이 받아요.`],
              ['custom', '이 학교만 따로 지정', '이 학교 강사에게는 아래에서 정한 서류만 받아요. (공통 서류는 적용되지 않아요)'],
            ] as const).map(([k, t, d]) => (
              <button key={k} disabled={modeBusy} onClick={() => changeMode(k)}
                className={`text-left rounded-2xl border-2 p-3 transition-all ${mode === k ? 'border-primary bg-primary/5' : 'border-outline-variant/40'}`}>
                <span className="flex items-center gap-1.5 text-sm font-black">
                  <span className={`w-4 h-4 rounded-full border-2 ${mode === k ? 'border-primary bg-primary' : 'border-outline-variant'}`} /> {t}
                </span>
                <span className="block text-xs text-on-surface-variant mt-1">{d}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 필요한 서류 ── */}
      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="font-black text-base">{schoolId ? (mode === 'custom' ? '이 학교에서 받을 서류' : '적용 중인 서류 (사업 공통)') : '필요한 서류 (사업 공통)'}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {schoolId
                ? (mode === 'custom' ? '이 학교에 배정된 강사에게만 "시작 안내"로 보여집니다.' : '고치려면 사업 화면의 [강사 제출 서류]에서 바꾸거나, 위에서 "이 학교만 따로 지정"을 고르세요.')
                : '"사업 공통"을 쓰는 학교의 강사에게 "시작 안내"로 보여집니다. 학교별로 다르게 받으려면 각 학교 화면에서 정하세요.'}
            </p>
            {!schoolId && schools.some(x => modeOf(x.id) === 'custom') && (
              <p className="text-xs font-bold text-primary mt-1">학교별 지정 중: {schools.filter(x => modeOf(x.id) === 'custom').map(x => x.name).join(', ')}</p>
            )}
          </div>
          {canEditList && (
            <button
              onClick={() => setEdit(emptyEdit())}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold"
            >
              <Plus size={15} /> 서류 추가
            </button>
          )}
        </div>
        {schoolId && mode === 'common' ? (
          commonReqs.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">사업 공통 서류가 아직 없어요.</p>
          ) : (
            <ul className="divide-y divide-outline-variant/20">
              {commonReqs.map((r, i) => (
                <li key={r.id} className="py-2.5 flex items-center gap-2 text-sm">
                  <span className="w-6 text-center text-xs font-black text-on-surface-variant">{i + 1}</span>
                  <span className="flex-1 min-w-0 font-bold truncate">{r.title}</span>
                  <span className="text-xs text-on-surface-variant">{DOC_KIND_LABEL[r.kind]} · {r.required ? '필수' : '선택'}</span>
                </li>
              ))}
            </ul>
          )
        ) : myReqs.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-on-surface-variant">아직 서류가 없어요. [서류 추가]로 만들어 주세요.</p>
            {schoolId && commonReqs.length > 0 && (
              <button onClick={copyCommon} className="px-3 py-2 rounded-xl border border-primary text-primary text-sm font-bold">
                사업 공통 서류 {commonReqs.length}개를 복사해서 시작하기
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {myReqs.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={r.id} className="py-2.5 flex items-center gap-2">
                  <div className="flex flex-col">
                    <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로" className="p-0.5 text-on-surface-variant disabled:opacity-25"><ArrowUp size={14} /></button>
                    <button disabled={i === myReqs.length - 1} onClick={() => move(i, 1)} aria-label="아래로" className="p-0.5 text-on-surface-variant disabled:opacity-25"><ArrowDown size={14} /></button>
                  </div>
                  <span className="w-6 text-center text-xs font-black text-on-surface-variant">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{r.title}</p>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1.5 flex-wrap">
                      <Icon size={12} /> {DOC_KIND_LABEL[r.kind]}
                      <span>· {r.required ? '필수' : '선택'}</span>
                      {r.form_name && <span>· 양식 있음</span>}
                    </p>
                  </div>
                  <button onClick={() => setEdit({
                    id: r.id, title: r.title, kind: r.kind, description: r.description || '', consent_text: r.consent_text || '',
                    required: r.required, form_path: r.form_path, form_name: r.form_name,
                    contract_path: r.contract_path, contract_name: r.contract_name,
                  })} aria-label="수정" className="p-2 rounded-lg hover:bg-surface-container"><Pencil size={15} /></button>
                  <button onClick={() => remove(r)} aria-label="삭제" className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 제출 현황 (실시간) ── */}
      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-base">제출 현황</h3>
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${live ? 'bg-green-50 text-green-700' : 'bg-surface-container-high text-on-surface-variant'}`}>
              <Radio size={11} /> {live ? '실시간' : '8초마다 갱신'}
            </span>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
            다 못 낸 강사만 보기
          </label>
        </div>
        {instructors.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-6 text-center">아직 배정된 강사가 없어요. [강사 관리]에서 반에 강사를 배정하면 여기에 나타나요.</p>
        ) : reqs.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-6 text-center">서류를 먼저 추가해 주세요.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="text-xs text-on-surface-variant">
                  <th className="text-left font-bold py-2 px-1 sticky left-0 bg-surface-container-lowest">강사</th>
                  {reqs.map(r => <th key={r.id} className="font-bold py-2 px-1 text-center max-w-[96px]"><span className="line-clamp-2">{r.title}</span>{r.school_id && !schoolId && <span className="block text-[10px] font-normal text-primary line-clamp-1">{schoolName(r.school_id)}</span>}</th>)}
                  <th className="font-bold py-2 px-1 text-center">진행</th>
                </tr>
              </thead>
              <tbody>
                {visibleInstructors.map(inst => (
                  <tr key={inst.id} className="border-t border-outline-variant/20">
                    <td className="py-2 px-1 font-bold sticky left-0 bg-surface-container-lowest whitespace-nowrap">{inst.name} 선생님</td>
                    {reqs.map(r => {
                      if (!applies(inst.id, r)) return <td key={r.id} className="py-1.5 px-1 text-center text-on-surface-variant/30" title="이 강사에게는 해당 없음">·</td>;
                      const s = subMap.get(`${r.id}:${inst.id}`);
                      const st = subStatusLabel(s);
                      return (
                        <td key={r.id} className="py-1.5 px-1 text-center">
                          <button
                            disabled={!s}
                            onClick={() => s && setDetail({ req: r, instructorId: inst.id })}
                            title={st.text}
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${TONE_STYLE[st.tone]} ${s ? 'hover:ring-2 hover:ring-primary/40' : 'cursor-default'}`}
                          >
                            {st.tone === 'ok' ? <Check size={16} /> : st.tone === 'wait' ? <Clock size={15} /> : st.tone === 'bad' ? <AlertTriangle size={15} /> : <span className="text-xs">–</span>}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-2 px-1 text-center text-xs font-black whitespace-nowrap">{doneCount(inst.id)}/{reqsFor(inst.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-on-surface-variant mt-3">● 동그라미를 누르면 제출한 파일·서명을 열어 보고 "확인 완료"나 "다시 내 주세요"를 정할 수 있어요. 진행은 필수 서류 기준(낸 개수)입니다.</p>
      </section>

      {/* ── 서류 추가/수정 창 ── */}
      {edit && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !saving && setEdit(null)}>
          <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-black text-lg">{edit.id ? '서류 수정' : '서류 추가'}</h2>
              <button onClick={() => setEdit(null)} aria-label="닫기" className="p-1"><X size={20} /></button>
            </div>

            <label className="block">
              <span className="text-xs font-bold">서류 이름</span>
              <input value={edit.title} maxLength={100} onChange={e => setEdit({ ...edit, title: e.target.value })}
                placeholder="예: 통장 사본" className="mt-1 w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm bg-surface-container-lowest" />
            </label>

            <div>
              <span className="text-xs font-bold">어떻게 받을까요?</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(Object.keys(DOC_KIND_LABEL) as DocKind[]).map(k => {
                  const Icon = KIND_ICON[k];
                  const on = edit.kind === k;
                  return (
                    <button key={k} type="button" onClick={() => setEdit({ ...edit, kind: k })}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold text-left ${on ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant'}`}>
                      <Icon size={15} /> {DOC_KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1.5">
                {edit.kind === 'file' && '이수증·스캔본처럼 파일을 받을 때. PDF, HWP, HWPX, JPG, PNG (10MB 이하)'}
                {edit.kind === 'consent' && '개인정보 동의처럼 체크만 받을 때'}
                {edit.kind === 'signature' && '서약서처럼 동의 문구에 손서명을 받을 때'}
                {edit.kind === 'contract_sign' && '올려 둔 계약서 PDF를 강사가 읽고 서명하면, 서명이 찍힌 PDF가 저장돼요. (HWP 계약서는 "파일 올리기"로 받으세요)'}
              </p>
            </div>

            {(edit.kind === 'consent' || edit.kind === 'signature') && (
              <label className="block">
                <span className="text-xs font-bold">{edit.kind === 'consent' ? '동의문' : '서약 내용'}</span>
                <textarea value={edit.consent_text} rows={4} onChange={e => setEdit({ ...edit, consent_text: e.target.value })}
                  placeholder="강사에게 그대로 보여 줄 문구를 적어 주세요."
                  className="mt-1 w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm bg-surface-container-lowest" />
              </label>
            )}

            {edit.kind === 'contract_sign' && (
              <div>
                <span className="text-xs font-bold">서명받을 계약서 (PDF)</span>
                <FilePick name={edit.contract_name} busy={uploading === 'contract'} accept=".pdf"
                  onPick={f => handleFormFile('contract', f)}
                  onClear={() => setEdit({ ...edit, contract_path: null, contract_name: null })} />
              </div>
            )}

            <label className="block">
              <span className="text-xs font-bold">안내 문구 <span className="font-normal text-on-surface-variant">(선택: 발급 방법, 마감 등)</span></span>
              <textarea value={edit.description} rows={2} onChange={e => setEdit({ ...edit, description: e.target.value })}
                className="mt-1 w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm bg-surface-container-lowest" />
            </label>

            {edit.kind !== 'contract_sign' && (
              <div>
                <span className="text-xs font-bold">양식 파일 <span className="font-normal text-on-surface-variant">(선택: 강사가 내려받아 작성)</span></span>
                <FilePick name={edit.form_name} busy={uploading === 'form'} accept={DOC_ACCEPT}
                  onPick={f => handleFormFile('form', f)}
                  onClear={() => setEdit({ ...edit, form_path: null, form_name: null })} />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={edit.required} onChange={e => setEdit({ ...edit, required: e.target.checked })} />
              꼭 내야 하는 서류(필수)
            </label>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEdit(null)} disabled={saving} className="flex-1 py-3 rounded-xl border border-outline-variant font-bold text-sm">취소</button>
              <button onClick={save} disabled={saving || !!uploading} className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-1">
                {saving && <Loader2 size={14} className="animate-spin" />} 저장
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── 제출물 확인 창 ── */}
      {detail && (
        <SubmissionDetail
          req={detail.req}
          sub={subMap.get(`${detail.req.id}:${detail.instructorId}`)}
          name={teacherNames[detail.instructorId] || '강사'}
          onClose={() => setDetail(null)}
          onChanged={() => { reload(); }}
          flash={flash}
        />
      )}
    </div>
  );
}

function FilePick({ name, busy, accept, onPick, onClear }: {
  name: string | null; busy: boolean; accept: string; onPick: (f: File) => void; onClear: () => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <label className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-outline-variant text-sm font-bold cursor-pointer">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
        {name ? '다른 파일' : '파일 선택'}
        <input type="file" accept={accept} className="hidden" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      </label>
      {name && (
        <span className="text-xs text-on-surface-variant truncate flex items-center gap-1 min-w-0">
          <span className="truncate">{name}</span>
          <button type="button" onClick={onClear} aria-label="파일 빼기" className="shrink-0"><X size={13} /></button>
        </span>
      )}
    </div>
  );
}

function SubmissionDetail({ req, sub, name, onClose, onChanged, flash }: {
  req: DocRequirement; sub: DocSubmission | undefined; name: string;
  onClose: () => void; onChanged: () => void; flash: (t: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!sub) return null;
  const st = subStatusLabel(sub);

  const review = async (status: 'approved' | 'rejected' | 'submitted') => {
    if (status === 'rejected' && !note.trim()) { flash('다시 내 달라는 이유를 적어 주세요.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('review_instructor_doc', { p_submission: sub.id, p_status: status, p_note: note });
    setBusy(false);
    if (error || (data as any)?.error) { flash('처리에 실패했어요.'); return; }
    onChanged();
    onClose();
  };
  const open = async (p: string | null) => { if (p && !(await openDocFile(p))) flash('파일을 열 수 없어요.'); };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-black text-base">{req.title}</h2>
            <p className="text-xs text-on-surface-variant">{name} 선생님 · {new Date(sub.submitted_at).toLocaleString('ko-KR')}</p>
          </div>
          <button onClick={onClose} aria-label="닫기"><X size={20} /></button>
        </div>
        <span className={`inline-block text-xs font-black px-2.5 py-1 rounded-full ${TONE_STYLE[st.tone]}`}>{st.text}</span>

        <div className="space-y-2 text-sm">
          {sub.file_path && (
            <button onClick={() => open(sub.file_path)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-outline-variant font-bold text-left">
              <Download size={15} /> <span className="truncate">{sub.file_name || '제출 파일 열기'}</span>
            </button>
          )}
          {sub.signed_pdf_path && (
            <button onClick={() => open(sub.signed_pdf_path)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-outline-variant font-bold text-left">
              <FileSignature size={15} /> 서명된 계약서 열기
            </button>
          )}
          {sub.signature_path && (
            <button onClick={() => open(sub.signature_path)} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-outline-variant font-bold text-left">
              <PenLine size={15} /> 서명 이미지 열기
            </button>
          )}
          {sub.signed_name && <p className="text-xs">서명자 이름: <b>{sub.signed_name}</b>{sub.signed_at && ` · ${new Date(sub.signed_at).toLocaleString('ko-KR')}`}</p>}
          {sub.consent_checked && <p className="text-xs flex items-center gap-1"><Check size={13} /> 동의에 체크했어요</p>}
          {sub.status === 'rejected' && sub.review_note && <p className="text-xs text-red-600">반려 사유: {sub.review_note}</p>}
        </div>

        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="다시 내 달라고 할 때 이유를 적어 주세요"
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm bg-surface-container-lowest" />
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => review('rejected')} className="flex-1 py-2.5 rounded-xl border border-red-300 text-red-600 font-bold text-sm">다시 내 주세요</button>
          <button disabled={busy} onClick={() => review('approved')} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-bold text-sm">확인 완료</button>
        </div>
        {sub.status !== 'submitted' && (
          <button disabled={busy} onClick={() => review('submitted')} className="w-full text-xs font-bold text-on-surface-variant underline">검토 중으로 되돌리기</button>
        )}
      </div>
    </div>,
    document.body,
  );
}
