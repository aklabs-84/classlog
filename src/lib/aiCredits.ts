// 무료 플랜 AI 크레딧 가격표 (화면 표시용).
// ⚠ 서버 사본은 api/_lib/aiCredits.ts — 실제 차감 기준은 서버이며, 가격을 바꾸면 두 파일을 함께 고칠 것.

export const FREE_MONTHLY_CREDITS = 400;

const LIGHT = 4;
const NORMAL = 15;
const HEAVY = 40;
const BIG = 60;

const PRICES: Record<string, number> = {
  idea_clarify_question: LIGHT, prompt_validate: LIGHT, cover_prompt_suggest: LIGHT,
  portfolio_intro: LIGHT, survey_generator: LIGHT, observation_review: LIGHT,
  idea_analysis: NORMAL, student_analysis: NORMAL,
  feedback_draft: NORMAL, survey_analysis: NORMAL,
  class_insight: NORMAL, survey_copilot: NORMAL,
  idea_prd_generate: NORMAL, idea_web_search: NORMAL,
  app_guide_copilot: NORMAL, ai_chat: NORMAL, file_extract: NORMAL, result_auto_grade: NORMAL,
  seatuk_draft: HEAVY, seatuk_refine: HEAVY, seatuk_compress: HEAVY,
  quiz_generator: HEAVY, slidedeck_ai_draft: HEAVY, slide_deck_copilot: HEAVY,
  lesson_plan_draft: HEAVY, material_reorganize: HEAVY, material_copilot: HEAVY,
  transcription_analysis: HEAVY, observation_analyst_copilot: HEAVY, quiz_copilot: HEAVY,
  detailed_report: HEAVY, idea_prd_draft: HEAVY, achievement_suggest: HEAVY,
  class_manager_copilot: HEAVY, idea_handoff_copilot: HEAVY,
  lesson_plan_copilot: BIG, lesson_plan_sections: BIG, material_from_lesson_plan: BIG,
};

export const creditPriceOf = (feature: string): number => PRICES[feature] ?? NORMAL;

// 서버 응답(credits)을 받으면 화면 어디서든 최신 잔액을 반영할 수 있도록 알리는 이벤트.
export const AI_CREDITS_EVENT = 'ai-credits-updated';
export type AiCreditsInfo = { charged: number; remaining: number; limit: number };

export function announceAiCredits(info: AiCreditsInfo) {
  try { window.dispatchEvent(new CustomEvent<AiCreditsInfo>(AI_CREDITS_EVENT, { detail: info })); } catch { /* SSR/비브라우저 */ }
}
