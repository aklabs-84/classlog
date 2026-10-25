import { useEffect, useState } from 'react';

// 코드 블록의 【이름】 자리에, 위쪽 표(바꿀 곳 | 내가 쓸 값)에 적은 값을 자동으로 끼워 넣는다.
// 표 칸은 위치로 저장되므로, 화면의 표에서 "왼쪽 칸 글자 = 이름 / 오른쪽 입력칸 = 값"을 읽어 짝을 맞춘다.

export const ANSWER_INPUT_EVENT = 'mv-answer-input';

/** 표의 이름 칸·【】 안 글자를 같은 모양으로 맞춘다: 앞의 ①·1) 번호, 끝의 ':', 공백 제거 */
export const normalizeFillName = (s: string) =>
  s.replace(/^[\s①-⑳❶-❿]+/, '')
    .replace(/^\(?\d+[.)]\s*/, '')
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, '')
    .trim();

/** 화면의 표에서 {이름: 값} 읽기. 값이 비었거나 예시 줄이면 넣지 않는다 */
export const readTableValues = (): Record<string, string> => {
  const out: Record<string, string> = {};
  document.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.children) as HTMLElement[];
    if (cells.length < 2) return;
    const field = cells.slice(1).map(c => c.querySelector('textarea[data-answer-field], input[type="text"][data-answer-field]')).find(Boolean) as HTMLInputElement | null;
    if (!field) return;
    const name = normalizeFillName(cells[0].textContent ?? '');
    const value = field.value.trim();
    if (name && value && !/^예\)/.test(name)) out[name] = value;
  });
  return out;
};

export type FillPart = { text: string; filled: boolean };

/** code 안의 【이름】을 값으로 바꾼 조각 목록. 값이 없으면 원래 【이름】을 그대로 둔다 */
export const fillParts = (code: string, values: Record<string, string>): FillPart[] => {
  const parts: FillPart[] = [];
  let last = 0;
  for (const m of code.matchAll(/【([^】\n]*)】/g)) {
    const v = values[normalizeFillName(m[1])];
    if (!v) continue;
    if (m.index! > last) parts.push({ text: code.slice(last, m.index), filled: false });
    parts.push({ text: v, filled: true });
    last = m.index! + m[0].length;
  }
  if (last < code.length) parts.push({ text: code.slice(last), filled: false });
  return parts;
};

/** 표 입력이 바뀔 때마다 값을 다시 읽는 훅 (enabled가 false면 읽지 않는다) */
export const useTableValues = (enabled: boolean) => {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setValues(readTableValues());
    refresh();
    const t = window.setTimeout(refresh, 400); // 저장된 답변이 늦게 채워지는 경우
    window.addEventListener(ANSWER_INPUT_EVENT, refresh);
    return () => { window.clearTimeout(t); window.removeEventListener(ANSWER_INPUT_EVENT, refresh); };
  }, [enabled]);
  return values;
};
