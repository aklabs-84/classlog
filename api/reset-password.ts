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
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const host     = req.headers['x-forwarded-host'] || req.headers.host || 'classlog-ai.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const siteUrl  = `${protocol}://${host}`;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1차: recovery 링크 시도 (기존 비밀번호 있는 계정)
  let { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl}/set-password` },
    });

  let linkType: 'recovery' | 'invite' = 'recovery';

  // recovery 실패 시 → invite 링크로 재시도 (비밀번호 미설정 신규 계정 대응)
  if (linkError) {
    console.warn('[api/reset-password] recovery failed, trying invite:', linkError.message);
    const inviteResult = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/set-password` },
    });
    if (inviteResult.error) {
      // 가입되지 않은 이메일도 보안상 동일한 응답 반환
      console.warn('[api/reset-password] invite also failed:', inviteResult.error.message);
      return res.status(200).json({ ok: true });
    }
    linkData  = inviteResult.data;
    linkError = null;
    linkType  = 'invite';
  }

  const resetUrl = linkData!.properties?.action_link ?? `${siteUrl}/set-password`;

  // Gmail 발송
  if (gmailUser && gmailPassword) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPassword },
      });

      await transporter.sendMail({
        from: `AKLABS <${gmailUser}>`,
        to: email,
        subject: '클래스로그 AI 비밀번호 재설정 안내',
        html: resetEmailHtml(resetUrl),
      });
    } catch (err: any) {
      console.error('[api/reset-password] Gmail error:', err.message);
    }
  }

  return res.status(200).json({ ok: true });
}

function resetEmailHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:'Apple SD Gothic Neo',AppleGothic,'Malgun Gothic',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#F59E0B 0%,#EA580C 100%);padding:36px 32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 18px;margin-bottom:12px;">
        <span style="color:#fff;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">클래스로그 AI</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">비밀번호 재설정 안내</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.80);font-size:13px;">수업 기록부터 세특까지</p>
    </div>
    <div style="padding:40px 36px;">
      <p style="margin:0 0 28px;color:#44403C;font-size:15px;line-height:1.8;">
        비밀번호 재설정 요청이 접수되었습니다.<br>
        아래 버튼을 클릭해 새 비밀번호를 설정해주세요.
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
