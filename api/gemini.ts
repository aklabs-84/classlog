import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// free/school: 횟수제 유지
const PLAN_MONTHLY_LIMIT: Record<string, number> = {
  free:   20,
  school: 500,
};

// basic/pro: 크레딧(금액) 버짓 — 소진 시 pro→flash 소프트다운그레이드, HARD_STOP_MULTIPLIER배 도달 시 하드블록
// 하드스톱을 요금제 가격보다 낮게 잡아 헤비유저 1인당 손실이 나지 않도록 함(1.2배: basic $2.4, pro $7.2 — 각각 9,900원/19,900원보다 낮음)
const PLAN_MONTHLY_BUDGET_USD: Record<string, number> = {
  basic: 2,
  pro:   6,
};
const HARD_STOP_MULTIPLIER = 1.2;

// 베타(무료체험) 유저는 매출이 0원이라 위 플랜 버짓을 그대로 쓰면 손실 상한이 없음 → 별도의 낮은 고정 캡을 둔다.
const BETA_TRIAL_BUDGET_USD = 1.5;
const BETA_TRIAL_HARD_STOP_USD = 3;

// Google Search 그라운딩(useWebSearch)은 토큰 요금과 별개로 건당 정액 요금이 붙음
// (2026-08 기준 $35 / 1,000 grounded prompt) → 실제 호출됐을 때만 정액 비용을 더해준다.
const GROUNDING_COST_USD_PER_CALL = 0.035;

