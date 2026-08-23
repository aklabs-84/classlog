// 프로덕션: /api/gemini 서버 프록시 사용 (키 노출 방지)
// 개발(npm run dev): VITE_GEMINI_API_KEY로 직접 호출

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';
import { getResultImagePublicUrls } from '../components/common/ImageCarousel';

export const SYSTEM_INSTRUCTIONS = {
  BASE: `
    당신은 대한민국 교육부의 '2026 학교생활기록부 기재요령'을 완벽하게 숙지한 전문 교육용 AI 어시스턴트입니다.
    선생님들의 업무를 보조하며, 학생의 성장을 돕는 객관적이고 교육적인 필치를 유지하세요.
  `,
  SEATUK_GUIDE: `
    [세특/생기부 작성 절대 원칙]
    1. '~함', '~임', '~보임' 등 명사형/개조식 종결 어미를 사용하십시오.
    2. 공인어학시험, 교외 수상실적, 사교육 유발 요소(어학연수 등)는 절대 기재하지 마십시오.
    3. 구체적인 점수나 등급 대신, 학생의 실질적인 행동 변화와 성취 과정을 서술하십시오.
    4. 사실 중심(Evidence-based)으로 작성하되, 학생의 개별성이 드러나도록 하십시오.
  `,
  PARENT_REPORT_GUIDE: `
    [학부모 성장 보고서 작성 원칙]
    1. 학부모가 읽기 쉬운 친근하고 따뜻한 문어체로 작성하세요.
    2. '~했습니다', '~보였습니다' 등 완성형 종결어미를 사용하세요.
    3. 학생의 성장과 노력 과정을 긍정적이고 구체적으로 서술하세요.
    4. 구체적인 활동명과 에피소드를 포함해 생생하게 작성하세요.
    5. 앞으로의 발전 가능성과 응원의 메시지로 마무리하세요.
    6. 분량은 200~300자 내외로 작성하세요.
  `,
  PRIVACY: `
    [개인정보 보호]
    - 학생의 실명, 주민번호, 주소 등 민감 정보는 답변에 직접 노출하지 마십시오.
    - 분석 시 데이터에 포함된 정보는 교육적 피드백 용도로만 활용하십시오.
  `
};

function getModelId(model: 'pro' | 'flash') {
  return model === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
}

// 사용자가 설정 페이지에서 직접 등록한 본인 Gemini API 키 (무료 플랜 한도 우회용)
export function getUserGeminiKey(): string {
  return localStorage.getItem('gemini_api_key') ?? '';
}

async function callDirect(body: any, apiKeyOverride?: string): Promise<string> {
  const apiKey = apiKeyOverride || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY가 .env에 없습니다.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const { mode, model = 'flash', prompt, systemInstruction, history, message, files, jsonMode } = body;
  const generativeModel = genAI.getGenerativeModel({
    model: getModelId(model),
    generationConfig: {
      ...(model === 'pro'
        ? { temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 8192 }
        : { temperature: 0.4, topP: 0.8, topK: 40, maxOutputTokens: 8192 }),
      ...(jsonMode && {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      }),
    },
  });

  try {
    if (mode === 'generate') {
      const parts: any[] = [{ text: prompt ?? '' }];
      if (files?.length) parts.push(...files);
      const contentParts = systemInstruction ? [{ text: systemInstruction }, ...parts] : parts;
      const { response } = await generativeModel.generateContent(contentParts);
      return response.text();
    }

    if (mode === 'chat') {
      // startChat()에 systemInstruction을 그대로 넘기면 문자열이 포맷 변환 없이 API로 전달되어
      // "Invalid value at 'system_instruction'" 오류가 남 → getGenerativeModel() 생성 시점에 넘겨야 SDK가 올바르게 변환함
      const chatModel = systemInstruction
        ? genAI.getGenerativeModel({ model: getModelId(model), generationConfig: generativeModel.generationConfig, systemInstruction })
        : generativeModel;
      const chat = chatModel.startChat({
        history: (history ?? []).map((h: any) => ({
          role: h.role as 'user' | 'model',
          parts: Array.isArray(h.parts) ? h.parts : [{ text: h.text ?? '' }],
        })),
      });
      const promptParts: any[] = [{ text: message ?? '' }];
      if (files?.length) promptParts.push(...files);
      const { response } = await chat.sendMessage(promptParts);
      return response.text();
    }
  } catch (error: any) {
    if (apiKeyOverride) {
      throw new Error(classifyByokError(error));
    }
    throw error;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

// 사용자가 등록한 본인 Gemini API 키로 직접 호출했을 때의 실패 원인을 구분해
// "키가 잘못됨"과 "그 키의 무료 사용량 한도 초과"를 서로 다른 안내 문구로 분리한다.
// (원인을 구분하지 않으면 한도 초과인데도 "키가 틀렸다"고 오해하게 됨)
function classifyByokError(error: any): string {
  const raw = String(error?.message ?? error ?? '');

  if (/429|quota|RESOURCE_EXHAUSTED|rate limit/i.test(raw)) {
    return '내 Gemini API 키의 무료 사용량 한도(분당/일일 요청 수)를 초과했습니다. 잠시 후 다시 시도하거나, Google AI Studio에서 사용량을 확인해주세요.';
  }
  if (/API_KEY_INVALID|API key not valid|400|401|403|PERMISSION_DENIED/i.test(raw)) {
    return '등록하신 Gemini API 키가 유효하지 않습니다. 설정 페이지에서 키를 다시 확인해주세요.';
  }
  return '내 Gemini API 키 호출에 실패했습니다. 잠시 후 다시 시도해주세요. (' + raw + ')';
}

async function callProxy(body: object): Promise<string> {
  // 사용자가 본인 Gemini API 키를 등록한 경우: 서버를 거치지 않고 브라우저에서 직접 호출 (플랜 한도 무관)
  const userKey = getUserGeminiKey();
  if (userKey) {
    return callDirect(body, userKey);
  }

  // 개발 환경: 브라우저에서 직접 Gemini 호출
  if ((import.meta as any).env?.DEV) {
    return callDirect(body);
  }

  // 프로덕션: 서버 프록시 사용
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'AI_LIMIT_EXCEEDED') {
      throw new Error('AI_LIMIT_EXCEEDED');
    }
    throw new Error(data.error ?? 'AI API 오류');
  }
  return data.result as string;
}

// 텍스트를 768차원 벡터로 변환 — 저장 시(임베딩 캐싱)와 검색 시(쿼리 벡터 계산) 공용으로 사용.
// 사용자 본인 API 키 등록 여부와 무관하게 항상 서버 GEMINI_API_KEY(또는 개발환경 VITE 키)로 계산한다.
export async function embedText(text: string): Promise<number[]> {
  if (!text || !text.trim()) return [];
  const trimmed = text.slice(0, 8000);

  if ((import.meta as any).env?.DEV) {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('VITE_GEMINI_API_KEY가 .env에 없습니다.');
    const genAI = new GoogleGenerativeAI(apiKey);
    const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    // outputDimensionality: DB의 vector(768) 컬럼과 맞추기 위해 768차원으로 축소 요청 — SDK 타입 정의에는 없지만 API는 지원한다.
    const { embedding } = await embeddingModel.embedContent({
      content: { role: 'user', parts: [{ text: trimmed }] },
      outputDimensionality: 768,
    } as any);
    return embedding.values;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'embed', text: trimmed }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '임베딩 처리 중 오류가 발생했습니다.');
  return data.embedding as number[];
}

