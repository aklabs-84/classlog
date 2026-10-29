import { Plus, X, MessageSquareText, Vote } from 'lucide-react';
import { MAX_OPTIONS, MIN_OPTIONS, type LiveBoardQuestionKind } from './types';

export interface QuestionDraft {
  kind: LiveBoardQuestionKind;
  question: string;
  options: string[];
  allowMultiple: boolean;
}

export const emptyDraft = (): QuestionDraft => ({
  kind: 'text', question: '', options: ['', ''], allowMultiple: false,
});

const cleanOptions = (d: QuestionDraft) => d.options.map(o => o.trim()).filter(Boolean);

export function isDraftValid(d: QuestionDraft): boolean {
  if (!d.question.trim()) return false;
  if (d.kind === 'poll') return cleanOptions(d).length >= MIN_OPTIONS;
  return true;
}

// DB에 넣을 모양. 글 질문이면 보기·복수선택은 비워 둔다.
export function draftToRow(d: QuestionDraft) {
  return {
    kind: d.kind,
    question: d.question.trim(),
    options: d.kind === 'poll' ? cleanOptions(d) : null,
    allow_multiple: d.kind === 'poll' ? d.allowMultiple : false,
  };
}

// 투표가 이미 들어온 질문을 고칠 때: 앞쪽 보기 칸은 비울 수 없다 (비우면 번호가 밀려 표가 엉뚱한 보기에 붙는다)
export function isEditValid(d: QuestionDraft, lockedCount: number): boolean {
  if (!isDraftValid(d)) return false;
  if (lockedCount > 0 && d.kind === 'poll') {
    return d.options.slice(0, lockedCount).every(o => o.trim());
  }
  return true;
}

interface Props {
  draft: QuestionDraft;
  onChange: (next: QuestionDraft) => void;
  autoFocus?: boolean;
  // 이미 답이 들어온 질문이면 true: 종류 바꾸기·보기 삭제를 막고, 보기 글자 고치기·뒤에 추가만 허용
  locked?: boolean;
  lockedCount?: number;
}

const kindButton = (active: boolean): React.CSSProperties => ({
  flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
  border: `2px solid ${active ? '#0EA5E9' : '#E5E7EB'}`,
  background: active ? '#F0F9FF' : '#fff',
  color: active ? '#0369A1' : '#6B7280',
  fontSize: 13, fontWeight: 700,
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
});

export default function QuestionForm({ draft, onChange, autoFocus, locked, lockedCount = 0 }: Props) {
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...draft, ...patch });
  const isPoll = draft.kind === 'poll';

  const setOption = (i: number, v: string) =>
    set({ options: draft.options.map((o, idx) => (idx === i ? v.slice(0, 40) : o)) });
  const removeOption = (i: number) => set({ options: draft.options.filter((_, idx) => idx !== i) });
  const addOption = () => set({ options: [...draft.options, ''] });

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>학생이 어떻게 답하나요?</p>
      {locked && (
        <p style={{ fontSize: 11, color: '#B45309', background: '#FFFBEB', borderRadius: 8, padding: '6px 10px', margin: '0 0 8px', lineHeight: 1.5 }}>
          이미 답이 들어온 질문이라 답하는 방식은 바꿀 수 없어요. 질문 문장은 자유롭게 고칠 수 있고{isPoll ? ', 보기는 글자 고치기와 뒤에 추가만 할 수 있어요.' : '.'}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, opacity: locked ? 0.55 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <button type="button" onClick={() => set({ kind: 'text' })} style={kindButton(!isPoll)}>
          <MessageSquareText size={18} /> 글로 답하기
          <span style={{ fontSize: 10, fontWeight: 500 }}>생각을 한 줄씩 적어요</span>
        </button>
        <button type="button" onClick={() => set({ kind: 'poll' })} style={kindButton(isPoll)}>
          <Vote size={18} /> 투표하기
          <span style={{ fontSize: 10, fontWeight: 500 }}>보기 중에서 골라요</span>
        </button>
      </div>

      <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
        {isPoll ? '투표 질문' : '질문'}
      </p>
      <textarea
        autoFocus={autoFocus}
        value={draft.question}
        onChange={e => set({ question: e.target.value.slice(0, 200) })}
        placeholder={isPoll ? '예: 점심에 먹고 싶은 메뉴를 골라주세요' : '예: 좋아하는 노래 제목 3개를 적어주세요'}
        rows={2}
        style={{ width: '100%', border: '2px solid #E5E7EB', borderRadius: 10, padding: 12, fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5 }}
        onFocus={e => (e.target.style.borderColor = '#0EA5E9')}
        onBlur={e => (e.target.style.borderColor = '#E5E7EB')}
      />

      {isPoll && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 6px' }}>
            보기 ({MIN_OPTIONS}~{MAX_OPTIONS}개)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draft.options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 22, fontSize: 12, fontWeight: 700, color: '#0EA5E9', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                <input
                  value={opt}
                  onChange={e => setOption(i, e.target.value)}
                  placeholder={`보기 ${i + 1}`}
                  style={{ flex: 1, minWidth: 0, border: '1px solid #E5E7EB', borderRadius: 8, padding: '9px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                />
                {draft.options.length > MIN_OPTIONS && i >= (locked ? lockedCount : 0) && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    title="보기 지우기"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, display: 'flex' }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {draft.options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed #BAE6FD', borderRadius: 8, padding: '7px 12px', color: '#0369A1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={13} /> 보기 추가
            </button>
          )}

          <label style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
            <input
              type="checkbox"
              checked={draft.allowMultiple}
              onChange={e => set({ allowMultiple: e.target.checked })}
              style={{ width: 16, height: 16, marginTop: 2, accentColor: '#0EA5E9', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.4 }}>
              <b>여러 개 고를 수 있게 하기</b>
              <br />
              <span style={{ fontSize: 11, color: '#6B7280' }}>
                {draft.allowMultiple ? '학생이 보기를 여러 개 눌러서 한 번에 제출해요' : '꺼 두면 학생은 보기를 하나만 고를 수 있어요'}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
