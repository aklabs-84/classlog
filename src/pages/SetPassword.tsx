import { useState, useEffect, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Lock, Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, Gift } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SetPassword = () => {
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralMsg, setReferralMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setReferralCode(ref.toUpperCase());
  }, [searchParams]);

  useEffect(() => {
    // Supabase action_link 클릭 후 /set-password#access_token=xxx 로 도착
    // 또는 /set-password?code=xxx (PKCE) 로 도착
    // Supabase 클라이언트가 URL에서 자동으로 세션을 감지하고 SIGNED_IN 이벤트를 발생시킴

    // 이미 세션이 있으면 즉시 표시
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    // Supabase가 URL 토큰을 처리한 후 세션 생성 시 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSessionReady(true);
      }
    });

    // 3초 후에도 세션이 없고 토큰도 없으면 로그인으로
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const hasToken =
          window.location.hash.includes('access_token') ||
          new URLSearchParams(window.location.search).has('code');
        if (!session && !hasToken) {
          navigate('/login');
        }
      });
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // 추천인 코드 적용 (입력된 경우)
    if (referralCode.trim()) {
      const { data: refData } = await supabase.rpc('apply_referral_code', {
        p_code: referralCode.trim().toUpperCase(),
      });
      if (refData?.success) {
        setReferralMsg({ type: 'ok', text: `추천 코드 적용! 양쪽 모두 ${refData.bonus_days}일 베타가 지급됩니다.` });
      }
    }

    // 비밀번호 설정 후 세션 정리 — 로그인 페이지에서 직접 로그인하도록 유도
    await supabase.auth.signOut();
    navigate('/login?setup=done');
  };

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-bold text-on-surface-variant">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden selection:bg-primary/20 selection:text-primary">
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[100px] animate-pulse delay-700" />

      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-4 mb-8 md:mb-16 relative z-10"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-[1.5rem] flex items-center justify-center text-white shadow-elevated">
          <GraduationCap size={36} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tightest leading-none gradient-text">클래스로그 AI</h1>
          <p className="text-[10px] text-primary/40 font-black tracking-[0.15em] mt-1 ml-1">수업 기록부터 세특까지</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-[480px] layered-card shadow-elevated p-6 md:p-12 relative z-10 overflow-hidden bg-white/70"
      >
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={28} className="text-primary" />
          </div>
          <h2 className="text-3xl font-black mb-3 tracking-tightest">비밀번호 설정</h2>
          <p className="text-sm text-on-surface-variant/60 font-medium">
            클래스로그 AI에서 사용하실 비밀번호를 설정해주세요
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 p-4 bg-error/10 border-2 border-error/20 rounded-2xl text-error text-sm font-bold"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] ml-2">새 비밀번호</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/20 group-focus-within:text-primary transition-colors">
                <Lock size={20} strokeWidth={2.5} />
              </div>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="8자 이상"
                className="w-full pl-14 pr-14 py-5 bg-surface-container/50 rounded-2xl text-base font-bold focus:outline-none focus:ring-8 focus:ring-primary/5 focus:bg-white focus:border-primary/20 border-2 border-transparent transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute inset-y-0 right-5 flex items-center text-on-surface-variant/20 hover:text-primary transition-colors"
              >
                {showPw ? <EyeOff size={20} strokeWidth={2.5} /> : <Eye size={20} strokeWidth={2.5} />}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] ml-2">비밀번호 확인</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/20 group-focus-within:text-primary transition-colors">
                <Lock size={20} strokeWidth={2.5} />
              </div>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="비밀번호 재입력"
                className="w-full pl-14 pr-6 py-5 bg-surface-container/50 rounded-2xl text-base font-bold focus:outline-none focus:ring-8 focus:ring-primary/5 focus:bg-white focus:border-primary/20 border-2 border-transparent transition-all shadow-inner"
              />
            </div>
          </div>

          {/* 추천인 코드 (선택) */}
          <div className="space-y-3">
            <label className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] ml-2">
              추천인 코드 <span className="normal-case font-normal">(선택)</span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/20 group-focus-within:text-primary transition-colors">
                <Gift size={20} strokeWidth={2.5} />
              </div>
              <input
                type="text"
                value={referralCode}
                onChange={e => { setReferralCode(e.target.value.toUpperCase()); setReferralMsg(null); }}
                placeholder="SANGXXXXXX"
                className="w-full pl-14 pr-6 py-5 bg-surface-container/50 rounded-2xl text-base font-bold font-mono focus:outline-none focus:ring-8 focus:ring-primary/5 focus:bg-white focus:border-primary/20 border-2 border-transparent transition-all shadow-inner uppercase"
              />
            </div>
            {referralMsg && (
              <p className={`text-xs font-bold px-3 py-2 rounded-xl ${
                referralMsg.type === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
              }`}>
                {referralMsg.text}
              </p>
            )}
            <p className="text-[11px] text-on-surface-variant/40 ml-2">
              추천인과 본인 모두 7일 Pro 체험 베타가 지급됩니다
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-vibrant py-5 rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 shadow-elevated active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 mt-4"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} strokeWidth={3} />
            ) : (
              <>
                <span>설정 완료 — 시작하기</span>
                <ArrowRight size={22} strokeWidth={3} />
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default SetPassword;