// Compatible wrappers matching the @google/generative-ai interface used in the codebase
function makeModelWrapper(model: 'pro' | 'flash', feature = 'unknown', jsonMode = false) {
  return {
    generateContent: async (input: string | any[], options?: { class_id?: string }) => {
      const parts = typeof input === 'string' ? [{ text: input }] : input;
      const textParts = parts.filter((p: any) => 'text' in p);
      const fileParts = parts.filter((p: any) => 'inlineData' in p);
      const prompt = textParts.map((p: any) => p.text).join('\n');
      const result = await callProxy({
        mode: 'generate',
        model,
        feature,
        prompt,
        ...(jsonMode && { jsonMode: true }),
        ...(fileParts.length > 0 && { files: fileParts }),
        ...(options?.class_id && { class_id: options.class_id }),
      });
      return { response: { text: () => result } };
    },
  };
}

export const geminiFlash = makeModelWrapper('flash');
export const geminiPro   = makeModelWrapper('pro');

// 기능별 named wrapper (비용 추적용)
export const promptValidatorAI    = makeModelWrapper('flash', 'prompt_validate', true);
export const seatukDraftAI        = makeModelWrapper('pro',   'seatuk_draft');
export const seatukRefineAI       = makeModelWrapper('pro',   'seatuk_refine');
export const seatukCompressAI     = makeModelWrapper('pro',   'seatuk_compress');
export const achievementSuggestAI = makeModelWrapper('pro',   'achievement_suggest');
export const transcriptionAI      = makeModelWrapper('flash', 'transcription_analysis');
export const quizGeneratorAI      = makeModelWrapper('flash', 'quiz_generator', true);
export const surveyAnalysisAI     = makeModelWrapper('flash', 'survey_analysis');
export const observationReviewAI  = makeModelWrapper('flash', 'observation_review', true);
export const studentAnalysisAI    = makeModelWrapper('flash', 'student_analysis');
export const resultAutoGradeAI    = makeModelWrapper('flash', 'result_auto_grade', true);
export const materialReorganizeAI = makeModelWrapper('flash', 'material_reorganize');
export const slideDeckDraftAI      = makeModelWrapper('flash', 'slidedeck_ai_draft', true);
export const coverPromptAI         = makeModelWrapper('flash', 'cover_prompt_suggest', true);
export const ideaAnalysisAI        = makeModelWrapper('flash', 'idea_analysis', true);
export const lessonPlanDraftAI     = makeModelWrapper('flash', 'lesson_plan_draft');

/**
 * 파일을 Gemini API 파트로 변환 (Base64) - 브라우저에서 실행, 결과를 서버로 전달
 */
export async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64Data, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Storage 공개 URL을 fileToGenerativePart와 동일한 inlineData 형태로 변환 (fetch로 받은 File이 아닌 원격 파일용)
export async function urlToGenerativePart(url: string, mimeType: string): Promise<{ inlineData: { data: string; mimeType: string } }> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64Data, mimeType } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const RESULT_EVAL_TAGS = ['자기주도', '논리적사고', '표현력', '창의성', '협력', '성실성', '탐구력', '문제해결'];

// Gemini가 내용을 직접 읽을 수 있는 file_type만 자동 채점 대상. 그 외(zip, docx 등)는 직접 확인 필요.
export const GRADABLE_FILE_TYPES = ['application/pdf', 'text/html', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

interface GradableResultItem {
  result_type: string;
  text_content?: string | null;
  storage_path?: string | null;
  storage_paths?: string[] | null;
  file_type?: string | null;
}

export function isResultGroupGradable(items: GradableResultItem[]): boolean {
  return items.some(r => r.result_type === 'text' && !!r.text_content?.trim())
    || items.some(r => r.result_type === 'image')
    || items.some(r => r.result_type === 'file' && !!r.file_type && GRADABLE_FILE_TYPES.includes(r.file_type));
}

// student_results 그룹(텍스트/이미지/파일)을 autoGradeResult에 넘길 수 있는 형태로 변환.
// AutoGradingPanel(클래스 전체)과 StudentView(학생 개별) 양쪽에서 공유하는 로직.
export async function buildGradingContent(items: GradableResultItem[]): Promise<{ text?: string; files?: { inlineData: { data: string; mimeType: string } }[] }> {
  const textItem = items.find(r => r.result_type === 'text');
  const imageItem = items.find(r => r.result_type === 'image');
  const fileItem = items.find(r => r.result_type === 'file' && r.file_type && GRADABLE_FILE_TYPES.includes(r.file_type));

  let text = textItem?.text_content?.trim() || '';
  const files: { inlineData: { data: string; mimeType: string } }[] = [];

  if (imageItem) {
    const urls = getResultImagePublicUrls(supabase.storage, imageItem).slice(0, 4);
    for (const url of urls) {
      try {
        files.push(await urlToGenerativePart(url, imageItem.file_type || 'image/png'));
      } catch (err) {
        console.warn('이미지 첨부 실패:', err);
      }
    }
  }

  if (fileItem?.storage_path) {
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(fileItem.storage_path);
    if (fileItem.file_type === 'text/html') {
      try {
        const res = await fetch(data.publicUrl);
        const html = await res.text();
        text = text ? `${text}\n\n${html}` : html;
      } catch (err) {
        console.warn('HTML 파일 읽기 실패:', err);
      }
    } else {
      try {
        files.push(await urlToGenerativePart(data.publicUrl, fileItem.file_type || 'application/pdf'));
      } catch (err) {
        console.warn('파일 첨부 실패:', err);
      }
    }
  }

  return { text: text || undefined, files: files.length > 0 ? files : undefined };
}

const LAST_RUBRIC_KEY_PREFIX = 'saengilog_last_rubric_';

// 클래스별 "마지막으로 사용한 채점 기준"을 로컬에 저장 — Classroom의 일괄 채점 탭과
// StudentView의 개별 AI 채점 제안 버튼이 같은 기준을 재사용할 수 있도록 공유.
export function getLastRubric(classId: string): string {
  try {
    return localStorage.getItem(LAST_RUBRIC_KEY_PREFIX + classId) || '';
  } catch {
    return '';
  }
}

export function setLastRubric(classId: string, rubric: string): void {
  try {
    localStorage.setItem(LAST_RUBRIC_KEY_PREFIX + classId, rubric);
  } catch {
    // 프라이빗 모드 등 localStorage 사용 불가 환경은 조용히 무시
  }
}

// 교사가 입력한 채점 기준 + 학생 제출 내용(텍스트/이미지·PDF 첨부)을 바탕으로
// 역량 태그·별점·코멘트를 AI가 제안. 실패 시 null 반환 — 호출 측에서 "직접 입력"으로 안내.
export async function autoGradeResult(
  rubric: string,
  content: { text?: string; files?: { inlineData: { data: string; mimeType: string } }[] },
  classId?: string
): Promise<{ tags: string[]; score: number; comment: string } | null> {
  const prompt = `당신은 학생이 제출한 결과물을 교사가 입력한 채점 기준에 따라 평가하는 AI입니다.

[교사의 채점 기준]
${rubric}

[역량 태그] (아래 목록 중에서만 선택, 근거가 있는 태그만 1개 이상 선택)
${RESULT_EVAL_TAGS.join(', ')}

[학생 제출 내용]
${content.text || '(아래 첨부된 이미지/파일을 직접 확인하고 평가하세요)'}

[코드/HTML 제출물 평가 시 주의사항]
제출 내용이 HTML/CSS/JS 등 코드인 경우, 당신은 이 코드를 브라우저에서 실행하거나 버튼을 직접 클릭해본 것이 아니라 소스 코드 텍스트만 읽고 있습니다. 버튼 클릭, 화면 전환, 알림 동작 등 실제로 실행해봐야만 확인할 수 있는 동작에 대해서는 "정상적으로 작동한다"처럼 단정하지 마세요. 코드에 관련 요소(이벤트 핸들러, 함수 등)가 존재한다는 사실과 실제로 그것이 오류 없이 동작한다는 것은 다릅니다. 이런 부분은 "코드 상으로는 ~하게 구현되어 있으나 실제 동작 여부는 직접 확인이 필요합니다"처럼 신중하게 표현하고, score와 comment도 확인되지 않은 실행 결과를 근거로 후하게 주지 마세요.

위 기준에 따라 평가하여 반드시 아래 JSON 형식만 반환하세요 (다른 텍스트 없이):
{"tags":["역량태그1","역량태그2"],"score":3,"comment":"학생에게 보여줄 한두 문장 코멘트"}
- score는 1~5 사이 정수 (기준을 잘 충족할수록 높은 점수)
- comment는 구체적이고 격려하는 톤으로 작성하되, 확인되지 않은 실행 결과를 단정하지 말 것`;

  const parts: any[] = [{ text: prompt }];
  if (content.files?.length) parts.push(...content.files);

  try {
    const result = await resultAutoGradeAI.generateContent(parts, { class_id: classId });
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => RESULT_EVAL_TAGS.includes(t)) : [];
    const scoreNum = Number(parsed.score);
    return {
      tags,
      score: Number.isFinite(scoreNum) ? Math.min(5, Math.max(1, Math.round(scoreNum))) : 0,
      comment: String(parsed.comment || '').trim(),
    };
  } catch (error) {
    console.error('autoGradeResult error:', error);
    return null;
  }
}

