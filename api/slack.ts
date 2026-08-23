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
  return res.status(400).json({ error: 'Invalid or missing type query param (announcement | notify | school-inquiry | bug-report | google-signup | waitlist)' });
}
