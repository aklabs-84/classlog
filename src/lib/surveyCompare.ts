import { supabase } from './supabase';

// SchoolProjectSurveyTab의 사전/사후 비교 계산(computeComparison)과 같은 규칙을
// "사업 전체" 단위로 보여주기 위한 모듈.
//
// ⚠️ 설문 원본 테이블(survey_forms 등)은 "만든 강사 본인만 조회 가능"하도록 RLS가 걸려 있어
// 사업 관리자는 다른 강사가 만든 설문을 직접 읽을 수 없다. 그래서 관찰기록과 같은 방식으로,
// 서버(SECURITY DEFINER 함수 get_project_survey_comparisons)에서 "이름 없는 집계값"만
// 계산해 돌려주고, 관리자 권한 검사도 서버에서 다시 한다.

export interface SurveyFormLite {
  id: string;
  title: string;
}

export interface QuestionComparisonRow {
  text: string;
  type: 'star_rating' | 'opinion_scale' | 'yes_no';
  preAvg: number | null;
  postAvg: number | null;
  prePct: number | null;
  postPct: number | null;
  preN: number;
  postN: number;
}

export interface SurveyPairSummary {
  preForm: SurveyFormLite;
  postForm: SurveyFormLite;
  matched: boolean;
  matchedCount: number;
  preResponseCount: number;
  postResponseCount: number;
  rows: QuestionComparisonRow[];
  /** 문항 중 opinion_scale/star_rating 평균의 평균 — "사후 만족도" 대표값 (없으면 null) */
  satisfactionAvg: number | null;
}

interface RpcRow {
  text: string;
  type: string;
  pre_avg: number | null;
  post_avg: number | null;
  pre_pct: number | null;
  post_pct: number | null;
  pre_n: number;
  post_n: number;
}

interface RpcPair {
  pre_form: SurveyFormLite;
  post_form: SurveyFormLite;
  matched: boolean;
  matched_count: number;
  pre_response_count: number;
  post_response_count: number;
  rows: RpcRow[];
}

/** 사업(school_project_id) 소속 사전/사후 설문 쌍을 전부 찾아 비교 요약을 만든다. */
export async function fetchProjectSurveyComparisons(projectId: string): Promise<SurveyPairSummary[]> {
  const { data, error } = await supabase.rpc('get_project_survey_comparisons', { p_project_id: projectId });
  if (error) throw error;
  const pairs = (data ?? []) as RpcPair[];

  return pairs.map(p => {
    const rows: QuestionComparisonRow[] = p.rows.map(r => ({
      text: r.text,
      type: r.type as 'star_rating' | 'opinion_scale' | 'yes_no',
      preAvg: r.pre_avg,
      postAvg: r.post_avg,
      prePct: r.pre_pct,
      postPct: r.post_pct,
      preN: r.pre_n,
      postN: r.post_n,
    }));
    const postAverages = rows.map(r => r.postAvg).filter((v): v is number => v !== null);
    const satisfactionAvg = postAverages.length > 0 ? postAverages.reduce((s, v) => s + v, 0) / postAverages.length : null;

    return {
      preForm: p.pre_form,
      postForm: p.post_form,
      matched: p.matched,
      matchedCount: p.matched_count,
      preResponseCount: p.pre_response_count,
      postResponseCount: p.post_response_count,
      rows,
      satisfactionAvg,
    };
  });
}
