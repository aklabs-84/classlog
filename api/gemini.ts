import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// free/school: 횟수제 유지
const PLAN_MONTHLY_LIMIT: Record<string, number> = {
  free:   20,
  school: 500,
};

// basic/pro: 크레딧(금액) 버짓 — 소진 시 pro→flash 소프트다운그레이드, HARD_STOP_MULTIPLIER배 도달 시 하드블록
const PLAN_MONTHLY_BUDGET_USD: Record<string, number> = {
  basic: 2,
  pro:   6,
};
const HARD_STOP_MULTIPLIER = 3;

// 2026-06 Gemini 단가 (USD per 1M tokens)
const PRICING: Record<string, { input: number; output: number; thinking: number }> = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50, thinking: 3.50 },
  'gemini-2.5-pro':   { input: 1.25, output: 10.00, thinking: 3.50 },
};

function calcCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number
): number {
  const p = PRICING[modelId];
  if (!p) return 0;
  return (
    (inputTokens   * p.input    / 1_000_000) +
    (outputTokens  * p.output   / 1_000_000) +
    (thinkingTokens * p.thinking / 1_000_000)
  );
}

// 데모 학급(is_demo=true) 요청은 실제 Gemini를 호출하지 않고 feature별 예시 응답으로 대체한다.
const DEMO_CACHED_RESPONSES: Record<string, string> = {
  observation_review: '{"status":"good","reason":"","guide":""}',
  seatuk_draft:
    '세포 분열과 DNA 복제 단원에서 세포 주기의 각 단계(G1기, S기, G2기, M기)를 체계적으로 이해하고, 특히 S기에 일어나는 DNA 복제 과정을 실험 영상 분석을 통해 심층적으로 파악함. 유사 분열의 전기·중기·후기·말기를 정확히 구분하여 단계별 특징을 도식화하고, 감수 분열과의 차이점을 비교표로 작성하여 제출하는 적극적인 학습 태도를 보임. 수업 중 동급생에게 핵심 개념을 자발적으로 설명하며 협력 학습을 주도하였으며, 세포 분열 단계 배열 활동에서 정확성과 신속성을 동시에 발휘함.',
  seatuk_refine:
    '세포 분열과 DNA 복제 단원에서 세포 주기의 각 단계(G1기, S기, G2기, M기)를 체계적으로 이해하고, 특히 S기에 일어나는 DNA 복제 과정을 실험 영상 분석을 통해 심층적으로 파악함. 유사 분열의 전기·중기·후기·말기를 정확히 구분하여 단계별 특징을 도식화하고, 감수 분열과의 차이점을 비교표로 작성하여 제출하는 적극적인 학습 태도를 보임.',
  seatuk_compress:
    '세포 주기 각 단계를 체계적으로 이해하고 DNA 복제 과정을 실험 영상으로 심층 파악함. 유사 분열과 감수 분열의 차이를 비교표로 정리하여 제출함.',
};
const DEMO_DEFAULT_RESPONSE = '데모 학급에서는 예시 응답이 제공됩니다.';

