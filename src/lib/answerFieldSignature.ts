// 자료 글 속 학생 입력칸(표의 빈 칸 · [ ] · ___)의 "종류와 순서"를 글자만으로 뽑는다.
// 학생 답은 "n번째 입력칸"으로 저장되므로, 원본의 입력칸 순서가 수정본에서 그대로인지 저장 전에 확인하는 데 쓴다.
//   c = 표 빈 칸, k = [ ] 체크칸, b = ___ 밑줄칸

export function answerFieldSignature(content: string): string {
  const lines = (content || '').split('\n');
  let sig = '';
  let inFence = false;
  let tableRow = -1; // 현재 표 안에서 몇 번째 줄인지(-1이면 표 밖)
  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; tableRow = -1; continue; }
    if (inFence) continue;
    if (line.startsWith('|')) {
      tableRow += 1;
      const isSeparator = /^\|?[\s:|-]+\|?$/.test(line) && line.includes('-');
      if (tableRow === 0 || isSeparator) continue; // 제목 줄과 구분선은 입력칸이 아니다
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|');
      for (const cell of cells) {
        const t = cell.trim();
        if (t === '') sig += 'c';
        else sig += tokensIn(t);
      }
      continue;
    }
    tableRow = -1;
    sig += tokensIn(line);
  }
  return sig;
}

function tokensIn(text: string): string {
  let out = '';
  const re = /(\[ \]|_{3,})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out += m[1] === '[ ]' ? 'k' : 'b';
  return out;
}

// 원본의 입력칸이 수정본에서 순서·종류 그대로인지(맨 뒤에만 더해도 통과) 확인한다
export function keepsOriginalFields(original: string, edited: string): boolean {
  return answerFieldSignature(edited).startsWith(answerFieldSignature(original));
}
