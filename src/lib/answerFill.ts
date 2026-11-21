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

// ── 다른 코드 상자 가져오기 ──
// 코드 상자에 이름표(```text@지시문)를 붙이면, 값이 채워진 그 상자의 글을 기억해 두고
// 다른 코드 상자의 【지시문】 자리에 통째로 넣어 준다. 이름표가 없는 상자는 지금처럼 동작한다.
// (이름표는 언어 글자 뒤에 @로 붙인다. 첫 줄 뒤쪽 정보는 rehypeRaw를 거치며 사라지기 때문)
export const SHARED_BLOCK_EVENT = 'mv-shared-block';
const sharedBlocks = new Map<string, string>();

/** 'text@지시문' → { lang: 'text', id: '지시문' }. @가 없으면 id는 null */
export const splitBlockLang = (rawLang: string): { lang: string; id: string | null } => {
  const i = rawLang.indexOf('@');
  if (i < 0) return { lang: rawLang, id: null };
  const id = normalizeFillName(rawLang.slice(i + 1));
  return { lang: rawLang.slice(0, i) || 'text', id: id || null };
};

/** 이름표 붙은 상자의 (표 값이 채워진) 글을 기억한다. 바뀐 경우에만 알린다 */
export const setSharedBlock = (name: string, text: string) => {
  if (sharedBlocks.get(name) === text) return;
  sharedBlocks.set(name, text);
  window.dispatchEvent(new Event(SHARED_BLOCK_EVENT));
};

/** 기억해 둔 상자 글 읽기 (enabled가 false면 읽지 않는다) */
export const useSharedBlocks = (enabled: boolean) => {
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setBlocks(Object.fromEntries(sharedBlocks));
    refresh();
    window.addEventListener(SHARED_BLOCK_EVENT, refresh);
    return () => window.removeEventListener(SHARED_BLOCK_EVENT, refresh);
  }, [enabled]);
  return blocks;
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