export async function validateStudentGuidePrompt(
  prompt: string
): Promise<{ feasible: boolean; message: string; guide?: string }> {
  const validationPrompt = `당신은 AI 학생 활동 기록 검토 시스템의 지침 검증 전문가입니다.
교사가 "학생 활동 가이드"에 입력한 내용이 AI가 학생 제출물을 실제로 판단할 수 있는 기준인지 평가하세요.

[시스템 동작 방식]
- 학생이 활동 기록(제목 + 내용 + 느낀 점)을 제출하면 AI가 이 가이드 기준으로 품질을 분석
- 기준 미충족 시 자동 반려(학생에게 사유와 개선 안내 제공)
- 글자수 제한·금지어는 별도 시스템이 이미 처리하므로 가이드에서 불필요

[AI가 판단 가능한 기준]
- 구체적 활동 서술 요구 (예: "단순 감상이 아닌 본인의 역할과 과정을 써야 함")
- 특정 내용 포함 요구 (예: "배운 개념을 실생활에 연결하여 작성")
- 작성 태도 기준 (예: "반복 문장으로 분량만 채운 경우 반려")
- 수업 연관성 확인 (예: "수업 내용과 무관한 내용은 반려")

[AI가 판단할 수 없는 기준]
- 사실 여부 확인 (예: "실제로 수업에 참여했는지 확인")
- 외부 데이터 비교 (예: "지난주보다 발전했는지")
- 글자수·맞춤법 기준 (별도 시스템에서 이미 처리)
- 표절 검사
- 지나치게 주관적인 기준 (예: "창의적이지 않으면 반려" — 창의성은 AI가 일관되게 판단 불가)

[교사가 작성한 가이드]
"${prompt}"

반드시 아래 JSON 형식으로만 응답하세요:
{"feasible":true,"message":"성공 메시지"}
또는
{"feasible":false,"message":"안 되는 이유","guide":"대신 이렇게 작성하세요"}`;

  try {
    const result = await promptValidatorAI.generateContent(validationPrompt);
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      feasible: Boolean(parsed.feasible),
      message: String(parsed.message || ''),
      guide: parsed.guide ? String(parsed.guide) : undefined,
    };
  } catch {
    return { feasible: true, message: '검증 중 오류가 발생했습니다. 지침은 저장됩니다.' };
  }
}

export async function validateTeacherPrompt(
  prompt: string
): Promise<{ feasible: boolean; message: string; guide?: string }> {
  const validationPrompt = `당신은 AI 생기부 초안 작성 시스템의 지침 검증 전문가입니다.
교사가 "AI 행특/세특 초안 작성 지침"에 입력한 내용이 시스템에서 실제로 동작 가능한지 판별하세요.

[시스템이 AI에게 제공하는 데이터]
- 학생의 활동 기록 (활동명 + 학생이 직접 작성한 내용 텍스트)
- 교사가 선택한 주차(전체 주차 또는 특정 주차)의 기록이 전달됨

[시스템이 절대 할 수 없는 것]
- 날짜/기간으로 필터링 (날짜 정보가 전달되지 않음)
- 성적·점수 반영 (성적 데이터 없음)
- 출석·결석 반영 (출석 데이터 없음)
- 다른 학생과 비교 (학생 1명씩 개별 처리)
- 외부 액션(알림 발송 등)
- 기록이 없는 학생을 자동 식별하여 최저 평가 부여 (기록 없는 학생은 초안 생성 대상에서 제외됨)

[동작 가능한 지침 예시]
- 문체·어미·분량·강조점 지침 (예: "~함, ~임 어미 사용", "500자 이내")
- 특정 역량·내용 강조 (예: "협업 태도 강조", "성장 가능성 위주로")
- AI로 작성한 것 같은 표현 검토 요청
- 학생의 활동 내용 기반 성취 판단

[교사가 작성한 지침]
"${prompt}"

반드시 아래 JSON 형식으로만 응답하세요:
{"feasible":true,"message":"성공 메시지"}
또는
{"feasible":false,"message":"안 되는 이유","guide":"대신 이렇게 작성하세요"}`;

  try {
    const result = await promptValidatorAI.generateContent(validationPrompt);
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      feasible: Boolean(parsed.feasible),
      message: String(parsed.message || ''),
      guide: parsed.guide ? String(parsed.guide) : undefined,
    };
  } catch {
    return { feasible: true, message: '검증 중 오류가 발생했습니다. 지침은 저장됩니다.' };
  }
}

export async function generateFeedbackDraft(
  type: 'obs' | 'result',
  title: string,
  content: string,
  classId?: string
): Promise<string> {
  const typeLabel = type === 'obs' ? '활동 기록' : '결과 제출물';
  const prompt = `학생이 제출한 ${typeLabel}에 대한 선생님 피드백 초안을 작성해줘.

[제출 내용]
제목: ${title}
내용: ${content}

[작성 기준]
- 학생의 노력과 성장을 인정하되, 개선 방향도 구체적으로 제시
- 2~3문장으로 간결하게
- 따뜻하고 교육적인 어조
- 학생의 제출 내용에서 구체적인 요소를 언급
- "~하면 좋겠습니다", "~가 인상적입니다" 등 완성형 어미 사용
- 피드백 문장만 출력 (별도 설명, 제목, 따옴표 없이)`;

  return callProxy({
    mode: 'generate',
    model: 'flash',
    feature: 'feedback_draft',
    systemInstruction: SYSTEM_INSTRUCTIONS.BASE + SYSTEM_INSTRUCTIONS.PRIVACY,
    prompt,
    ...(classId && { class_id: classId }),
  });
}

