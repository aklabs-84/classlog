import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gmailUser      = process.env.GMAIL_USER;
  const gmailPassword  = process.env.GMAIL_APP_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[api/invite-user] Missing Supabase env variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 호출자 관리자 인증 검증
  const token = (req.headers['authorization'] ?? '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !caller) return res.status(401).json({ error: 'Unauthorized' });
  const { data: callerProfile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', caller.id).single();
  if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Forbidden: admin only' });

  const { email, name, plan } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const assignedPlan = ['free', 'basic', 'pro', 'school', 'admin'].includes(plan) ? plan : 'free';

  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'classlog-ai.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const siteUrl  = `${protocol}://${host}`;

  // Gmail 트랜스포터 (설정된 경우에만 사용)
  const transporter = gmailUser && gmailPassword
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPassword },
      })
    : null;

  const sendCustomEmail = async (to: string, subject: string, html: string) => {
    if (!transporter) return false;
    try {
      await transporter.sendMail({ from: `AKLABS <${gmailUser}>`, to, subject, html });
      return true;
    } catch (err: any) {
      console.error('[api/invite-user] Gmail send error:', err.message);
      return false;
    }
  };

  // ── Step 1: 유저 생성 또는 기존 유저 ID 확보 ────────────────────────────────
  let userId: string | null = null;

  // 신규 유저 생성 시도 (invite 방식)
  const { data: inviteLink, error: inviteError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { full_name: name || '', name: name || '' },
        redirectTo: `${siteUrl}/set-password`,
      },
    });

  if (!inviteError && inviteLink?.user) {
    userId = inviteLink.user.id;
    console.log('[api/invite-user] new user created via invite, userId:', userId);
  } else {
    // 이미 존재하는 유저 → profiles 테이블에서 ID 조회
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = profileData?.id ?? null;
    console.log('[api/invite-user] existing user found, userId:', userId, 'inviteError:', inviteError?.message);
  }

  if (!userId) {
    console.error('[api/invite-user] could not find or create user for:', email);
    return res.status(500).json({ error: 'Could not find or create user' });
  }

  // ── Step 2: 이메일 확인 처리 + 메타데이터 갱신 ─────────────────────────────
  // unconfirmed 상태이면 recovery 링크가 동작하지 않으므로 강제 confirm
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    user_metadata: { full_name: name || '', name: name || '' },
  });

  // ── Step 3: 프로필 업데이트 ───────────────────────────────────────────────
  await supabaseAdmin.from('profiles')
    .update({ full_name: name || '', role: 'teacher', email, is_approved: true, plan: assignedPlan })
    .eq('id', userId);

  // ── Step 4: Recovery 링크 생성 (confirmed 유저에서 100% 동작) ────────────
  const { data: recoveryLink, error: recoveryError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl}/set-password` },
    });

  if (recoveryError || !recoveryLink?.properties?.action_link) {
    console.error('[api/invite-user] recovery link error:', recoveryError?.message);
    return res.status(500).json({ error: 'Failed to generate recovery link' });
  }

  const actionUrl = recoveryLink.properties.action_link;
  console.log('[api/invite-user] recovery action_link generated, sending email to:', email);

  // ── Step 5: 승인 이메일 발송 ─────────────────────────────────────────────
  const emailSent = await sendCustomEmail(
    email,
    '클래스로그 AI 사용 승인 안내',
    inviteEmailHtml(name, actionUrl),
  );

  if (!emailSent) {
    console.error('[api/invite-user] email send failed for:', email);
    return res.status(500).json({ error: 'Email send failed. Check Gmail credentials in Vercel env vars.' });
  }

  return res.status(200).json({ ok: true, type: 'invite' });
}

// ── 이메일 HTML 템플릿 ────────────────────────────────────────────────────────

function inviteEmailHtml(name: string, siteUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:'Apple SD Gothic Neo',AppleGothic,'Malgun Gothic',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#F59E0B 0%,#EA580C 100%);padding:36px 32px;text-align:center;position:relative;">
      <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 18px;margin-bottom:12px;">
        <span style="color:#fff;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">클래스로그 AI</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">사용 신청이 승인되었습니다 🎉</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.80);font-size:13px;">수업 기록부터 세특까지</p>
    </div>
    <div style="padding:40px 36px;">
      <p style="margin:0 0 28px;color:#44403C;font-size:15px;line-height:1.8;">
        안녕하세요${name ? `, <strong style="color:#92400E;">${name}</strong> 선생님` : ''}!<br>
        클래스로그 AI 사용 신청이 승인되었습니다.<br>
        아래 버튼을 클릭해 비밀번호를 설정하고 바로 시작해보세요.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${siteUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#F59E0B 0%,#EA580C 100%);color:#fff;font-size:15px;font-weight:900;text-decoration:none;padding:16px 44px;border-radius:14px;box-shadow:0 6px 20px rgba(245,158,11,0.40);letter-spacing:-0.2px;">
          비밀번호 설정하기 →
        </a>
      </div>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;margin-top:8px;">
        <p style="margin:0;color:#92400E;font-size:12px;line-height:1.7;text-align:center;">
          ⏱ 링크는 발송 후 24시간 동안 유효합니다.<br>
          본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다.
        </p>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,#FEF3C7,#FDE68A);padding:18px 36px;text-align:center;border-top:1px solid #FDE68A;">
      <p style="margin:0;color:#92400E;font-size:12px;font-weight:700;">감사합니다. AKLABS 드림 ✦</p>
    </div>
  </div>
</body>
</html>`;
}

function resetEmailHtml(name: string, resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:'Apple SD Gothic Neo',AppleGothic,'Malgun Gothic',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#F59E0B 0%,#EA580C 100%);padding:36px 32px;text-align:center;position:relative;">
      <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 18px;margin-bottom:12px;">
        <span style="color:#fff;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">클래스로그 AI</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">비밀번호 재설정 안내</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.80);font-size:13px;">수업 기록부터 세특까지</p>
    </div>
    <div style="padding:40px 36px;">
      <p style="margin:0 0 28px;color:#44403C;font-size:15px;line-height:1.8;">
        안녕하세요${name ? `, <strong style="color:#92400E;">${name}</strong> 선생님` : ''}!<br>
        아래 버튼을 클릭해 비밀번호를 재설정해주세요.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#F59E0B 0%,#EA580C 100%);color:#fff;font-size:15px;font-weight:900;text-decoration:none;padding:16px 44px;border-radius:14px;box-shadow:0 6px 20px rgba(245,158,11,0.40);letter-spacing:-0.2px;">
          비밀번호 재설정하기 →
        </a>
      </div>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;margin-top:8px;">
        <p style="margin:0;color:#92400E;font-size:12px;line-height:1.7;text-align:center;">
          ⏱ 링크는 발송 후 1시간 동안 유효합니다.<br>
          본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다.
        </p>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,#FEF3C7,#FDE68A);padding:18px 36px;text-align:center;border-top:1px solid #FDE68A;">
      <p style="margin:0;color:#92400E;font-size:12px;font-weight:700;">감사합니다. AKLABS 드림 ✦</p>
    </div>
  </div>
</body>
</html>`;
}