function getDemoCachedResponse(feature: string): string {
  return DEMO_CACHED_RESPONSES[feature] ?? DEMO_DEFAULT_RESPONSE;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const {
    mode, model = 'flash', prompt, systemInstruction, history, message, files,
    feature = 'unknown',
    jsonMode = false,
    class_id = null,
  } = req.body;

  if (!mode) {
    return res.status(400).json({ error: 'mode is required' });
  }

  const authHeader = req.headers['authorization'];
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // ── 데모 학급 캐시 응답 (실제 Gemini 호출/과금 없이 예시 응답만 반환) ─────────
  if (class_id) {
    const supabasePublic = createClient(supabaseUrl, serviceKey);
    const { data: classRow } = await supabasePublic
      .from('classes')
      .select('is_demo')
      .eq('id', class_id)
      .maybeSingle();

    if (classRow?.is_demo) {
      return res.status(200).json({ result: getDemoCachedResponse(feature) });
    }
  }

  // ── 플랜 체크 ──────────────────────────────────────────────────────────────
  let userId: string | null = null;
  let effectiveModel: string = model;
  // basic/pro 크레딧 소진 여부를 판단한 뒤, 실제 AI 호출 비용이 나오면 반영할 값
  let pendingCreditUpdate: { monthlyCostBefore: number; month: string } | null = null;

  // 인증 없는 익명 AI 호출 차단
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (authHeader && supabaseUrl && serviceKey) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!authError && user) {
        userId = user.id;
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, beta_expires_at, ai_daily_count, ai_daily_date, ai_monthly_count, ai_monthly_cost_usd, ai_monthly_reset')
          .eq('id', user.id)
          .single();

        if (profile) {
          const plan = profile.plan ?? 'free';
          const isBetaActive = profile.beta_expires_at && new Date(profile.beta_expires_at) > new Date();
          const isAdmin = plan === 'admin';

          // admin과 유효한 beta는 한도 체크 제외
          if (!isAdmin && !isBetaActive) {
            const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
            const isNewMonth = profile.ai_monthly_reset !== thisMonth;
            const budget = PLAN_MONTHLY_BUDGET_USD[plan];

            if (budget) {
              // basic/pro: 크레딧(금액) 버짓
              const monthlyCostBefore = isNewMonth ? 0 : (profile.ai_monthly_cost_usd ?? 0);
              const hardStop = budget * HARD_STOP_MULTIPLIER;

              if (monthlyCostBefore >= hardStop) {
                return res.status(402).json({
                  error: 'AI_LIMIT_EXCEEDED',
                  message: '이번 달 AI 사용량이 많아 일시적으로 제한됩니다. 다음 달 1일에 자동으로 초기화됩니다.',
                });
              }

              // 소프트 다운그레이드: 예산 소진 시 pro 요청을 flash로 조용히 전환 (완전 차단 아님)
              if (monthlyCostBefore >= budget && effectiveModel === 'pro') {
                effectiveModel = 'flash';
              }

              pendingCreditUpdate = { monthlyCostBefore, month: thisMonth };
            } else {
              // free/school: 기존 횟수제
              const monthlyUsed = isNewMonth ? 0 : (profile.ai_monthly_count ?? 0);
              const monthlyLimit = PLAN_MONTHLY_LIMIT[plan] ?? 20;

              if (monthlyUsed >= monthlyLimit) {
                return res.status(402).json({
                  error: 'AI_LIMIT_EXCEEDED',
                  message: `이번 달 AI 사용 한도(${monthlyLimit}회)에 도달했습니다. 다음 달 1일에 자동으로 초기화됩니다.`,
                  used: monthlyUsed,
                  limit: monthlyLimit,
                });
              }

              // 사용량 카운트 업데이트 (비동기, 응답 블로킹 없음)
              supabase.from('profiles').update({
                ai_monthly_count: monthlyUsed + 1,
                ai_monthly_reset: thisMonth,
                // free 플랜은 일별 카운트도 병행 유지
                ...(plan === 'free' ? {
                  ai_daily_count: (() => {
                    const today = new Date().toISOString().split('T')[0];
                    const isNewDay = profile.ai_daily_date !== today;
                    return isNewDay ? 1 : (profile.ai_daily_count ?? 0) + 1;
                  })(),
                  ai_daily_date: new Date().toISOString().split('T')[0],
                } : {}),
              }).eq('id', user.id).then(() => {});
            }
          }
        }
      }
    } catch (planCheckError) {
      console.warn('[api/gemini] plan check failed:', planCheckError);
    }
  }

  // ── AI 호출 ────────────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelId = effectiveModel === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    const generativeModel = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        ...(effectiveModel === 'pro'
          ? { temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 8192 }
          : { temperature: 0.4, topP: 0.8, topK: 40, maxOutputTokens: 8192 }),
        ...(jsonMode && {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        }),
      },
    });

    let result: string;
    let usageMeta: any = null;

    if (mode === 'generate') {
      const parts: any[] = [{ text: prompt ?? '' }];
      if (files && files.length > 0) parts.push(...files);
      const contentParts = systemInstruction ? [{ text: systemInstruction }, ...parts] : parts;
      const { response } = await generativeModel.generateContent(contentParts);
      result = response.text();
      usageMeta = response.usageMetadata ?? null;

    } else if (mode === 'chat') {
      const chat = generativeModel.startChat({
        history: (history ?? []).map((h: any) => ({
          role: h.role as 'user' | 'model',
          parts: Array.isArray(h.parts) ? h.parts : [{ text: h.text ?? '' }],
        })),
        systemInstruction: systemInstruction,
      });
      const promptParts: any[] = [{ text: message ?? '' }];
      if (files && files.length > 0) promptParts.push(...files);
      const { response } = await chat.sendMessage(promptParts);
      result = response.text();
      usageMeta = response.usageMetadata ?? null;

    } else {
      return res.status(400).json({ error: `Unknown mode: ${mode}` });
    }

    // ── 비용 계산 & 로깅 (비동기, 응답 블로킹 없음) ──────────────────────────
    if (usageMeta && supabaseUrl && serviceKey) {
      const inputTokens    = usageMeta.promptTokenCount       ?? 0;
      const outputTokens   = usageMeta.candidatesTokenCount   ?? 0;
      const thinkingTokens = usageMeta.thoughtsTokenCount     ?? 0;
      const costUsd = calcCostUsd(modelId, inputTokens, outputTokens, thinkingTokens);

      const supabase = createClient(supabaseUrl, serviceKey);
      const { error: logError } = await supabase.from('ai_usage_logs').insert({
        user_id:         userId,
        feature_name:    feature,
        model_name:      modelId,
        input_tokens:    inputTokens,
        output_tokens:   outputTokens,
        thinking_tokens: thinkingTokens,
        cost_usd:        costUsd,
        ...(class_id && { class_id }),
      });
      if (logError) console.error('[api/gemini] ai_usage_logs insert FAILED:', JSON.stringify(logError));

      // basic/pro 크레딧 누적 반영 (비동기, 응답 블로킹 없음)
      if (pendingCreditUpdate && userId) {
        supabase.from('profiles').update({
          ai_monthly_cost_usd: pendingCreditUpdate.monthlyCostBefore + costUsd,
          ai_monthly_reset:    pendingCreditUpdate.month,
        }).eq('id', userId).then(() => {});
      }
    }

    return res.status(200).json({ result });

  } catch (error: any) {
    console.error('[api/gemini] error:', error?.message);
    return res.status(500).json({ error: error?.message ?? 'AI 처리 중 오류가 발생했습니다.' });
  }
}
