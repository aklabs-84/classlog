export type LiveBoardQuestionKind = 'text' | 'poll';

export interface LiveBoardQuestion {
  id: string;
  board_id: string;
  position: number;
  kind: LiveBoardQuestionKind;
  question: string;
  options: string[] | null;
  allow_multiple: boolean;
}

export const QUESTION_COLUMNS = 'id, board_id, position, kind, question, options, allow_multiple';
export const RESPONSE_COLUMNS = 'id, board_id, question_id, student_user_id, nickname, content, choices, created_at';

export const MAX_OPTIONS = 8;
export const MIN_OPTIONS = 2;

export interface PollTally {
  counts: number[];
  voters: number;
}

// 보기별 득표수. 복수 선택이면 한 명이 여러 보기에 표를 줄 수 있으므로 voters(투표한 사람 수)를 따로 센다.
export function tallyPoll(options: string[], responses: { choices: number[] | null }[]): PollTally {
  const counts = options.map(() => 0);
  let voters = 0;
  for (const r of responses) {
    if (!r.choices || r.choices.length === 0) continue;
    voters += 1;
    for (const c of r.choices) {
      if (c >= 0 && c < counts.length) counts[c] += 1;
    }
  }
  return { counts, voters };
}
