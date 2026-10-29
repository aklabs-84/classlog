import { supabase } from '../../lib/supabase';
import { draftToRow, type QuestionDraft } from './QuestionForm';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

// 게시판을 만들고 새 게시판 id를 돌려준다. 실패하면 null (빈 게시판이 남지 않게 정리한다).
export async function createLiveBoard(teacherId: string, draft: QuestionDraft, classId: string | null): Promise<string | null> {
  const row = draftToRow(draft);
  // 게시판을 만들면 DB가 입력한 질문을 1번 카드(글로 답하기)로 자동 생성한다.
  const { data, error } = await supabase
    .from('live_boards')
    .insert({ teacher_id: teacherId, question: row.question, code: genCode(), class_id: classId })
    .select('id').single();
  if (error || !data) return null;
  // 투표로 만들었다면 1번 카드를 투표용으로 고쳐 쓴다.
  if (row.kind === 'poll') {
    const { error: updErr } = await supabase
      .from('live_board_questions')
      .update({ kind: 'poll', options: row.options, allow_multiple: row.allow_multiple })
      .eq('board_id', data.id).eq('position', 1);
    if (updErr) {
      await supabase.from('live_boards').delete().eq('id', data.id);
      return null;
    }
  }
  return data.id;
}