export async function generateClassInsight(className: string, observations: any[], classId?: string) {
  // 실제 데이터 기반 통계 추출
  const total = observations.length;
  const uniqueStudents = new Set(observations.map(o => o.student_id)).size;
  const recentObs = observations
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
  const activityCounts: Record<string, number> = {};
  for (const o of observations) {
    const name = o.activity_name || '기타';
    activityCounts[name] = (activityCounts[name] || 0) + 1;
  }
  const topActivities = Object.entries(activityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `"${name}" (${count}건)`)
    .join(', ');
  const pendingCount = observations.filter(o => o.status === 'pending').length;
  const approvedCount = observations.filter(o => o.status === 'approved').length;

  const prompt = `
학급명: ${className}

[실제 집계 데이터]
- 전체 활동 기록 수: ${total}건
- 참여 학생 수: ${uniqueStudents}명
- 가장 많이 기록된 활동: ${topActivities || '데이터 없음'}
- 승인 완료: ${approvedCount}건 / 승인 대기: ${pendingCount}건
- 최근 20건 활동 내용 샘플: ${JSON.stringify(recentObs.map(o => ({ 활동: o.activity_name, 내용요약: (o.content || '').slice(0, 80) })))}

[작성 지침]
- 위 실제 수치와 활동명을 반드시 언급할 것 (추상적 표현 금지)
- 예시처럼 구체적 숫자/활동명을 포함하여 2문장 이내로 작성
- 예시: "${uniqueStudents}명의 학생이 '${Object.keys(activityCounts)[0] || '활동'}' 등 ${total}건의 기록을 제출했습니다. 특히 [구체적 활동명]에서 [구체적 특징]이 두드러졌습니다."
- 클리셰 표현("논리적 분석력이 향상" 등) 사용 금지
  `;
  return callProxy({
    mode: 'generate',
    model: 'flash',
    feature: 'class_insight',
    systemInstruction: SYSTEM_INSTRUCTIONS.BASE + SYSTEM_INSTRUCTIONS.PRIVACY,
    prompt,
    ...(classId && { class_id: classId }),
  });
}

function anonymizeObservations(observations: any[]) {
  return observations.map(o => ({
    activity_name: o.activity_name,
    content: o.content,
    status: o.status,
    created_at: o.created_at,
  }));
}

// AI 채팅 전용: 학급 소유 교사 본인만 보는 대화이므로 학생 이름은 포함하되,
// SEATUK_GUIDE/PRIVACY 지침으로 주민번호 등 민감정보 노출은 계속 차단한다.
function formatObservationsForChat(observations: any[]) {
  return observations.map(o => ({
    student_name: o.student_name,
    activity_name: o.activity_name,
    content: o.content,
    status: o.status,
    created_at: o.created_at,
  }));
}

export async function generateDetailedReport(className: string, observations: any[], classId?: string) {
  const prompt = `
    학급명: ${className}
    전체 관찰 기록: ${JSON.stringify(anonymizeObservations(observations))}

    위 데이터를 바탕으로 다음 항목을 포함한 심층 분석 보고서를 작성해줘:
    1. 학급 전체 성취도 요약
    2. 주요 핵심 역량 발현 키워드 (Top 3)
    3. 과목별/활동별 참여도 분석
    4. 향후 지도 가이드 및 제언

    작성 시 교육적인 전문 용어를 사용하고, 구체적인 사례(활동명 등)를 언급해줘.
    마크다운 형식을 사용해줘.
  `;
  return callProxy({
    mode: 'generate',
    model: 'pro',
    feature: 'detailed_report',
    systemInstruction: SYSTEM_INSTRUCTIONS.BASE + SYSTEM_INSTRUCTIONS.SEATUK_GUIDE + SYSTEM_INSTRUCTIONS.PRIVACY,
    prompt,
    ...(classId && { class_id: classId }),
  });
}

export async function extractTextFromFiles(files: { inlineData: { data: string; mimeType: string } }[]) {
  if (!files || files.length === 0) return [];
  try {
    return await callProxy({
      mode: 'generate',
      model: 'flash',
      feature: 'file_extract',
      prompt: `첨부된 파일(이미지, PDF, 엑셀 캡처 등)에서 텍스트 내용을 최대한 정확하게 추출해줘.
- 표 형태의 데이터라면 구조를 최대한 유지해서 텍스트로 변환해.
- 학생의 이름, 점수, 활동 내용 등 핵심 정보를 빠짐없이 포함해.
- 별도의 설명 없이 추출된 텍스트 데이터만 반환해.`,
      files,
    });
  } catch (error) {
    console.error('Text Extraction Error:', error);
    return '파일에서 텍스트를 추출하는 데 실패했습니다.';
  }
}

export async function chatWithClassData(
  className: string,
  observations: any[],
  history: { role: string; text: string }[],
  message: string,
  files?: { inlineData: { data: string; mimeType: string } }[],
  extractedText?: string,
  classId?: string,
  focusStudentName?: string,
  totalStudentCount?: number
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.SEATUK_GUIDE}${SYSTEM_INSTRUCTIONS.PRIVACY}
당신은 '${className}'의 학급 데이터를 파악하고 있는 AI 어시스턴트입니다.
선생님이 제공한 데이터와 첨부된 파일의 추출 텍스트를 바탕으로 답변하세요.
${focusStudentName ? `\n[집중 모드] 지금 선생님은 '${focusStudentName}' 학생 한 명에 집중해서 대화하고 있습니다. 아래 데이터도 이 학생의 기록으로 좁혀져 있으니, 답변도 이 학생에 한정해서 작성하세요.\n` : `\n[학급 기본 정보]\n전체 등록 학생 수: ${totalStudentCount ?? '알 수 없음'}명\n아래 관찰 기록에는 각 기록을 남긴 학생 이름(student_name)이 포함되어 있습니다. 이 데이터는 선생님 본인의 학급 데이터이므로, 학생 이름을 언급하며 개별 학생에 대한 질문에도 답변하세요. 다만 주민번호·주소 등 기록에 없는 민감정보를 추측해서 언급하지는 마세요.\n`}
[학급 데이터 환경 (관찰 기록)]
${JSON.stringify(focusStudentName ? anonymizeObservations(observations.slice(0, 100)) : formatObservationsForChat(observations.slice(0, 100)))}

[첨부 파일에서 추출된 텍스트 정보]
${extractedText || '첨부된 파일이 없거나 아직 추출되지 않았습니다.'}

