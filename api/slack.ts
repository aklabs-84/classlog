import { createClient } from '@supabase/supabase-js';

async function handleAnnouncement(req: any, res: any) {
  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookUrl     = process.env.SLACK_WEBHOOK_URL;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  if (!webhookUrl) {
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });
  }

  // 관리자 인증 검증
  const token = (req.headers['authorization'] ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) return res.status(401).json({ error: 'Unauthorized' });
  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', caller.id).single();
  if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📢 클래스로그 — 공지사항', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${title}*\n\n${content}` },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `발송 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | 관리자가 발송한 공지사항입니다.`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Slack responded with ${response.status}`);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[api/slack?type=announcement] error:', error?.message);
    return res.status(500).json({ error: error?.message });
  }
}

async function handleNotify(req: any, res: any) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('[slack?type=notify] SLACK_WEBHOOK_URL env var is not set');
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });
  }
  console.log('[slack?type=notify] sending to webhook, email:', req.body?.email);

  const { name, email, school_name, role, message } = req.body;

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔔 클래스로그 AI — 새 사용 신청',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*이름*\n${name}` },
          { type: 'mrkdwn', text: `*직책*\n${role}` },
          { type: 'mrkdwn', text: `*학교*\n${school_name}` },
          { type: 'mrkdwn', text: `*이메일*\n${email}` },
        ],
      },
      ...(message
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*하고 싶은 말*\n${message}`,
              },
            },
          ]
        : []),
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `신청 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | 어드민 패널에서 승인/거절하세요.`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack responded with ${response.status}`);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[api/slack?type=notify] error:', error?.message);
    return res.status(500).json({ error: error?.message });
  }
}

async function handleSchoolInquiry(req: any, res: any) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });
  }

  const { org_type, org_name, contact_name, email, phone, member_count, message } = req.body;

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🏫 클래스로그 AI — ${org_type} 도입 문의`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*기관 유형*\n${org_type}` },
          { type: 'mrkdwn', text: `*기관명*\n${org_name}` },
          { type: 'mrkdwn', text: `*담당자*\n${contact_name}` },
          { type: 'mrkdwn', text: `*이메일*\n${email}` },
          { type: 'mrkdwn', text: `*연락처*\n${phone || '미입력'}` },
          { type: 'mrkdwn', text: `*교사·강사 수*\n${member_count}명` },
        ],
      },
      ...(message
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*문의 내용*\n${message}`,
              },
            },
          ]
        : []),
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `문의 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | School 플랜 도입 문의`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Slack responded with ${response.status}`);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[api/slack?type=school-inquiry] error:', error?.message);
    return res.status(500).json({ error: error?.message });
  }
}

async function handleBugReport(req: any, res: any) {
  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookUrl     = process.env.SLACK_WEBHOOK_URL;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { user_id, user_name, user_email, title, description, page_url } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'title and description are required' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. DB 저장
  const { error: dbError } = await supabaseAdmin.from('bug_reports').insert({
    user_id: user_id || null,
    user_name: user_name || '익명',
    user_email: user_email || '',
    title,
    description,
    page_url: page_url || '',
    status: 'open',
  });

  if (dbError) {
    console.error('[api/slack?type=bug-report] db error:', dbError.message);
    return res.status(500).json({ error: dbError.message });
  }

  // 2. Slack 알림 (설정된 경우)
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '🐛 클래스로그 — 새 버그 리포트', emoji: true },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*제목*\n${title}` },
                { type: 'mrkdwn', text: `*신고자*\n${user_name || '익명'} (${user_email || '-'})` },
              ],
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*내용*\n${description}` },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `📍 페이지: ${page_url || '-'} | ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | 관리자 패널 → 버그신고 탭에서 확인`,
                },
              ],
            },
          ],
        }),
      });
    } catch (slackErr: any) {
      console.warn('[api/slack?type=bug-report] slack notify failed:', slackErr?.message);
    }
  }

  return res.status(200).json({ ok: true });
}

