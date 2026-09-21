// 무료 플랜 AI 크레딧 가격표 (서버용).
// 1크레딧 = 0.001달러. 기능별 고정 가격이며, 실제 비용은 ai_usage_logs에 따로 기록해 가격이 적정한지 점검한다.
// ⚠ 화면 표시용 사본이 src/lib/aiCredits.ts에 있다. 가격을 바꾸면 두 파일을 함께 고칠 것.

export const FREE_MONTHLY_CREDITS = 400;
// 무료 사용자 전체의 월 합계 상한(약 30달러). 어뷰징·봇 폭주 시 비용이 끝없이 늘지 않게 하는 안전장치.
export const FREE_POOL_MONTHLY_CREDITS = 30000;

const LIGHT = 4;   // 아주 가벼운 호출
const NORMAL = 15; // 보통
const HEAVY = 40;  // 무거움
const BIG = 60;    // 큰 작업(수업 계획서 등)

const PRICES: Record<string, number> = {
  // 가벼움
  idea_clarify_question: LIGHT, prompt_validate: LIGHT, cover_prompt_suggest: LIGHT,
  portfolio_intro: LIGHT, survey_generator: LIGHT, observation_review: LIGHT,
  // 보통
  idea_analysis: NORMAL, student_analysis: NORMAL,
  feedback_draft: NORMAL, survey_analysis: NORMAL,
  class_insight: NORMAL, survey_copilot: NORMAL,
  idea_prd_generate: NORMAL, idea_web_search: NORMAL,
  app_guide_copilot: NORMAL, ai_chat: NORMAL, file_extract: NORMAL, result_auto_grade: NORMAL,
  // 무거움
  seatuk_draft: HEAVY, seatuk_refine: HEAVY, seatuk_compress: HEAVY,
  quiz_generator: HEAVY, slidedeck_ai_draft: HEAVY, slide_deck_copilot: HEAVY,
  lesson_plan_draft: HEAVY, material_reorganize: HEAVY, material_copilot: HEAVY,
  transcription_analysis: HEAVY, observation_analyst_copilot: HEAVY, quiz_copilot: HEAVY,
  detailed_report: HEAVY, idea_prd_draft: HEAVY, achievement_suggest: HEAVY,
  class_manager_copilot: HEAVY, idea_handoff_copilot: HEAVY,
  // 큰 작업
  lesson_plan_copilot: BIG, lesson_plan_sections: BIG, material_from_lesson_plan: BIG,
};

// 가격표에 없는 기능은 '보통'으로 처리(과금 누락 방지)
export const creditPriceOf = (feature: string): number => PRICES[feature] ?? NORMAL;