[답변 가이드라인]
1. 데이터에 기반하여 답변하되, 파일의 내용을 참고했다면 "[파일 참고]"라고 명시하세요.
2. 학생 성장에 도움이 되는 교육적이고 긍정적인 방향으로 조언하세요.
3. 세특이나 행특 문구 작성을 요청받으면 기재요령을 준수하여 작성하세요.
4. 답변은 마크다운으로 가독성 있게 작성하세요. 소제목은 "##", 핵심 용어나 결론은 "**굵게**", 여러 항목을 나열할 때는 "-" 목록을, 여러 학생/활동/시기를 비교할 때는 표(|구분|내용|)를 적극 활용하세요.`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'ai_chat',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(files && files.length > 0 && { files }),
    ...(classId && { class_id: classId }),
  });
}

// ── 수업 자료 AI 재구성 (학습 가이드 / 발표 자료) ─────────────────────────────

// 선생님이 UI에서 그대로 읽을 수 있도록 작성된 기본 프롬프트 (투명 공개용)
export const MATERIAL_REORG_PROMPTS: Record<'guide' | 'presentation', string> = {
  guide: `학생이 이 내용을 스스로 단계별로 따라가며 학습할 수 있는 '학습 가이드' 형식으로 재구성합니다.
- 도입부에 "이번 시간 학습 목표"를 2~3문장으로 정리합니다.
- 내용을 논리적 순서에 따라 "## STEP 1. ~", "## STEP 2. ~" 형식의 단계로 나눕니다.
- 각 단계는 소제목과 설명으로 구성하고, 필요하면 "확인해보기" 질문을 덧붙입니다.
- 마지막에 "정리 체크리스트" 섹션을 불릿으로 추가합니다.
- 원문에 없는 정보를 임의로 추가하거나 빼지 않습니다.
- {{IMG:n}} 형태의 자리표시자는 텍스트를 바꾸지 말고 문맥에 맞는 위치로만 재배치합니다.`,

  presentation: `이 내용을 발표 화면(16:9 프레젠테이션)에서 스크롤 없이 한 화면에 다 보이도록 슬라이드 자료로 재구성합니다.
- 슬라이드는 빈 줄 다음 "---" 한 줄로 구분합니다.
- 각 슬라이드의 맨 첫 줄에는 반드시 아래 형식의 메타 주석을 작성합니다 (화면에는 보이지 않고, 배경색·아이콘 지정에만 쓰입니다):
  <!-- meta: bg=키워드 icon=이모지1개 -->
  · bg는 슬라이드 주제 분위기에 맞춰 다음 중 하나만: purple, blue, teal, green, amber, rose, dark
  · icon은 슬라이드 내용을 함축하는 이모지 1개만 (예: 🎯 💡 ✅ 👥 📌 ⚙️ 🚀). 장식용이므로 화려한 조합이나 여러 개를 쓰지 않습니다.
- 첫 슬라이드는 제목 슬라이드로, 수업 주제를 한 줄로 담습니다.
- 한 슬라이드에는 소제목 1개와 핵심 불릿 최대 4개(불릿당 12단어 이내, 1줄)만 담아 16:9 화면에 여유 있게 다 들어가도록 합니다. 절대 스크롤이 필요할 만큼 길게 쓰지 않습니다.
- 내용이 많으면 슬라이드를 여러 장으로 나누고, 한 슬라이드에 모든 내용을 몰아넣지 않습니다.
- 텍스트가 많은 슬라이드에는 이미지를 넣지 않고, 이미지는 관련 내용이 있는 별도 슬라이드에 배치합니다.
- 원문에 없는 정보를 임의로 추가하거나 빼지 않습니다.
- {{IMG:n}} 형태의 자리표시자는 텍스트를 바꾸지 말고 적절한 슬라이드 위치로만 재배치합니다.`,
};

// 이미지 마크다운을 자리표시자로 치환 — AI가 URL을 직접 다루지 않도록 함
export function extractImagePlaceholders(content: string): { replaced: string; map: string[] } {
  const map: string[] = [];
  const replaced = content.replace(/!\[[^\]]*\]\([^)]+\)/g, (match) => {
    map.push(match);
    return `{{IMG:${map.length - 1}}}`;
  });
  return { replaced, map };
}

// 마크다운 이미지에서 URL만 뽑아낸 목록 (순서대로) — 슬라이드 초안 생성 시 인덱스로 참조
// 자료 에디터는 ![alt](url "width:123") 형식으로 너비를 저장하므로, 괄호 안 전체가 아니라
// URL 부분만 분리해야 한다 (title 부분을 그대로 넣으면 이미지가 깨진다).
export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) urls.push(m[1]);
  return urls;
}

// 마크다운 헤더(#~###)로 원문의 섹션 구조를 뽑아냄 — AI가 섹션을 스스로 추측하지 않고
// 저자가 이미 나눠둔 소제목 구조를 그대로 따라 슬라이드를 배정하게 하기 위함
export function extractSectionOutline(content: string): string[] {
  const headings: string[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    headings.push(`${'  '.repeat(m[1].length - 1)}- ${m[2].trim()}`);
  }
  return headings;
}

// 펜스 코드블록을 자리표시자로 치환 — AI가 코드를 지어내지 않고 원문에 실제 있는 코드만 참조하게 함
export function extractCodePlaceholders(content: string): { replaced: string; blocks: { lang: string; code: string }[] } {
  const blocks: { lang: string; code: string }[] = [];
  const replaced = content.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    blocks.push({ lang: String(lang).trim(), code: String(code).replace(/\n$/, '') });
    return `{{CODE:${blocks.length - 1}}}`;
  });
  return { replaced, blocks };
}

// 자리표시자를 원본 이미지 마크다운으로 복원 — 응답에서 누락된 이미지는 하단에 폴백으로 추가
function restoreImagePlaceholders(result: string, map: string[]): string {
  const used = new Set<number>();
  let restored = result.replace(/\{\{IMG:(\d+)\}\}/g, (_, i) => {
    const idx = Number(i);
    used.add(idx);
    return map[idx] ?? '';
  });
  const missing = map.filter((_, i) => !used.has(i));
  if (missing.length > 0) {
    restored += '\n\n---\n\n' + missing.join('\n\n');
  }
  return restored;
}

// [[FEEDBACK]]...[[/FEEDBACK]] 블록 — 선생님 추가 요청사항이 기본 규칙과 충돌해
// 완전히 반영되지 못했을 때만 AI가 응답 맨 앞에 붙이는 반영 여부 안내
const FEEDBACK_BLOCK_RE = /^\s*\[\[FEEDBACK\]\]\s*\n?([\s\S]*?)\n?\s*\[\[\/FEEDBACK\]\]\s*\n?/;

// 선생님이 입력한 "추가 요청사항"이 정적 마크다운 결과물로 실제 구현 가능한지 생성 전에 미리 검증
export async function validateReorganizeInstruction(
  instruction: string,
  mode: 'guide' | 'presentation'
): Promise<{ feasible: boolean; message: string; guide?: string }> {
  const modeLabel = mode === 'guide' ? '학습 가이드' : '발표 슬라이드';
  const validationPrompt = `당신은 AI 수업 자료 정리 시스템의 요청사항 검증 전문가입니다.
교사가 "${modeLabel} AI 정리" 기능에 입력한 추가 요청사항이 실제로 구현 가능한지 판별하세요.

[시스템이 만들어내는 결과물]
- 순수 텍스트 마크다운 문서입니다 (제목, 문단, 불릿/번호 목록, 표, 인용구, 토글 블록, 콜아웃 강조 박스, 원문에 이미 있던 이미지로만 구성)
- ${mode === 'presentation' ? '16:9 슬라이드로 나뉘며 슬라이드마다 배경 테마 1개·이모지 아이콘 1개만 지정 가능합니다' : '학생이 순서대로 따라가는 STEP 단계 구조로 나뉩니다'}
- 화면에 그려진 뒤에는 움직이지 않는 정적 문서입니다