async function handleGoogleSignup(req: any, res: any) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });
  }

  const { name, email } = req.body;

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 클래스로그 AI — 신규 구글 가입',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*이름*\n${name || '(미입력)'}` },
          { type: 'mrkdwn', text: `*이메일*\n${email}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `가입 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | 무료 플랜 자동 승인됨 — 별도 조치 불필요`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`Slack responded with ${response.status}`);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[api/slack?type=google-signup] error:', error?.message);
    return res.status(500).json({ error: error?.message });
  }
}

async function handleWaitlist(req: any, res: any) {
  const webhookUrl     = process.env.SLACK_WEBHOOK_URL;
  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });
  }

  const { email, name, phone, plan_interest, memo } = req.body;

  const PLAN_LABELS: Record<string, string> = {
    basic: 'Basic',
    pro: 'Pro',
    school: 'School',
    unsure: '미정',
  };

  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🎉 클래스로그 AI — 얼리버드 웨이팅리스트 신청', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*이메일*\n${email}` },
          { type: 'mrkdwn', text: `*이름*\n${name || '(미입력)'}` },
          { type: 'mrkdwn', text: `*휴대폰*\n${phone || '(미입력)'}` },
          { type: 'mrkdwn', text: `*관심 플랜*\n${PLAN_LABELS[plan_interest] || plan_interest}` },
        ],
      },
      ...(memo
        ? [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*하고 싶은 말*\n${memo}` },
            },
          ]
        : []),
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `신청 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Slack responded with ${response.status}`);
  } catch (error: any) {
    console.error('[api/slack?type=waitlist] slack error:', error?.message);
  }

  // 관리자 PWA 푸시 알림 (notifications insert → 기존 DB 트리거가 /api/send-push 자동 호출)
  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true);
      if (admins && admins.length > 0) {
        await supabaseAdmin.from('notifications').insert(
          admins.map((admin) => ({
            user_id: admin.id,
            title: '🎉 새 웨이팅리스트 신청',
            content: `${email} (${PLAN_LABELS[plan_interest] || plan_interest} 관심)`,
            type: 'waitlist_signup',
            link: '/admin',
          }))
        );
      }
    } catch (error: any) {
      console.error('[api/slack?type=waitlist] push notify error:', error?.message);
    }
  }

  return res.status(200).json({ ok: true });
}

async function handleTrainingRequest(req: any, res: any) {
  const webhookUrl     = process.env.SLACK_WEBHOOK_URL;
  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { name, phone, email, preferred_method, organization, group_size, memo, source } = req.body;

  const METHOD_LABELS: Record<string, string> = {
    video_call: '화상통화로 안내받기',
    visit: '학교(현장) 방문 안내',
    kakao: '카카오톡으로 편하게 문의',
    material_only: '사용법 자료만 받아보기',
  };

  if (webhookUrl) {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎓 클래스로그 AI — 사용법 교육 신청', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*이름*\n${name}` },
            { type: 'mrkdwn', text: `*연락처*\n${phone}` },
            { type: 'mrkdwn', text: `*이메일*\n${email || '-'}` },
            { type: 'mrkdwn', text: `*희망 방식*\n${METHOD_LABELS[preferred_method] || preferred_method}` },
            ...(organization ? [{ type: 'mrkdwn', text: `*소속*\n${organization}` }] : []),
            ...(group_size ? [{ type: 'mrkdwn', text: `*인원*\n약 ${group_size}명` }] : []),
          ],
        },
        ...(memo
          ? [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `*하고 싶은 말*\n${memo}` },
              },
            ]
          : []),
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `신청 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | source: ${source || '-'}`,
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Slack responded with ${response.status}`);
    } catch (error: any) {
      console.error('[api/slack?type=training-request] slack error:', error?.message);
    }
  }

  // 관리자 PWA 푸시 알림 (notifications insert → 기존 DB 트리거가 /api/send-push 자동 호출)
  if (supabaseUrl && serviceRoleKey) {
    try {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: admins } = await supabaseAdmin.from('profiles').select('id').eq('is_admin', true);
      if (admins && admins.length > 0) {
        await supabaseAdmin.from('notifications').insert(
          admins.map((admin) => ({
            user_id: admin.id,
            title: '🎓 새 사용법 교육 신청',
            content: `${name} (${phone}) — ${METHOD_LABELS[preferred_method] || preferred_method}`,
            type: 'training_request',
            link: '/admin',
          }))
        );
      }
    } catch (error: any) {
      console.error('[api/slack?type=training-request] push notify error:', error?.message);
    }
  }

  return res.status(200).json({ ok: true });
}

// 주의 키워드가 감지된 학생 건의사항 → Slack (DB 트리거가 호출, 푸시와 같은 비밀 열쇠로 인증)
async function handleFlaggedSuggestion(req: any, res: any) {
  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  const webhookUrl    = process.env.SLACK_WEBHOOK_URL;
  const authHeader    = req.headers.authorization ?? '';
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!webhookUrl) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });

  // 학생이 쓴 글이므로 Slack 서식 문자를 무력화
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const { student_name, content, link, flagged } = req.body ?? {};
  if (!content) return res.status(400).json({ error: 'content is required' });
  const isFlagged = flagged !== false; // 예전 호출(flagged 없음)은 주의 건으로 취급

  const origin = 'https://classlog-ai.vercel.app';
  const href = typeof link === 'string' && link.startsWith('/') ? `${origin}${link}` : origin;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: isFlagged ? '⚠️ 클래스로그 — 건의사항 주의 키워드 감지' : '💬 클래스로그 — 새 질문·건의가 도착했어요', emoji: true },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*학생*\n${esc(student_name)}` },
              { type: 'mrkdwn', text: `*내용(앞 80자)*\n${esc(String(content).slice(0, 80))}` },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `<${href}|${isFlagged ? '해당 학생 화면 열기' : '건의함 열기'}> | ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
              },
            ],
          },
        ],
      }),
    });
  } catch (slackErr: any) {
    console.warn('[api/slack?type=flagged-suggestion] slack notify failed:', slackErr?.message);
  }
  return res.status(200).json({ ok: true });
}

// DB 예약 작업(run_usage_check)이 보내는 용량 경고 — 70%/90%를 넘었을 때만 호출됨
async function handleUsageAlert(req: any, res: any) {
  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  const webhookUrl    = process.env.SLACK_WEBHOOK_URL;
  const authHeader    = req.headers.authorization ?? '';
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!webhookUrl) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' });

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'items is required' });

  const lines = items.map((i: any) =>
    `${Number(i.level) >= 90 ? '🔴' : '🟠'} *${String(i.label)}* ${Number(i.pct)}% 사용 (${Number(i.used_mb)}MB / ${Number(i.limit_mb)}MB)`
  );
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '⚠️ 클래스로그 — 서버 용량 경고', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Supabase Pro 기준 | ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` }] },
        ],
      }),
    });
  } catch (e: any) {
    console.warn('[api/slack?type=usage-alert] slack notify failed:', e?.message);
  }
  return res.status(200).json({ ok: true });
}

