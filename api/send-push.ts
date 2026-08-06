import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookSecret = process.env.PUSH_WEBHOOK_SECRET;
  const authHeader = req.headers.authorization ?? '';
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return res.status(500).json({ error: 'Server config error' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Supabase Database Webhook 표준 payload: { type, table, record, old_record }
  const record = req.body?.record;
  const userId = record?.user_id;
  if (!userId) return res.status(400).json({ error: 'Missing user_id' });

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  if (!subscriptions || subscriptions.length === 0) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({
    title: record.title || '클래스로그AI',
    body: record.content || '',
    url: record.link || '/',
    tag: record.id,
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err: any) {
        // 만료/무효 구독은 정리
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    })
  );

  return res.status(200).json({ sent });
}
