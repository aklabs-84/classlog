import type { XCell } from './xlsxBuilder';

const SURVEY_TYPE_LABEL: Record<string, string> = {
  multiple_choice: '객관식', yes_no: '예/아니오', star_rating: '별점', short_text: '주관식', opinion_scale: '의견 척도', ranking: '순위',
};


// 질문 하나의 응답들을 한 줄 글로 요약 (엑셀 시트용)
export function summarizeSurveyAnswers(q: any, ans: any[]): string {
  const opts: string[] = (q.options || []).map((o: any) => (typeof o === 'string' ? o : o?.label ?? ''));
  const count = (arr: (string | number)[]) => {
    const m = new Map<string | number, number>();
    arr.forEach(v => m.set(v, (m.get(v) || 0) + 1));
    return m;
  };
  const avg = (nums: number[]) => (nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '-');
  switch (q.type) {
    case 'multiple_choice': {
      const m = count(ans.map(a => a.selected).filter(v => typeof v === 'number'));
      return opts.map((o, i) => `${o}: ${m.get(i) || 0}명`).join(' / ');
    }
    case 'yes_no': {
      const yes = ans.filter(a => a.value === true).length;
      return `예: ${yes}명 / 아니오: ${ans.filter(a => a.value === false).length}명`;
    }
    case 'star_rating': return `평균 ${avg(ans.map(a => a.rating).filter(v => typeof v === 'number'))}점`;
    case 'opinion_scale': return `평균 ${avg(ans.map(a => a.score).filter(v => typeof v === 'number'))}점`;
    case 'short_text': return ans.map(a => a.text).filter(Boolean).join('\n');
    case 'ranking': {
      const sums = opts.map((_, i) => {
        const pos = ans.map(a => (a.order as number[] | undefined)?.indexOf(i)).filter(v => typeof v === 'number' && v >= 0) as number[];
        return `${opts[i]}: 평균 ${avg(pos.map(p => p + 1))}위`;
      });
      return sums.join(' / ');
    }
    default: return '';
  }
}


const phaseLabel = (p?: string | null) => (p === 'pre' ? ' · 사전' : p === 'post' ? ' · 사후' : '');
const answersOf = (f: any, q: any) => (f.answers || []).filter((a: any) => a.question_id === q.id).map((a: any) => a.value || {});

// 공유 화면 엑셀용 '설문 결과' 시트 행 (응답자 식별 없이 질문별 집계만)
export function buildSurveyXlsxRows(forms: any[]): XCell[][] {
  const rows: XCell[][] = [];
  forms.forEach((f: any) => {
    rows.push([{ value: `${f.title}${phaseLabel(f.phase)} (총 ${f.response_count}명 응답)`, span: 4, style: 'section' }, null, null, null] as any);
    rows.push([{ value: '질문', style: 'header' }, { value: '유형', style: 'header' }, { value: '응답 수', style: 'header' }, { value: '결과', style: 'header' }]);
    (f.questions || []).forEach((q: any, i: number) => {
      const ans = answersOf(f, q);
      rows.push([{ value: `${i + 1}. ${q.text}`, style: 'wrap' }, { value: SURVEY_TYPE_LABEL[q.type] || q.type }, { value: ans.length }, { value: summarizeSurveyAnswers(q, ans), style: 'wrap' }]);
    });
    rows.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }]);
  });
  return rows;
}

// CSV 표 아래에 이어 붙일 설문 집계 행
export function buildSurveyCsvRows(forms: any[]): (string | number)[][] {
  const rows: (string | number)[][] = [];
  forms.forEach((f: any) => {
    rows.push([], [`설문: ${f.title}${phaseLabel(f.phase)}`, `총 ${f.response_count}명 응답`], ['질문', '유형', '응답 수', '결과']);
    (f.questions || []).forEach((q: any, i: number) => {
      const ans = answersOf(f, q);
      rows.push([`${i + 1}. ${q.text}`, SURVEY_TYPE_LABEL[q.type] || q.type, ans.length, summarizeSurveyAnswers(q, ans)]);
    });
  });
  return rows;
}