// 2026-09 Gemini 단가 (USD per 1M tokens) — 2.5 계열이 2026-10-16 폐기 예정이라 3세대로 이전.
// gemini-3.6-flash 단가는 2026-12-31까지의 도입가(introductory price)이며 2027-01-01부터 input $1.50 / output $7.50로 인상 예정.
// 신모델은 thinking 토큰을 output과 동일 단가로 과금(별도 단가 없음).
const PRICING: Record<string, { input: number; output: number; thinking: number }> = {
  'gemini-3.6-flash':       { input: 0.75, output: 3.75,  thinking: 3.75 },
  'gemini-3.1-pro-preview': { input: 2.00, output: 12.00, thinking: 12.00 },
  'gemini-3.1-flash-lite':  { input: 0.25, output: 1.50,  thinking: 1.50 },
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

// Gemini 그라운딩 메타데이터의 web.title은 실제 문서 제목이 아니라 사이트 도메인만 오는 경우가 많음
// (예: "tistory.com") → 리다이렉트 링크를 직접 열어 <title> 태그를 읽어 진짜 제목으로 대체한다.
async function fetchPageTitle(url: string, timeoutMs = 2500): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < 8000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!match) return null;
    const title = match[1].replace(/\s+/g, ' ').trim();
    return title ? title.slice(0, 200) : null;
  } catch {
    return null;
  }
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
    text = '',
    useWebSearch = false,
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

  // ── 임베딩 모드: 저장/검색용 벡터 계산 — 사용자에게 보이지 않는 인프라 호출이라
  // 플랜 한도 체크·과금 로깅을 거치지 않고 인증만 확인한 뒤 바로 처리한다.
  if (mode === 'embed') {
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const supabase = createClient(supabaseUrl, serviceKey);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!text || !text.trim()) {
        return res.status(400).json({ error: 'text is required' });
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      // outputDimensionality: DB의 vector(768) 컬럼과 맞추기 위해 768차원으로 축소 요청 — SDK 타입 정의에는 없지만 API는 지원한다.
      const { embedding } = await embeddingModel.embedContent({
        content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
        outputDimensionality: 768,
      } as any);
      return res.status(200).json({ embedding: embedding.values });
    } catch (error: any) {
      console.error('[api/gemini] embed error:', error?.message);
      return res.status(500).json({ error: error?.message ?? '임베딩 처리 중 오류가 발생했습니다.' });
    }
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

          // admin만 한도 체크 제외. 베타(무료체험)는 매출이 없으므로 낮은 고정 캡을 별도 적용한다.
          if (!isAdmin) {
            const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
            const isNewMonth = profile.ai_monthly_reset !== thisMonth;

            if (isBetaActive) {
              const monthlyCostBefore = isNewMonth ? 0 : (profile.ai_monthly_cost_usd ?? 0);

              if (monthlyCostBefore >= BETA_TRIAL_HARD_STOP_USD) {
                return res.status(402).json({
                  error: 'AI_LIMIT_EXCEEDED',
                  message: '무료체험 AI 사용량이 많아 일시적으로 제한됩니다. 요금제 결제 후 계속 이용하실 수 있습니다.',
                });
              }

              // 소프트 다운그레이드: 예산 소진 시 pro 요청을 flash로 조용히 전환 (완전 차단 아님)
              if (monthlyCostBefore >= BETA_TRIAL_BUDGET_USD && effectiveModel === 'pro') {
                effectiveModel = 'flash';
              }

              pendingCreditUpdate = { monthlyCostBefore, month: thisMonth };
            } else {
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
      }
    } catch (planCheckError) {
      console.warn('[api/gemini] plan check failed:', planCheckError);
    }
  }

  // ── AI 호출 ────────────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelId = effectiveModel === 'pro'
      ? 'gemini-3.1-pro-preview'
      : effectiveModel === 'lite'
        ? 'gemini-3.1-flash-lite'
        : 'gemini-3.6-flash';
    const generativeModel = genAI.getGenerativeModel({
      model: modelId,
      generationConfig: {
        ...(effectiveModel === 'pro'
          ? { temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 8192 }
          : { temperature: 0.4, topP: 0.8, topK: 40, maxOutputTokens: 8192 }),
        ...(jsonMode && {
          responseMimeType: 'application/json',
          // gemini-3.1-pro-preview는 thinking을 끌 수 없음(budget 0 불가) → pro는 thinkingConfig 생략
          // gemini-3.6-flash는 thinkingBudget 0을 거부하므로(400) 최소값 128 사용, lite는 0 허용
          ...(effectiveModel === 'lite' && { thinkingConfig: { thinkingBudget: 0 } }),
          ...(effectiveModel === 'flash' && { thinkingConfig: { thinkingBudget: 128 } }),
        }),
      },
    });

    let result: string;
    let usageMeta: any = null;
    let sources: { title: string; uri: string }[] | undefined;

    if (mode === 'generate') {
      const parts: any[] = [{ text: prompt ?? '' }];
      if (files && files.length > 0) parts.push(...files);
      const contentParts = systemInstruction ? [{ text: systemInstruction }, ...parts] : parts;
      const { response } = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: contentParts }],
        // gemini-2.5는 googleSearch 툴(REST 필드명)로 그라운딩 — SDK 타입에는 아직 googleSearchRetrieval(구버전)만 있어 any로 우회
        ...(useWebSearch && { tools: [{ googleSearch: {} }] as any }),
      });
      result = response.text();
      usageMeta = response.usageMetadata ?? null;
      if (useWebSearch) {
        const chunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks ?? [];
        const rawSources = chunks
          .map((c: any) => ({ title: c.web?.title ?? '', uri: c.web?.uri ?? '' }))
          .filter((s: { uri: string }) => s.uri);
        // 실제 문서 제목을 가져오되, 개별 요청이 느려도 전체 응답이 오래 걸리지 않도록 짧은 타임아웃으로 병렬 조회
        sources = await Promise.all(
          rawSources.map(async (s: { title: string; uri: string }) => ({
            title: (await fetchPageTitle(s.uri)) || s.title || s.uri,
            uri: s.uri,
          }))
        );
      }

    } else if (mode === 'chat') {
      // startChat()에 systemInstruction을 그대로 넘기면 문자열이 포맷 변환 없이 API로 전달되어
      // "Invalid value at 'system_instruction'" 오류가 남 → getGenerativeModel() 생성 시점에 넘겨야 SDK가 올바르게 변환함
      const chatModel = systemInstruction
        ? genAI.getGenerativeModel({ model: modelId, generationConfig: generativeModel.generationConfig, systemInstruction })
        : generativeModel;
      const chat = chatModel.startChat({
        history: (history ?? []).map((h: any) => ({
          role: h.role as 'user' | 'model',
          parts: Array.isArray(h.parts) ? h.parts : [{ text: h.text ?? '' }],
        })),
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
      const costUsd = calcCostUsd(modelId, inputTokens, outputTokens, thinkingTokens)
        + (useWebSearch ? GROUNDING_COST_USD_PER_CALL : 0);

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

    return res.status(200).json({ result, ...(sources && { sources }) });

  } catch (error: any) {
    console.error('[api/gemini] error:', error?.message);
    return res.status(500).json({ error: error?.message ?? 'AI 처리 중 오류가 발생했습니다.' });
  }
}
