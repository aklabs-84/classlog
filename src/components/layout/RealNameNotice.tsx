import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { isNewSignup, validateNickname, validateRealName } from '../../lib/displayName';

/** 새 가입자: 실명 확인 전에는 앱을 못 쓰는 "가입 마무리" 창 / 기존 가입자: 안내 띠 */
export default function RealNameNotice() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [realName, setRealName] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!user || !profile || profile.real_name_confirmed) return null;

  const save = async (name: string, nick: string) => {
    const e = validateRealName(name) || validateNickname(nick);
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.from('profiles')
      .update({ full_name: name.trim(), nickname: nick.trim() || null, real_name_confirmed: true, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) { setBusy(false); setErr('저장하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    await refreshProfile();
    setBusy(false);
  };

  if (isNewSignup(profile)) {
    const rn = realName ?? profile.full_name ?? '';
    const nn = nickname ?? profile.nickname ?? '';
    return createPortal(
      <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-surface w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl">
          <h2 className="font-black text-xl flex items-center gap-2"><BadgeCheck size={22} className="text-primary" /> 가입을 마무리해 주세요</h2>
          <p className="text-sm text-on-surface-variant">강사 서류나 계약서에는 실명이 필요해요. 앱 안에서는 별명으로 보이게 할 수 있어요.</p>
          <div>
            <label className="text-sm font-black block mb-1">실명 <span className="text-red-500">*</span></label>
            <input value={rn} onChange={e => setRealName(e.target.value)} maxLength={30} placeholder="예: 홍길동"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-sm bg-surface-container-lowest" />
            <p className="text-[11px] text-on-surface-variant mt-1">구글에 적힌 이름이 들어 있어요. 실명이 맞는지 꼭 확인해 주세요.</p>
          </div>
          <div>
            <label className="text-sm font-black block mb-1">별명 (선택)</label>
            <input value={nn} onChange={e => setNickname(e.target.value)} maxLength={20} placeholder="비워 두면 실명이 보여요"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-sm bg-surface-container-lowest" />
            <p className="text-[11px] text-on-surface-variant mt-1">왼쪽 메뉴와 커뮤니티에서 이 이름으로 보여요. 나중에 설정에서 바꿀 수 있어요.</p>
          </div>
          {err && <p className="text-xs font-bold text-red-600">{err}</p>}
          <button disabled={busy} onClick={() => save(rn, nn)}
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
            {busy && <Loader2 size={15} className="animate-spin" />} 시작하기
          </button>
          <button onClick={() => signOut()} className="w-full text-xs text-on-surface-variant hover:underline">로그아웃</button>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div className="mx-4 md:mx-8 mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold text-amber-900 min-w-0">
        <BadgeCheck size={16} className="inline -mt-0.5 mr-1.5" />
        '{profile.full_name || '이름 없음'}'이(가) 실명이 맞나요? 강사 서류·계약서에는 실명이 필요해요.
        {err && <span className="text-red-600 ml-2">{err}</span>}
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button disabled={busy} onClick={() => save(profile.full_name || '', profile.nickname || '')}
          className="text-xs font-black bg-amber-500 text-white hover:bg-amber-600 px-3 py-1.5 rounded-lg disabled:opacity-40 inline-flex items-center gap-1">
          {busy && <Loader2 size={12} className="animate-spin" />} 이 이름이 실명이에요
        </button>
        <button onClick={() => navigate('/settings#profile')}
          className="text-xs font-black text-amber-900 border border-amber-400 hover:bg-amber-100 px-3 py-1.5 rounded-lg">
          설정에서 고치기
        </button>
      </div>
    </div>
  );
}
