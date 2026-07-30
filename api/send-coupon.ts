import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gmailUser      = process.env.GMAIL_USER;
  const gmailPassword  = process.env.GMAIL_APP_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Server config error' });

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 요청자가 admin인지 확인
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', caller.id).single();
  if (!callerProfile?.is_admin) return res.status(403).json({ error: 'Forbidden' });

  const { to_email, to_name, coupon_code, duration_days } = req.body;
  if (!to_email || !coupon_code) return res.status(400).json({ error: 'Missing fields' });

  if (!gmailUser || !gmailPassword) {
    return res.status(500).json({ error: 'Gmail not configured' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPassword },
    });

    await transporter.sendMail({
      from: `클래스로그 AI <${gmailUser}>`,
      to: to_email,
      subject: `[클래스로그 AI] Pro 체험 쿠폰이 도착했어요 🎉`,
      html: couponEmailHtml(to_name || '선생님', coupon_code, duration_days ?? 30),
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[send-coupon] Gmail error:', err.message);
    return res.status(500).json({ error: 'Email send failed' });
  }
}

function couponEmailHtml(name: string, code: string, days: number): string {
  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F9FF;font-family:'Apple SD Gothic Neo',AppleGothic,'Malgun Gothic',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#3B82F6 0%,#6366F1 100%);padding:36px 32px;text-align:center;">
      <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:14px;padding:10px 18px;margin-bottom:12px;">
        <span style="color:#fff;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">클래스로그 AI</span>
      </div>
      <h1 style="margin:0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Pro 체험 쿠폰 도착!</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">베타 테스터로 선정되셨습니다 🎉</p>
    </div>

    <div style="padding:40px 36px;">
      <p style="margin:0 0 24px;color:#44403C;font-size:15px;line-height:1.8;">
        <strong>${name}</strong> 선생님, 안녕하세요!<br>
        클래스로그 AI Pro 기능을 <strong>${days}일간 무료</strong>로 체험하실 수 있는 쿠폰을 보내드립니다.
      </p>

      <!-- 쿠폰 코드 박스 -->
      <div style="background:#EFF6FF;border:2px dashed #93C5FD;border-radius:16px;padding:24px;text-align:center;margin:0 0 28px;">
        <p style="margin:0 0 8px;color:#1E40AF;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">쿠폰 코드</p>
        <p style="margin:0;color:#1E3A8A;font-size:32px;font-weight:900;letter-spacing:0.2em;font-family:monospace;">${code}</p>
        <p style="margin:8px 0 0;color:#3B82F6;font-size:12px;">유효 기간: ${days}일</p>
      </div>

      <!-- 사용 방법 -->
      <div style="background:#F8FAFC;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
        <p style="margin:0 0 12px;color:#334155;font-size:13px;font-weight:700;">사용 방법</p>
        <ol style="margin:0;padding-left:20px;color:#64748B;font-size:13px;line-height:2;">
          <li>클래스로그 AI 앱에 로그인</li>
          <li>우측 메뉴 → <strong>설정</strong> 페이지 이동</li>
          <li>"쿠폰 코드 입력" 란에 위 코드 입력 후 적용</li>
        </ol>
      </div>

      <div style="text-align:center;">
        <a href="https://classlog-ai.vercel.app"
           style="display:inline-block;background:linear-gradient(135deg,#3B82F6 0%,#6366F1 100%);color:#fff;font-size:15px;font-weight:900;text-decoration:none;padding:16px 44px;border-radius:14px;box-shadow:0 6px 20px rgba(99,102,241,0.35);">
          클래스로그 AI 바로가기 →
        </a>
      </div>
    </div>

    <div style="background:#EFF6FF;padding:18px 36px;text-align:center;border-top:1px solid #DBEAFE;">
      <p style="margin:0;color:#1E40AF;font-size:12px;font-weight:700;">감사합니다. AKLABS 드림 ✦</p>
      <p style="margin:6px 0 0;color:#93C5FD;font-size:11px;">문의: aklabs84@naver.com</p>
    </div>
  </div>
</body>
</html>`;
}