// 매일 Supabase 요청 수 점검 — 최근 24시간 합계가 평소(최근 7일 평균)의 2배 + 10만 건을 넘으면 슬랙·앱 푸시로 경고
// 읽기 전용 토큰은 서버 환경변수(SUPABASE_USAGE_TOKEN)에만 있고, 기록은 usage_alert_state 표를 재사용 (key='req_날짜')
async function handleRequestCheck(req: any, res: any) {
  const webhookSecret  = process.env.PUSH_WEBHOOK_SECRET;
  const webhookUrl     = process.env.SLACK_WEBHOOK_URL;
  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token          = process.env.SUPABASE_USAGE_TOKEN;
  const authHeader     = req.headers.authorization ?? '';
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseUrl || !serviceRoleKey || !token) return res.status(500).json({ error: 'env not configured' });

  const ref = supabaseUrl.replace(/^https:\/\//, '').split('.')[0];
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=1day`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return res.status(502).json({ error: 'usage api failed', status: r.status });
  const rows: any[] = (await r.json())?.result ?? [];
  const sum = (k: string) => rows.reduce((s, x) => s + Number(x[k] ?? 0), 0);
  const parts = { rest: sum('total_rest_requests'), auth: sum('total_auth_requests'), realtime: sum('total_realtime_requests'), storage: sum('total_storage_requests') };
  const total = parts.rest + parts.auth + parts.realtime + parts.storage;

  const sb = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' };
  const today = new Date().toISOString().slice(0, 10);
  const prevRes = await fetch(`${supabaseUrl}/rest/v1/usage_alert_state?key=like.req_*&key=lt.req_${today}&select=level&order=key.desc&limit=7`, { headers: sb });
  const prev: number[] = (await prevRes.json().catch(() => [])).map((x: any) => Number(x.level));
  const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;

  await fetch(`${supabaseUrl}/rest/v1/usage_alert_state?on_conflict=key`, {
    method: 'POST',
    headers: { ...sb, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: `req_${today}`, level: total, notified_at: null }),
  });

  const spike = total >= 100000 && (prev.length === 0 || total >= avg * 2);
  if (spike) {
    const text = `Supabase 요청 ${total.toLocaleString()}건 (평소 약 ${Math.round(avg).toLocaleString()}건) — 데이터 ${parts.rest.toLocaleString()} · 실시간 ${parts.realtime.toLocaleString()} · 로그인 ${parts.auth.toLocaleString()} · 파일 ${parts.storage.toLocaleString()}`;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: '⚠️ 클래스로그 — 요청 수 급증', emoji: true } },
            { type: 'section', text: { type: 'mrkdwn', text } },
          ],
        }),
      }).catch(() => {});
    }
    const admins = await fetch(`${supabaseUrl}/rest/v1/profiles?is_admin=eq.true&select=id`, { headers: sb }).then(x => x.json()).catch(() => []);
    if (Array.isArray(admins) && admins.length) {
      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: sb,
        body: JSON.stringify(admins.map((a: any) => ({ user_id: a.id, title: '⚠️ 요청 수 급증', content: text, type: 'usage_alert', link: '/admin' }))),
      }).catch(() => {});
    }
  }
  return res.status(200).json({ ok: true, total, avg: Math.round(avg), days: prev.length, rows: rows.length, spike });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const type = req.query?.type;
  if (type === 'announcement') return handleAnnouncement(req, res);
  if (type === 'notify') return handleNotify(req, res);
  if (type === 'school-inquiry') return handleSchoolInquiry(req, res);
  if (type === 'bug-report') return handleBugReport(req, res);
  if (type === 'google-signup') return handleGoogleSignup(req, res);
  if (type === 'waitlist') return handleWaitlist(req, res);
  if (type === 'training-request') return handleTrainingRequest(req, res);
  if (type === 'flagged-suggestion') return handleFlaggedSuggestion(req, res);
  if (type === 'usage-alert') return handleUsageAlert(req, res);
  if (type === 'request-check') return handleRequestCheck(req, res);
  return res.status(400).json({ error: 'Invalid or missing type query param (announcement | notify | school-inquiry | bug-report | google-signup | waitlist | training-request | flagged-suggestion | usage-alert | request-check)' });
}