[시스템이 절대 할 수 없는 것]
- 애니메이션, 전환 효과, 움직이거나 반짝이는 요소
- 이미지 생성·편집·교체 (원문에 없던 새 이미지를 만들거나 기존 이미지를 다른 것으로 바꿀 수 없음 — 배치 위치 조정만 가능)
- 클릭/호버 상호작용, 버튼, 게임·퀴즈 자동 채점 등 앱 기능
- 동영상 삽입/재생, 오디오, 외부 스크립트 실행
- 실시간 데이터 연동
- 원문에 없는 사실 정보의 임의 추가

[동작 가능한 요청 예시]
- 말투·어조, 강조점, 분량 조절 (예: 중학생 눈높이로, 간결하게)
- 특정 섹션 강조, 순서 변경, 원문 내용 범위 안에서 예시 보강
- 표/불릿/토글/콜아웃 등 형식 활용, 소제목 구성 방식 조정
- 톤앤매너 지정 (친근하게, 격식있게 등)

[교사가 입력한 추가 요청사항]
"${instruction}"

반드시 아래 JSON 형식으로만 응답하세요:
{"feasible":true,"message":"성공 메시지"}
또는
{"feasible":false,"message":"안 되는 이유","guide":"대신 이렇게 요청해보세요"}`;

  try {
    const result = await promptValidatorAI.generateContent(validationPrompt);
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      feasible: Boolean(parsed.feasible),
      message: String(parsed.message || ''),
      guide: parsed.guide ? String(parsed.guide) : undefined,
    };
  } catch {
    return { feasible: true, message: '검증 중 오류가 발생했습니다. 요청사항을 반영해 진행합니다.' };
  }
}

export async function reorganizeMaterialContent(
  rawContent: string,
  mode: 'guide' | 'presentation',
  userInstruction?: string,
  classId?: string
): Promise<{ content: string; feedback: string | null }> {
  const { replaced, map } = extractImagePlaceholders(rawContent);

  const trimmedInstruction = userInstruction?.trim();
  const instructionBlock = trimmedInstruction
    ? `\n\n[선생님 추가 요청사항 — 위 기본 규칙과 충돌하지 않는 선에서 반영]\n${trimmedInstruction}`
    : '';
  const feedbackInstruction = trimmedInstruction
    ? `\n\n[요청사항 반영 여부 안내]\n위 선생님 추가 요청사항이 기본 형식 규칙(단계 구조, 슬라이드 분할/메타 규칙 등)과 충돌해 완전히 반영하지 못했다면, 응답 맨 앞줄에 아래 형식으로 짧게 안내를 붙이세요.\n[[FEEDBACK]]\n(반영되지 않은 부분을 1문장으로) (대신 이렇게 요청해보세요: 로 시작하는 대안 1문장)\n[[/FEEDBACK]]\n요청사항을 완전히 반영했다면 이 블록을 절대 넣지 마세요. 블록 다음 줄부터는 곧바로 실제 정리된 본문만 이어서 작성하세요.`
    : '';

  const prompt = `${MATERIAL_REORG_PROMPTS[mode]}${instructionBlock}${feedbackInstruction}\n\n[원문]\n${replaced}`;

  const result = await materialReorganizeAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim();
  const feedbackMatch = raw.match(FEEDBACK_BLOCK_RE);
  const feedback = feedbackMatch ? feedbackMatch[1].trim() : null;
  const bodyRaw = feedbackMatch ? raw.slice(feedbackMatch[0].length) : raw;

  return { content: restoreImagePlaceholders(bodyRaw.trim(), map), feedback };
}

// 수업 자료 에디터에서 선생님이 드래그로 선택한 일부분만 다른 표현/구성으로 바꿔주는 AI 제안
// (전체 문서를 다시 짜는 reorganizeMaterialContent와 달리, 선택 영역 외에는 절대 손대지 않음)
export async function suggestAlternativeContent(
  selectedText: string,
  fullContent: string,
  userInstruction?: string,
  classId?: string
): Promise<string[]> {
  const trimmedInstruction = userInstruction?.trim();
  const instructionBlock = trimmedInstruction
    ? `\n\n[선생님이 원하는 방향]\n${trimmedInstruction}`
    : '\n\n[선생님이 원하는 방향]\n특별한 지시 없음 — 더 명확하거나 참신한 표현으로 자유롭게 제안';

  const prompt = `당신은 수업 자료 에디터에서 선생님이 선택한 일부 문단만 다른 대안으로 다듬어주는 AI입니다.

[전체 자료 내용 — 문맥 참고용, 이 부분은 절대 다시 쓰지 않음]
${fullContent}

[선생님이 선택한 부분 — 이 부분만 대안을 제안]
${selectedText}
${instructionBlock}

[작성 규칙]
- 선택된 부분은 문서 안의 기존 문단/목록 항목/제목 등 어딘가에 그대로 끼워넣어질 텍스트입니다. 절대 "- ", "1. ", "#", ">" 같은 목록·제목·인용구 기호를 새로 붙이지 마세요 — 순수 인라인 텍스트(필요하면 **굵게**, *기울임* 정도만)로만 작성하세요.
- 전체 자료의 흐름과 문체에 자연스럽게 이어지도록 작성하세요.
- 선택되지 않은 나머지 내용은 절대 언급하거나 다시 쓰지 마세요. 오직 선택된 부분의 대안만 제시하세요.
- 원문에 없는 사실을 지어내지 마세요.
- 서로 확연히 다른 느낌의 대안 2~3개를 제안하세요 (예: 더 간결하게 / 예시를 추가해서 / 다른 관점으로 등).

반드시 아래 JSON 형식으로만 응답하세요:
{"suggestions":["대안1 마크다운","대안2 마크다운","대안3 마크다운"]}`;

  const result = await materialReorganizeAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: any) => String(s).trim()).filter(Boolean) : [];
  if (suggestions.length === 0) throw new Error('AI가 대안을 생성하지 못했습니다.');
  return suggestions;
}

// 수업 자료 PDF 표지 이미지를 위한 AI 프롬프트 문구 제안 (이미지 자체는 생성하지 않음 —
// 교사가 다른 이미지 생성 도구에 복사해 쓸 수 있는 프롬프트 텍스트만 만들어줌)
export async function generateCoverPromptSuggestions(
  title: string,
  subtitle?: string | null,
  classId?: string
): Promise<string[]> {
  const prompt = `당신은 수업 자료(교재) PDF 표지 이미지를 만들 때 쓸 AI 이미지 생성 프롬프트를 제안하는 전문가입니다.
아래 수업 자료 정보를 참고해, 표지에 어울리는 이미지를 만들기 위한 영어 프롬프트 문구를 3개 제안하세요.

[수업 자료 제목]
${title || '(제목 없음)'}
${subtitle ? `[클래스/부제]\n${subtitle}\n` : ''}
[조건]
- 각 프롬프트는 서로 다른 스타일(예: 플랫 일러스트, 사진풍, 미니멀 아이콘 구도 등)로 제안하세요.
- 교육용 자료 표지에 어울리게, 과도하게 화려하거나 산만하지 않은 구도를 제안하세요.
- 텍스트/글자가 이미지 안에 들어가야 한다는 지시는 넣지 마세요 (제목은 별도로 얹힙니다).
- 각 프롬프트는 1~2문장, 영어로 작성하세요 (대부분의 이미지 생성 도구가 영어 프롬프트에 더 정확히 반응합니다).

