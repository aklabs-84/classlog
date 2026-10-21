import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, Save, Copy, Check, RotateCcw } from 'lucide-react';
import { appConfirm } from '../../lib/appDialog';

type MsgKey = 'docs' | 'before' | 'after';
interface SavedMsg { text: string; base: string }
interface Info {
  address: string; waiting_place: string; parking: string; wifi: string; notes: string;
  class_info: Record<string, { location?: string; wifi?: string }>;
  messages: Partial<Record<MsgKey, SavedMsg>>;
}
const EMPTY: Info = { address: '', waiting_place: '', parking: '', wifi: '', notes: '', class_info: {}, messages: {} };

interface Props {
  projectId: string;
  schoolId: string;
  schoolName: string;
  startDate: string | null;
  endDate: string | null;
  classes: { id: string; name: string; teacherName: string | null }[];
}

const MSG_LABEL: Record<MsgKey, string> = { docs: '서류 제출 안내', before: '수업 전 공지', after: '수업 후 공지' };

const fmtDate = (d: string | null) => (d ? d.replace(/-/g, '.') : '');

export default function SchoolNoticeTab({ projectId, schoolId, schoolName, startDate, endDate, classes }: Props) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Info>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [reqs, setReqs] = useState<{ title: string; required: boolean }[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [active, setActive] = useState<MsgKey>('docs');
  const [draft, setDraft] = useState<Record<MsgKey, string>>({ docs: '', before: '', after: '' });
  const [copied, setCopied] = useState(false);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [infoR, modeR, reqR, commonR, schoolClsR] = await Promise.all([
        supabase.from('school_notice_info').select('*').eq('school_id', schoolId).maybeSingle(),
        supabase.from('instructor_doc_school_settings').select('mode').eq('school_id', schoolId).maybeSingle(),
        supabase.from('instructor_doc_requirements').select('title, required, school_id, sort_order, created_at').eq('project_id', projectId).order('sort_order').order('created_at'),
        supabase.from('classes').select('weekly_plan').eq('school_project_id', projectId).is('parent_class_id', null).maybeSingle(),
        supabase.from('classes').select('parent_class_id, weekly_plan, weekly_plan_custom').eq('school_project_id', schoolId),
      ]);
      const d: any = infoR.data;
      if (d) {
        setInfo({
          address: d.address || '', waiting_place: d.waiting_place || '', parking: d.parking || '', wifi: d.wifi || '', notes: d.notes || '',
          class_info: d.class_info || {}, messages: d.messages || {},
        });
      } else setInfo(EMPTY);

      const custom = (modeR.data as any)?.mode === 'custom';
      const rs = ((reqR.data || []) as any[]).filter(r => (custom ? r.school_id === schoolId : r.school_id == null));
      setReqs(rs.map(r => ({ title: r.title, required: !!r.required })));

      const rows = (schoolClsR.data || []) as any[];
      const root = rows.find(r => r.parent_class_id === null);
      const fixed = root ? !!root.weekly_plan_custom : rows.some(r => r.weekly_plan_custom);
      const base = root ?? rows.find(r => r.weekly_plan_custom);
      const plan = (fixed ? base?.weekly_plan : (commonR.data as any)?.weekly_plan) || [];
      setWeeks((plan as any[]).map(p => (p?.topic || '').trim()));
    } finally {
      setLoading(false);
    }
  }, [projectId, schoolId]);

  useEffect(() => { load(); }, [load]);

  // 수첩 내용으로 만든 기본 문구
  const generated = useMemo<Record<MsgKey, string>>(() => {
    const period = startDate && endDate ? `${fmtDate(startDate)} ~ ${fmtDate(endDate)}` : '';
    const total = weeks.length;
    const lines = (arr: (string | false | undefined)[]) => arr.filter(Boolean).join('\n');

    const docs = lines([
      `안녕하세요, ${schoolName} 수업 담당입니다.`,
      '수업 시작 전에 아래 서류를 제출해 주세요.',
      '',
      reqs.length
        ? reqs.map((r, i) => `${i + 1}. ${r.title}${r.required ? ' (필수)' : ' (선택)'}`).join('\n')
        : '(등록된 제출 서류가 없습니다)',
      '',
      '제출 방법: 클래스로그AI 강사 화면의 "제출 서류"에서 올려 주세요.',
      '궁금한 점은 편하게 연락 주세요. 감사합니다.',
    ]);

    const classLines = classes
      .map(c => {
        const ci = info.class_info[c.id] || {};
        const bits = [ci.location && `위치: ${ci.location}`, ci.wifi && `와이파이: ${ci.wifi}`].filter(Boolean);
        return bits.length ? `- ${c.name}${c.teacherName ? ` (${c.teacherName} 선생님)` : ''}: ${bits.join(' / ')}` : '';
      })
      .filter(Boolean);

    const before = lines([
      `안녕하세요, ${schoolName} 수업 담당입니다.`,
      `${period ? `${period} 동안 ` : ''}${total ? `총 ${total}차시 수업이 진행됩니다.` : '수업이 진행됩니다.'}`,
      '수업 전 꼭 확인해 주세요.',
      '',
      info.address && `■ 학교 주소: ${info.address}`,
      info.waiting_place && `■ 대기 장소: ${info.waiting_place}`,
      info.parking && `■ 주차: ${info.parking}`,
      info.wifi && `■ 와이파이: ${info.wifi}`,
      classLines.length ? `\n■ 반별 안내\n${classLines.join('\n')}` : '',
      info.notes && `\n■ 꼭 알아두세요\n${info.notes}`,
      '',
      '문의사항은 편하게 연락 주세요. 감사합니다.',
    ]);

    const after = lines([
      `안녕하세요, ${schoolName} 수업 담당입니다.`,
      '수업 후 아래 내용을 부탁드립니다.',
      '',
      '1. 클래스로그AI에서 오늘 수업 기록(출결·활동 결과)을 확인·정리해 주세요.',
      total ? `2. 전체 ${total}차시 중 진행한 차시를 체크해 주세요.` : '2. 진행한 차시를 체크해 주세요.',
      '3. 학생 특이사항이나 시설 문제가 있으면 알려 주세요.',
      info.notes && `\n■ 참고\n${info.notes}`,
      '',
      '오늘도 수고 많으셨습니다. 감사합니다.',
    ]);
    return { docs, before, after };
  }, [info, reqs, weeks, classes, schoolName, startDate, endDate]);

  // 저장본이 있으면 그걸, 없으면 기본 문구를 보여준다
  useEffect(() => {
    if (loading) return;
    setDraft({
      docs: info.messages.docs?.text ?? generated.docs,
      before: info.messages.before?.text ?? generated.before,
      after: info.messages.after?.text ?? generated.after,
    });
    // 저장본/불러오기가 바뀔 때만 초기화 (입력 중 덮어쓰지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, info.messages]);

  const saved = info.messages[active];
  const edited = !!saved && saved.text !== saved.base;
  const stale = !!saved && saved.base !== generated[active];
  const dirty = draft[active] !== (saved?.text ?? generated[active]);

  const persist = async (next: Info, okMsg: string) => {
    setSaving(true);
    const { error } = await supabase.from('school_notice_info').upsert({
      school_id: schoolId,
      address: next.address, waiting_place: next.waiting_place, parking: next.parking, wifi: next.wifi, notes: next.notes,
      class_info: next.class_info, messages: next.messages, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { flash('저장하지 못했어요. 다시 시도해 주세요.'); return false; }
    setInfo(next);
    flash(okMsg);
    return true;
  };

  const saveInfo = () => persist(info, '안내 수첩을 저장했어요.');

  const saveMessage = () =>
    persist({ ...info, messages: { ...info.messages, [active]: { text: draft[active], base: generated[active] } } }, '최종 문구를 저장했어요.');

  const regenerate = async () => {
    if ((edited || dirty) && !await appConfirm('직접 고친 문구가 사라지고 수첩 내용으로 새로 만들어져요. 계속할까요?')) return;
    const nextMsgs = { ...info.messages };
    delete nextMsgs[active];
    await persist({ ...info, messages: nextMsgs }, '새 문구로 다시 만들었어요.');
    setDraft(d => ({ ...d, [active]: generated[active] }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft[active]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { flash('복사하지 못했어요. 글을 직접 선택해 복사해 주세요.'); }
  };

  const setField = (k: keyof Omit<Info, 'class_info' | 'messages'>, v: string) => setInfo(p => ({ ...p, [k]: v }));
  const setClassField = (id: string, k: 'location' | 'wifi', v: string) =>
    setInfo(p => ({ ...p, class_info: { ...p.class_info, [id]: { ...p.class_info[id], [k]: v } } }));

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const inputCls = 'w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary';

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* 학교 안내 수첩 */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest p-4 space-y-3">
        <div>
          <h3 className="font-bold text-on-surface">학교 안내 수첩</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">여기에 적은 내용이 공지 문구에 자동으로 들어가요.</p>
        </div>
        {([
          ['address', '학교 주소', '예: 인천시 ○○구 ○○로 12'],
          ['waiting_place', '선생님 대기 장소', '예: 본관 1층 교무실 옆 상담실'],
          ['parking', '주차 상황', '예: 교내 주차 가능(정문 경비실에 방문 등록)'],
          ['wifi', '와이파이 정보', '예: 이름 SCHOOL_GUEST / 비번 12345678'],
        ] as const).map(([k, label, ph]) => (
          <label key={k} className="block">
            <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
            <input className={`${inputCls} mt-1`} value={info[k]} placeholder={ph} onChange={e => setField(k, e.target.value)} />
          </label>
        ))}
        <label className="block">
          <span className="text-xs font-semibold text-on-surface-variant">꼭 알아야 할 전달사항</span>
          <textarea rows={3} className={`${inputCls} mt-1`} value={info.notes} placeholder="예: 교실 열쇠는 행정실에서 수령, 점심 제공 없음"
            onChange={e => setField('notes', e.target.value)} />
        </label>

        <div>
          <span className="text-xs font-semibold text-on-surface-variant">반별 안내</span>
          {classes.length === 0 ? (
            <p className="text-xs text-on-surface-variant mt-1">아직 반이 없어요. 개요 탭에서 반을 먼저 추가해 주세요.</p>
          ) : (
            <div className="mt-1 space-y-2">
              {classes.map(c => (
                <div key={c.id} className="rounded-xl bg-surface-container-low p-2.5">
                  <div className="text-sm font-semibold">{c.name}{c.teacherName ? <span className="text-xs text-on-surface-variant font-normal"> · {c.teacherName}</span> : null}</div>
                  <div className="grid gap-2 sm:grid-cols-2 mt-1.5">
                    <input className={inputCls} placeholder="교실 위치 (예: 3층 컴퓨터실)" value={info.class_info[c.id]?.location || ''} onChange={e => setClassField(c.id, 'location', e.target.value)} />
                    <input className={inputCls} placeholder="와이파이 (이름/비번)" value={info.class_info[c.id]?.wifi || ''} onChange={e => setClassField(c.id, 'wifi', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={saveInfo} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 수첩 저장
        </button>
      </section>

      {/* 공지 만들기 */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest p-4 space-y-3">
        <div>
          <h3 className="font-bold text-on-surface">공지 문구</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {reqs.length}개 서류{weeks.length ? ` · 전체 ${weeks.length}차시` : ''}를 반영했어요. 고친 뒤 저장하면 그 문구가 최종본이 돼요.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(MSG_LABEL) as MsgKey[]).map(k => (
            <button key={k} onClick={() => setActive(k)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${active === k ? 'bg-primary text-on-primary border-primary' : 'border-slate-300 dark:border-slate-600 text-on-surface-variant'}`}>
              {MSG_LABEL[k]}{info.messages[k] ? ' ✓' : ''}
            </button>
          ))}
        </div>

        {edited && <div className="text-xs rounded-lg bg-primary/10 text-primary px-2.5 py-1.5">직접 고친 문구예요 (저장됨)</div>}
        {stale && (
          <div className="text-xs rounded-lg bg-orange-50 text-orange-700 px-2.5 py-1.5">
            수첩·서류·차시 내용이 바뀌었어요. 저장본은 그대로 두었어요. 새 내용으로 바꾸려면 "새로 만들기"를 눌러 주세요.
          </div>
        )}

        <textarea rows={16} className={`${inputCls} font-mono leading-relaxed`} value={draft[active]}
          onChange={e => setDraft(d => ({ ...d, [active]: e.target.value }))} />

        <div className="flex gap-2 flex-wrap">
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-semibold">
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? '복사됨' : '복사하기'}
          </button>
          <button onClick={saveMessage} disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary text-primary px-4 py-2 text-sm font-semibold disabled:opacity-40">
            <Save size={14} /> 최종 문구 저장
          </button>
          <button onClick={regenerate} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-on-surface-variant px-4 py-2 text-sm font-semibold">
            <RotateCcw size={14} /> 새로 만들기
          </button>
        </div>
      </section>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-on-surface text-surface px-4 py-2 text-sm shadow-lg">{toast}</div>}
    </div>
  );
}
