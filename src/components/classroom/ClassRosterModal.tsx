import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { X, Loader2, Users, Trash2 } from 'lucide-react';
import { appConfirm } from '../../lib/appDialog';

interface Props {
  classId: string;
  className: string;
  students: { id: string; full_name: string }[];
  onClose: () => void;
  /** keepOpen=true 이면 창을 닫지 않고 목록만 새로 불러온다 */
  onSaved: (keepOpen?: boolean) => void;
}

interface Row { name: string; number: string }

/** 한 줄을 번호/이름으로 나눈다. "3번 홍길동", "3 홍길동", "3, 홍길동"(엑셀 복사: 탭/쉼표), "홍길동" 모두 허용 */
function parseLine(raw: string): Row | null {
  const line = raw.trim();
  if (!line) return null;
  if (/[\t,]/.test(line)) {
    const parts = line.split(/[\t,]/).map(x => x.trim()).filter(Boolean);
    const numPart = parts.find(x => /^\d+번?$/.test(x));
    const name = parts.find(x => x !== numPart);
    return name ? { name, number: numPart ? numPart.replace('번', '') : '' } : null;
  }
  const m = line.match(/(\d+)번?/);
  if (m) {
    const name = line.replace(m[0], '').trim().replace(/^[\s.\-]+|[\s.\-]+$/g, '');
    return name ? { name, number: m[1] } : null;
  }
  return { name: line, number: '' };
}

/** 사업 담당자가 반 학생 명단을 붙여넣어 등록하는 창 */
export default function ClassRosterModal({ classId, className, students, onClose, onSaved }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  const removeStudent = async (st: { id: string; full_name: string }) => {
    if (!await appConfirm(`'${st.full_name}' 학생을 명단에서 지울까요?\n이 학생의 출결·기록·제출물도 함께 사라지고 되돌릴 수 없어요.`)) return;
    setRemoving(st.id); setErr('');
    const { data, error } = await supabase.rpc('manager_delete_student', { p_student: st.id });
    setRemoving(null);
    if (error || (data as any)?.error) { setErr('지우지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    onSaved(true);
  };

  const rows = useMemo(() => text.split('\n').map(parseLine).filter((r): r is Row => !!r), [text]);

  const submit = async () => {
    if (rows.length === 0) return;
    const existing = new Set(students.map(s => s.full_name.trim()));
    const seen = new Set<string>();
    const dups = new Set<string>();
    rows.forEach(r => { if (existing.has(r.name) || seen.has(r.name)) dups.add(r.name); seen.add(r.name); });
    if (dups.size > 0 && !await appConfirm(`같은 이름이 있어요: ${[...dups].join(', ')}\n그래도 등록할까요?`)) return;
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('manager_add_students', {
      p_class: classId,
      p_students: rows.map(r => ({ name: r.name, number: r.number })),
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      const m = error?.message || '';
      setErr(m.includes('STUDENT_LIMIT_EXCEEDED') ? '한 반에 등록할 수 있는 학생 수(40명)를 넘었어요.'
        : (data as any)?.error === 'INVALID_LIST' ? '한 번에 100명까지 등록할 수 있어요.'
        : '등록하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setText('');
    onSaved(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-black text-lg flex items-center gap-2"><Users size={18} className="text-primary" /> {className} 학생 명단</h2>
          <button onClick={onClose} aria-label="닫기"><X size={20} /></button>
        </div>

        <div>
          <p className="text-xs font-black text-on-surface-variant mb-1.5">지금 등록된 학생 {students.length}명</p>
          {students.length === 0 ? (
            <p className="text-sm text-on-surface-variant">아직 없어요.</p>
          ) : (
            <ul className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-1.5 grid grid-cols-2 sm:grid-cols-3 gap-1">
              {students.map((st, i) => (
                <li key={st.id} className="flex items-center justify-between gap-1 pl-2 pr-0.5 py-0.5 text-sm rounded-lg bg-surface-container-lowest border border-slate-200 dark:border-slate-700 min-w-0">
                  <span className="truncate min-w-0"><span className="text-[11px] font-bold text-on-surface-variant mr-1">{i + 1}</span>{st.full_name}</span>
                  <button onClick={() => removeStudent(st)} disabled={removing === st.id} aria-label={`${st.full_name} 삭제`}
                    className="p-1.5 shrink-0 rounded-lg text-red-400 hover:bg-red-50 disabled:opacity-40">
                    {removing === st.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className="text-sm font-black block mb-1.5">명단 붙여넣기 (한 줄에 한 명)</label>
          <textarea
            value={text} onChange={e => setText(e.target.value)} rows={6}
            placeholder={'1번 홍길동\n2번 김민지\n3 이서준\n박지우'}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-sm bg-surface-container-lowest"
          />
          <p className="text-[11px] text-on-surface-variant mt-1">엑셀에서 번호·이름 두 칸을 복사해 붙여넣어도 돼요. 번호는 없어도 됩니다.</p>
        </div>

        {rows.length > 0 && (
          <p className="text-xs font-bold text-primary">{rows.length}명 인식됨: {rows.slice(0, 5).map(r => (r.number ? `${r.number}번 ` : '') + r.name).join(', ')}{rows.length > 5 ? ' …' : ''}</p>
        )}
        {err && <p className="text-xs font-bold text-red-600">{err}</p>}

        <button disabled={rows.length === 0 || busy} onClick={submit}
          className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
          {busy && <Loader2 size={15} className="animate-spin" />} {rows.length}명 등록하기
        </button>
        <p className="text-[11px] text-on-surface-variant">등록하면 담당 강사가 반 화면을 열 때 바로 명단이 들어 있어요. 잘못 넣은 학생은 위 목록의 휴지통 버튼으로 지울 수 있어요.</p>
      </div>
    </div>,
    document.body,
  );
}