반드시 아래 JSON 형식으로만 응답하세요:
{"suggestions":["프롬프트1","프롬프트2","프롬프트3"]}`;

  const result = await coverPromptAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: any) => String(s)) : [];
  if (suggestions.length === 0) throw new Error('AI가 제안을 생성하지 못했습니다.');
  return suggestions;
}

// ── 아이디어 기록 → AI 분석 (수업 가이드 초안 + 관련 태그) ──────────────────────

export interface RelatedMaterialRef {
  title: string;
  snippet: string;
}

export interface IdeaAnalysisResult {
  summary: string;
  suggestedFormat: 'guide' | 'material' | 'slide';
  guideOutline: string[];
  relatedTags: string[];
  relatedMaterialsNote: string;
  aiSuggestions: {
    direction: string;
    introActivities: string[];
    practiceIdeas: string[];
  };
}

function buildRelatedMaterialsBlock(relatedMaterials: RelatedMaterialRef[]): string {
  if (relatedMaterials.length === 0) return '\n\n[참고할 기존 수업 자료 없음]';
  return `\n\n[선생님이 이미 만들어둔 관련 수업 자료 (참고용, 최근 순)]\n${relatedMaterials
    .map((m, i) => `${i + 1}. ${m.title}\n${m.snippet}`)
    .join('\n\n')}`;
}

export async function analyzeIdea(
  content: string,
  classId?: string,
  relatedMaterials: RelatedMaterialRef[] = []
): Promise<IdeaAnalysisResult> {
  const relatedBlock = buildRelatedMaterialsBlock(relatedMaterials);

  const prompt = `당신은 선생님이 짧게 적어둔 수업 아이디어 메모를 실제 수업으로 발전시킬 수 있도록 돕는 AI입니다.

[선생님이 기록한 아이디어]
${content}
${relatedBlock}

[할 일]
1. 아이디어의 핵심을 1~2문장으로 요약하세요 (summary).
2. 이 아이디어를 발전시키기에 가장 적합한 형태를 판단하세요 (suggestedFormat): 순서가 있는 절차/활동 설명이면 "guide", 학생에게 나눠줄 읽기 자료·설명 위주 콘텐츠면 "material", 발표·요약 전달이 목적이면 "slide" 중 하나만 선택.
3. 선생님이 이미 적어둔 내용을 교사가 바로 참고할 수 있는 수업 가이드 초안으로 정리하세요 (guideOutline, 3~6개 항목). 이 항목은 선생님이 쓴 내용을 벗어나지 않게 정리·구조화만 하고, 원문에 없는 사실을 지어내지 마세요.
4. 이 아이디어와 관련된 핵심 키워드를 2~5개 뽑으세요 (relatedTags). 향후 비슷한 아이디어나 자료를 찾을 때 쓰일 태그이므로, 과목/주제/활동유형 등 짧은 명사 위주로 작성하세요.
5. 위에 제시된 기존 수업 자료를 참고해, 이 아이디어를 어떻게 기획하면 좋을지 2~4문장으로 제안하세요 (relatedMaterialsNote). 기존 자료와 겹치지 않게 차별화할 부분, 또는 기존 자료를 이어서 발전시킬 방법을 구체적으로 언급하세요. 참고할 기존 자료가 없다면 "참고할 기존 자료가 없어 새로 기획하면 됩니다." 정도로 짧게 답하세요.
6. 여기서부터는 선생님이 쓴 내용을 그대로 정리하지 말고, 당신이 교육 전문가로서 새롭게 제안하세요 (aiSuggestions). 선생님이 언급하지 않았더라도 이 수업 주제에 실제로 도움이 될 만한 아이디어를 적극적으로 제시하는 것이 목적입니다.
   - direction: 이 아이디어를 어떤 방향으로 발전시키면 좋을지, 그리고 왜 그 방향을 추천하는지 근거와 함께 2~3문장으로 제안하세요.
   - introActivities: 이 수업에 쓸 수 있는 구체적인 도입(동기유발) 활동 아이디어를 2~3개 제안하세요. 선생님 원문에 없는 새로운 아이디어여도 좋습니다. 각 항목은 "활동명 — 구체적 진행 방법" 형태로 한 문장씩 작성하세요.
   - practiceIdeas: 이 수업과 연계하거나 심화할 수 있는 실습 활동, 관련 학습 도구/사이트/프로그램을 2~3개 제안하세요. 실제로 존재하거나 교사가 검색해 찾을 수 있는 구체적인 종류의 도구·활동으로 제안하고, 왜 이 수업에 맞는지 짧게 덧붙이세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"summary":"...","suggestedFormat":"guide","guideOutline":["...","..."],"relatedTags":["...","..."],"relatedMaterialsNote":"...","aiSuggestions":{"direction":"...","introActivities":["...","..."],"practiceIdeas":["...","..."]}}`;

  const result = await ideaAnalysisAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);

  const suggestedFormat: IdeaAnalysisResult['suggestedFormat'] =
    ['guide', 'material', 'slide'].includes(parsed.suggestedFormat) ? parsed.suggestedFormat : 'guide';

  const aiSuggestions = parsed.aiSuggestions || {};

  return {
    summary: String(parsed.summary || '').trim(),
    suggestedFormat,
    guideOutline: Array.isArray(parsed.guideOutline) ? parsed.guideOutline.map((s: any) => String(s)) : [],
    relatedTags: Array.isArray(parsed.relatedTags) ? parsed.relatedTags.map((s: any) => String(s)) : [],
    relatedMaterialsNote: String(parsed.relatedMaterialsNote || '').trim(),
    aiSuggestions: {
      direction: String(aiSuggestions.direction || '').trim(),
      introActivities: Array.isArray(aiSuggestions.introActivities) ? aiSuggestions.introActivities.map((s: any) => String(s)) : [],
      practiceIdeas: Array.isArray(aiSuggestions.practiceIdeas) ? aiSuggestions.practiceIdeas.map((s: any) => String(s)) : [],
    },
  };
}

// 아이디어 + 수업 가이드 초안 + 관련 기존 자료를 바탕으로, 수업 자료 에디터에 바로 넣을 수 있는
// 실제 수업 계획안 마크다운 문서를 생성 (JSON이 아닌 순수 마크다운 본문을 반환)
export async function generateLessonPlanDraft(
  ideaContent: string,
  guideOutline: string[],
  relatedMaterials: RelatedMaterialRef[],
  length: 'simple' | 'detailed',
  classId?: string
): Promise<string> {
  const relatedBlock = relatedMaterials.length > 0
    ? `\n\n[선생님이 이미 만들어둔 관련 수업 자료 — 내용이 겹치지 않도록 참고만 하고, 그대로 베끼지 마세요]\n${relatedMaterials
        .map((m, i) => `${i + 1}. ${m.title}\n${m.snippet}`)
        .join('\n\n')}`
    : '';
  const outlineBlock = guideOutline.length > 0
    ? `\n\n[참고용 수업 진행 순서 초안]\n${guideOutline.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';
  const lengthInstruction = length === 'simple'
    ? '분량은 핵심만 담아 간결하게(전체 500~800자 내외) 작성하세요. 각 섹션은 불릿 위주로 짧게 씁니다.'
    : '분량은 실제 수업에 바로 쓸 수 있을 만큼 충분히 구체적으로(전체 1500자 이상) 작성하세요. 활동마다 소요 시간, 교사 발문 예시, 준비물 등을 함께 제시하세요.';

  const prompt = `당신은 선생님의 수업 아이디어를 실제 사용 가능한 수업 계획안 문서로 작성해주는 AI입니다.

[선생님이 기록한 아이디어]
${ideaContent}
${outlineBlock}${relatedBlock}

[작성 규칙]
- 마크다운 문서로 작성하세요. "## 수업 목표", "## 도입", "## 전개", "## 정리", "## 준비물 및 유의사항" 순서의 소제목 구조를 기본으로 사용하세요 (내용에 맞지 않는 섹션은 생략 가능).
- ${lengthInstruction}
- 원문 아이디어에 없는 사실 정보를 임의로 지어내지 말고, 교육적으로 자연스럽게 살을 붙이는 수준으로 작성하세요.
- 결과에는 수업 계획안 본문만 작성하고, 다른 설명이나 인사말은 넣지 마세요.`;

  const result = await lessonPlanDraftAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  return result.response.text().trim().replace(/^```(markdown)?\n?/, '').replace(/```$/, '').trim();
}

