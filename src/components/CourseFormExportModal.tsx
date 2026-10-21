import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import CustomFormPanel from './CustomFormPanel';
import type { LessonPlanSections } from '../lib/gemini';
import { downloadBlob, type CoursePlanFormExtras, type FormKind } from '../lib/hwpxFormExport';

const STORAGE_KEY = 'courseFormExtras';

function loadSaved(): CoursePlanFormExtras {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { school: '', place: '', teacher: '', hoursPerSession: '1', ...JSON.parse(raw) };
  } catch { /* 저장값이 없어도 동작 */ }
  return { school: '', place: '', teacher: '', hoursPerSession: '1' };
}

interface Props {
  plan: LessonPlanSections;
  onClose: () => void;
  onBuild: (kind: FormKind, extras: CoursePlanFormExtras) => Promise<{ blob: Blob; fileName: string }>;
}

// 학교 서식에는 있지만 계획서에는 없는 칸(수업장소·담당강사·시수)을 저장 직전에 묻는다
export default function CourseFormExportModal({ plan, onClose, onBuild }: Props) {
  const [extras, setExtras] = useState<CoursePlanFormExtras>(loadSaved);
  const [kind, setKind] = useState<FormKind | 'custom' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ blob: Blob; fileName: string } | null>(null);
  const done = result !== null;

  const finish = (built: { blob: Blob; fileName: string }) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(extras)); } catch { /* 무시 */ }
    setResult(built);
    downloadBlob(built.blob, built.fileName);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(extras)); } catch { /* 무시 */ }
      const built = await onBuild(kind === 'custom' || kind === null ? 'basic' : kind, extras);
      setResult(built);
      downloadBlob(built.blob, built.fileName);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 만들지 못했어요.');
      setBusy(false);
    }
  };

  const Mini = ({ rows }: { rows: string[][] }) => (
    <div className="border border-slate-300 rounded-md bg-white p-1.5 space-y-px text-[9px] leading-tight text-slate-500">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-px">
          {r.map((c, j) => (
            <div key={j} className={`px-1 py-0.5 truncate ${c.startsWith('*') ? 'bg-primary/10 text-primary font-bold flex-1' : c ? 'bg-slate-100 font-bold' : 'bg-white border border-dashed border-slate-300 flex-1'}`}>{c.replace('*', '')}</div>
          ))}
        </div>
      ))}
    </div>
  );

  const field = 'w-full px-3 py-2.5 rounded-xl border border-surface-container text-sm focus:outline-none focus:border-primary';

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className={`bg-white rounded-3xl shadow-xl w-full p-6 max-h-[92vh] overflow-y-auto ${kind === 'custom' && !done ? 'max-w-2xl' : 'max-w-xl'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-lg font-black text-on-surface">학교 서식으로 저장</h3>
          <button onClick={onClose} aria-label="닫기" className="p-1 text-on-surface-variant"><X size={18} /></button>
        </div>
        {done ? (
          <div className="py-6 text-center">
            <p className="text-base font-black text-on-surface mb-2">한글 파일을 저장했어요 ✅</p>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              파일 이름: <b>{result?.fileName}</b><br />
              브라우저 다운로드 폴더를 확인해 주세요.<br />
              파일이 보이지 않으면 아래 버튼을 눌러 직접 내려받으세요.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={() => result && downloadBlob(result.blob, result.fileName)} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-primary text-white">파일 다시 내려받기</button>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">닫기</button>
            </div>
          </div>
        ) : kind === null ? (
          <div>
            <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">어떤 서식으로 받을까요? 모양을 보고 골라 주세요.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={() => setKind('basic')} className="text-left p-3 rounded-2xl border-2 border-surface-container hover:border-primary transition-colors">
                <Mini rows={[['강좌명', '*수업 이름', '장소', ''], ['강의기간', '*날짜·차시'], ['개요', '*내용 채움'], ['학습목표', '*내용 채움'], ['번호', '주제', '*내용', '시수']]} />
                <p className="mt-2 text-sm font-black text-on-surface">기본 · 강의계획서</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">수업 내용이 한 장에 모두 채워져요. 회차마다 줄이 늘어나요.</p>
              </button>
              <button onClick={() => setKind('detail')} className="text-left p-3 rounded-2xl border-2 border-surface-container hover:border-primary transition-colors">
                <Mini rows={[['소속', '', '성명', '*강사'], ['입금계좌', ''], ['연락처', '', 'E-mail', ''], ['연수명', '*수업 이름'], ['강의주제', '*목표 요약'], ['학력·경력', '']]} />
                <p className="mt-2 text-sm font-black text-on-surface">상세 · 강사관리카드</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">외부 강사 위촉용 카드예요. 수업 정보만 채우고 개인정보 칸은 비워 둬요.</p>
              </button>
              <button onClick={() => setKind('operation')} className="text-left p-3 rounded-2xl border-2 border-surface-container hover:border-primary transition-colors">
                <Mini rows={[['프로그램명', '*수업 이름'], ['운영 차시', '*N차시', '장소', ''], ['교과영역', '*교과', '대상학년', '*학년'], ['학습 목표', '*목표 채움'], ['차시', '영역', '*내용', '방법']]} />
                <p className="mt-2 text-sm font-black text-on-surface">강좌 운영 계획서</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">학교 밖 기관 연계 수업용이에요. 차시별 표가 회차 수만큼 만들어져요.</p>
              </button>
              <button onClick={() => setKind('custom')} className="text-left p-3 rounded-2xl border-2 border-dashed border-surface-container hover:border-primary transition-colors">
                <Mini rows={[['강좌명', '*수업 이름'], ['학습목표', '*내용 채움'], ['평가', '*내용 채움'], ['···']]} />
                <p className="mt-2 text-sm font-black text-on-surface">내 서식 올리기</p>
                <p className="text-xs text-on-surface-variant leading-relaxed">학교에서 받은 한글 서식(hwpx)을 올리면 칸을 찾아 계획서 내용으로 채워 줘요.</p>
              </button>
            </div>
          </div>
        ) : kind === 'custom' ? (
          <CustomFormPanel plan={plan} extras={extras} onExtrasChange={setExtras} onBack={() => setKind(null)} onBuilt={finish} />
        ) : (
          <>
        <p className="text-sm text-on-surface-variant mb-4 leading-relaxed">
          {kind === 'detail' ? '수업 정보는 자동으로 채워요. 주민번호·계좌 같은 개인정보 칸은 일부러 비워 두니, 한글에서 직접 적어 주세요. ' : ''}계획서에 없는 칸만 적어 주세요. 비워 두면 서식의 그 칸이 빈칸으로 남아서, 한글에서 직접 적으실 수 있어요.
        </p>
        <div className="space-y-3">
          {kind === 'detail' ? (
            <label className="block">
              <span className="text-xs font-bold text-on-surface-variant">강의를 요청한 학교 이름</span>
              <input className={field} value={extras.school ?? ''} onChange={e => setExtras({ ...extras, school: e.target.value })} placeholder="예: ○○중학교" />
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-bold text-on-surface-variant">수업 장소</span>
              <input className={field} value={extras.place} onChange={e => setExtras({ ...extras, place: e.target.value })} placeholder="예: 3학년 2반 교실" />
            </label>
          )}
          <label className="block">
            <span className="text-xs font-bold text-on-surface-variant">담당 강사(교사) 이름</span>
            <input className={field} value={extras.teacher} onChange={e => setExtras({ ...extras, teacher: e.target.value })} placeholder="예: 홍길동" />
          </label>
          {kind === 'basic' && (
            <label className="block">
              <span className="text-xs font-bold text-on-surface-variant">회차마다 적을 시수 (시간)</span>
              <input className={field} value={extras.hoursPerSession} onChange={e => setExtras({ ...extras, hoursPerSession: e.target.value })} placeholder="예: 1" />
            </label>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setKind(null)} className="px-4 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">← 서식 다시 고르기</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-60">
            {busy ? '만드는 중…' : '한글 파일 만들기'}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-on-surface-variant">입력한 내용은 이 기기에만 기억돼요.</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
