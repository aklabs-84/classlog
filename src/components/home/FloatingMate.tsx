import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import PixelMate, { deriveMate, type MascotKey } from './PixelMate';

// 글을 쓰거나 꾸미는 화면은 빼고, 안내성 화면에서만 보여 준다
const SHOW_ON = ['/ideas', '/classes', '/archive', '/activity-log', '/settings', '/community', '/help', '/pricing', '/export', '/suggestions'];

const HIDE_KEY = 'mate-corner-hidden';
export const readCornerOn = () => { try { return localStorage.getItem(HIDE_KEY) !== '1'; } catch { return true; } };
export const writeCornerOn = (on: boolean) => { try { if (on) localStorage.removeItem(HIDE_KEY); else localStorage.setItem(HIDE_KEY, '1'); } catch { /* 저장 불가 환경은 무시 */ } };

export default function FloatingMate({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [mascot, setMascot] = useState<MascotKey>('robot');
  const [awayDays, setAwayDays] = useState(0);
  const [weekCount, setWeekCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(!readCornerOn());

  // 시작 화면에서 스위치를 바꾸고 돌아오면 다시 읽는다
  useEffect(() => { setDismissed(!readCornerOn()); }, [pathname]);

  const visible = SHOW_ON.some(p => pathname === p || pathname.startsWith(p + '/'));

  useEffect(() => {
    if (!user || !visible || weekCount !== null) return;
    (async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const [prefs, mats, decks, notes] = await Promise.all([
        supabase.from('teacher_home_prefs').select('mascot, last_seen').eq('user_id', user.id).maybeSingle(),
        supabase.from('class_materials').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id).gte('updated_at', since),
        supabase.from('slide_decks').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id).gte('updated_at', since),
        supabase.from('teacher_notes').select('id', { count: 'exact', head: true }).eq('teacher_id', user.id).gte('created_at', since),
      ]);
      const d = prefs.data;
      if (d?.mascot === 'sprout' || d?.mascot === 'cat' || d?.mascot === 'robot') setMascot(d.mascot);
      if (d?.last_seen) setAwayDays(Math.floor((Date.now() - +new Date(d.last_seen)) / 86400000));
      setWeekCount((mats.count ?? 0) + (decks.count ?? 0) + (notes.count ?? 0));
    })();
  }, [user?.id, visible]);

  if (!user || !visible || dismissed || weekCount === null) return null;

  const pick = (m: MascotKey) => {
    setMascot(m);
    void supabase.from('teacher_home_prefs').upsert({ user_id: user.id, mascot: m, updated_at: new Date().toISOString() });
  };
  const { state, reason } = deriveMate(weekCount, awayDays);

  // 휴대폰에서는 아래쪽 버튼과 겹치기 쉬워 숨김
  return createPortal(
    <div className={`hidden lg:block fixed bottom-4 z-[9980] transition-[left] duration-300 ${collapsed ? 'left-[124px]' : 'left-[304px]'}`}>
      <PixelMate mascot={mascot} state={state} reason={reason} onPick={pick} placement="corner" onDismiss={() => { writeCornerOn(false); setDismissed(true); }} />
    </div>,
    document.body,
  );
}