// ── 슬라이드 만들기 도구: 자료 → AI 초안 생성 ────────────────────────────────
// slidedeck 쪽 SlideLayoutKind와 이름을 맞추되, 이 파일은 해당 타입을 import하지 않고
// 문자열 리터럴로만 다뤄 lib(gemini.ts)이 UI 레이어 타입에 결합되지 않도록 한다.
export type SlideDraftLayoutKind = 'title' | 'textOnly' | 'textImage1' | 'textImagesMany';

export interface SlideLayoutSpec {
  kind: SlideDraftLayoutKind;
  textSlots: { role: string; maxChars: number }[];
  imageSlotCount: number;
  codeSlotCount: number;
}

export interface AiDraftSlide {
  layout: SlideDraftLayoutKind;
  texts: string[];
  images: number[];
  code: number[];
}

// 선택한 템플릿의 레이아웃 스펙에 맞춰 원문을 슬라이드 초안(JSON)으로 재구성
export async function generateSlideDeckDraft(
  rawContent: string,
  layoutSpecs: SlideLayoutSpec[],
  classId?: string
): Promise<{ slides: AiDraftSlide[]; imageUrls: string[]; codeBlocks: { lang: string; code: string }[] }> {
  const { replaced: withoutImages } = extractImagePlaceholders(rawContent);
  const { replaced, blocks: codeBlocks } = extractCodePlaceholders(withoutImages);
  const imageUrls = extractImageUrls(rawContent);
  const sectionOutline = extractSectionOutline(rawContent);

  const layoutDescriptions = layoutSpecs.map(spec => {
    const textsDesc = spec.textSlots.length
      ? spec.textSlots.map((s, i) => `texts[${i}]=${s.role}(최대 ${s.maxChars}자)`).join(', ')
      : '텍스트 슬롯 없음';
    return `- "${spec.kind}": ${textsDesc} · 이미지 ${spec.imageSlotCount}개${spec.codeSlotCount ? ` · 코드 ${spec.codeSlotCount}개` : ''}`;
  }).join('\n');

  const sectionBlock = sectionOutline.length > 0
    ? `\n[원문 섹션 구조]\n${sectionOutline.join('\n')}\n`
    : '';

  const prompt = `이 수업 자료를 16:9 슬라이드 초안으로 재구성합니다. 아래 4가지 레이아웃 중 각 슬라이드에 맞는 것을 골라 배치하세요.

[사용 가능한 레이아웃]
${layoutDescriptions}
${sectionBlock}
[규칙]
- 반드시 첫 슬라이드는 "title" 레이아웃이어야 합니다 (수업 주제를 한 줄로).
- 각 슬라이드는 화면 하나에 스크롤 없이 다 들어가야 하므로, 레이아웃이 지정한 texts 개수와 글자 수 제한을 반드시 지키세요.
- 한 슬라이드에 모든 내용을 몰아넣지 말고, 내용이 많으면 여러 슬라이드로 나누세요.
${sectionOutline.length > 0 ? '- [원문 섹션 구조]에 나온 소제목 순서를 그대로 슬라이드 순서로 사용하고, 각 섹션마다 최소 1장의 슬라이드를 배정하세요. 섹션 내용이 많으면 그 섹션만 여러 장으로 나눠도 됩니다.\n' : ''}- 레이아웃에 texts 슬롯이 2개 이상이면 각 슬롯의 역할(role)에 맞는 서로 다른 내용을 담으세요. 두 번째 이후 슬롯(설명·부제목 등)을 첫 번째 슬롯(제목·핵심 문장)의 반복이나 빈 문장으로 채우지 말고, 해당 섹션 원문에서 가져온 구체적인 세부 내용·근거·예시로 채우세요.
- 모든 슬라이드의 texts 배열은 레이아웃이 요구하는 개수만큼 실제 내용으로 채워야 합니다. 빈 문자열("")이나 생략은 허용되지 않습니다 — 채울 내용이 마땅치 않다면 그 슬라이드 자체를 만들지 마세요.
- 원문에 없는 정보를 임의로 추가하거나 빼지 마세요.
- 원문에 {{IMG:n}} 표시가 있으면 관련 내용이 있는 슬라이드에서 이미지 슬롯이 있는 레이아웃을 골라 "images" 배열에 해당 번호(n)를 넣으세요. 이미지가 없는 슬라이드의 "images"는 빈 배열로 두세요. 같은 이미지 번호를 두 번 이상 쓰지 마세요.
- 원문에 {{CODE:n}} 표시가 있으면 코드 슬롯이 있는 레이아웃("textOnly"/"textImage1"/"textImagesMany" 중 codeSlotCount>0인 것)을 골라 "code" 배열에 번호를 넣으세요. 원문에 코드가 없으면 "code"는 항상 빈 배열로 두세요 (코드를 지어내지 마세요).
- 이미지/코드 슬롯 개수보다 배열 길이가 많으면 안 됩니다.

반드시 아래 JSON 배열 형식으로만 응답하세요 (설명 문구 없이 JSON만):
[{"layout":"title","texts":["...","..."],"images":[],"code":[]}, ...]

[원문]
${replaced}`;

  const MAX_ATTEMPTS = 3;
  let slides: AiDraftSlide[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await slideDeckDraftAI.generateContent(
      prompt,
      classId ? { class_id: classId } : undefined
    );
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    slides = JSON.parse(raw) as AiDraftSlide[];
    if (draftSlidesAreComplete(slides, layoutSpecs)) break;
  }

  return { slides, imageUrls, codeBlocks };
}

// 레이아웃이 요구하는 texts 슬롯이 모두 실제 내용으로 채워졌는지 검사 (빈 슬롯 재시도 판단용)
function draftSlidesAreComplete(slides: AiDraftSlide[], layoutSpecs: SlideLayoutSpec[]): boolean {
  return slides.every(slide => {
    const spec = layoutSpecs.find(s => s.kind === slide.layout);
    if (!spec) return false;
    if (slide.texts.length < spec.textSlots.length) return false;
    return slide.texts.slice(0, spec.textSlots.length).every(t => t.trim().length > 0);
  });
}
