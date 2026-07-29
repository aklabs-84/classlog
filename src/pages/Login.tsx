import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, Mail, Lock, Eye, EyeOff, ArrowRight, MousePointer2, Loader2, CheckCircle2, KeyRound, Gift } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const setupDone = searchParams.get('setup') === 'done';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  // ?ref= 파라미터로 들어온 경우 입력창에 자동으로 채워주고 펼쳐서 보여줌
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralCode(ref.toUpperCase());
      setShowReferralInput(true);
    }
  }, [searchParams]);

  // 비밀번호 재설정
  const [showForgot, setShowForgot]     = useState(false);
  const [forgotEmail, setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotDone, setForgotDone]     = useState(false);
  const [forgotError, setForgotError]   = useState<string | null>(null);

  const navigate = useNavigate();

  const handleForgot = async () => {
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    setForgotError(null);
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (!res.ok) throw new Error('요청 실패');
      setForgotDone(true);
    } catch {
      setForgotError('요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setGoogleLoading(true);
    // 리다이렉트 후에는 URL의 ?ref= 값이 사라지므로, 로그인 완료 후 자동 적용될 수 있도록 미리 저장
    // (입력창에 직접 넣은 코드를 우선하고, 없으면 URL 파라미터를 그대로 사용)
    const refCode = referralCode.trim() || searchParams.get('ref');
    if (refCode) localStorage.setItem('pending_referral_code', refCode.toUpperCase());
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) {
      setError(oauthError.message || '구글 로그인 중 오류가 발생했습니다.');
      setGoogleLoading(false);
    }
    // 성공 시 구글 인증 화면으로 리다이렉트되므로 별도 처리 불필요
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden selection:bg-primary/20 selection:text-primary">
      <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[100px] animate-pulse delay-700" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-accent/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-4 mb-8 md:mb-16 relative z-10"
      >
        <div
          onClick={() => navigate('/')}
          className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-[1.5rem] flex items-center justify-center text-white shadow-elevated cursor-pointer hover:rotate-12 transition-transform duration-500"
        >
          <GraduationCap size={36} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tightest leading-none gradient-text">생기로그 AI</h1>
          <p className="text-[10px] text-primary/40 font-black tracking-[0.15em] mt-1 ml-1">수업 기록부터 세특까지</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-[480px] layered-card shadow-elevated p-6 md:p-12 relative z-10 overflow-hidden bg-white/70"
      >
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />

        <div className="text-center mb-10">
          <h2 className="text-3xl font-black mb-3 tracking-tightest">
            {setupDone ? '반갑습니다, 선생님!' : '다시 오셨군요!'}
          </h2>
          <p className="text-[10px] text-on-surface-variant/40 uppercase tracking-[0.25em] font-black">
            {setupDone ? 'Welcome to SAENGGI LOG AI' : 'Educator Authentication'}
          </p>
        </div>

        {setupDone && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 p-5 bg-emerald-50 border-2 border-emerald-100 rounded-2xl text-emerald-700 text-[13px] font-black tracking-tight flex items-center gap-3"
          >
            <CheckCircle2 size={18} className="shrink-0" />
            비밀번호 설정 완료! 이메일과 비밀번호로 로그인해주세요.
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 p-5 bg-error/10 border-2 border-error/20 rounded-2xl text-error text-[13px] font-black tracking-tight flex items-center gap-3"
          >
            <div className="w-2 h-2 bg-error rounded-full animate-pulse" />
            {error}
          </motion.div>
        )}

        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={googleLoading}
          className="w-full py-5 rounded-2xl bg-white hover:bg-surface-container/60 border-2 border-on-surface/10 text-on-surface font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50 shadow-soft mb-6"
        >
          {googleLoading ? (
            <Loader2 className="animate-spin" size={22} strokeWidth={3} />
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
              </svg>
              <span>Google로 계속하기</span>
            </>
          )}
        </button>

        <div className="text-center -mt-2 mb-6">
          <button
            type="button"
            onClick={() => setShowReferralInput(v => !v)}
            className="text-[11px] font-bold text-on-surface-variant/40 hover:text-primary transition-colors"
          >
            추천인 코드가 있으신가요?
          </button>
        </div>

        <AnimatePresence>
          {showReferralInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mb-6"
            >
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/20 group-focus-within:text-primary transition-colors">
                  <Gift size={18} strokeWidth={2.5} />
                </div>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="SANGXXXXXX"
                  className="w-full pl-14 pr-6 py-4 bg-surface-container/50 rounded-2xl text-sm font-bold font-mono uppercase focus:outline-none focus:ring-8 focus:ring-primary/5 focus:bg-white focus:border-primary/20 border-2 border-transparent transition-all shadow-inner"
                />
              </div>
              <p className="text-[11px] text-on-surface-variant/40 ml-2 mt-2">
                추천인과 본인 모두 7일 체험이 추가로 지급돼요 (구글 가입 시 적용)
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-on-surface/10" />
          <span className="text-[11px] font-black text-on-surface-variant/30 uppercase tracking-[0.2em]">또는 이메일로</span>
          <div className="flex-1 h-px bg-on-surface/10" />
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-3">
            <label className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] ml-2">이메일 계정</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/20 group-focus-within:text-primary transition-colors">
                <Mail size={20} strokeWidth={2.5} />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu"
                className="w-full pl-14 pr-6 py-5 bg-surface-container/50 rounded-2xl text-base font-bold focus:outline-none focus:ring-8 focus:ring-primary/5 focus:bg-white focus:border-primary/20 border-2 border-transparent transition-all shadow-inner"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em] ml-2">비밀번호</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/20 group-focus-within:text-primary transition-colors">
                <Lock size={20} strokeWidth={2.5} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-14 pr-14 py-5 bg-surface-container/50 rounded-2xl text-base font-bold focus:outline-none focus:ring-8 focus:ring-primary/5 focus:bg-white focus:border-primary/20 border-2 border-transparent transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-5 flex items-center text-on-surface-variant/20 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={20} strokeWidth={2.5} /> : <Eye size={20} strokeWidth={2.5} />}
              </button>
            </div>
          </div>

          {/* 비밀번호 찾기 버튼 */}
          <div className="text-right -mt-2">
            <button
              type="button"
              onClick={() => { setShowForgot(v => !v); setForgotDone(false); setForgotError(null); }}
              className="text-[11px] font-bold text-on-surface-variant/40 hover:text-primary transition-colors"
            >
              비밀번호를 잊으셨나요?
            </button>
          </div>

          {/* 비밀번호 재설정 인라인 섹션 */}
          <AnimatePresence>
            {showForgot && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound size={15} className="text-amber-600 shrink-0" />
                    <p className="text-xs font-black text-amber-800">비밀번호 재설정 링크를 이메일로 발송합니다</p>
                  </div>

                  {forgotDone ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl"
                    >
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      <p className="text-xs font-bold text-emerald-700">
                        이메일을 발송했습니다. 받은 편지함을 확인해주세요.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-amber-400">
                          <Mail size={15} />
                        </div>
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={e => setForgotEmail(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleForgot(); }}
                          placeholder="가입한 이메일 주소"
                          className="w-full pl-10 pr-3 py-3 bg-white border border-amber-200 rounded-xl text-sm font-medium outline-none focus:border-amber-400 transition-colors"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleForgot}
                        disabled={forgotLoading}
                        className="px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        {forgotLoading ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                        발송
                      </button>
                    </div>
                  )}

                  {forgotError && (
                    <p className="text-xs font-bold text-red-500">{forgotError}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-vibrant py-5 rounded-[2rem] font-black text-lg flex items-center justify-center gap-4 shadow-elevated active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 mt-4"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} strokeWidth={3} />
            ) : (
              <>
                <span>대시보드 입장</span>
                <ArrowRight size={22} strokeWidth={3} />
              </>
            )}
          </button>

          <p className="text-center text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.2em]">
            계정이 없으신가요?{' '}
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-primary hover:underline"
            >
              사용 신청하기
            </button>
          </p>
        </form>

        <div className="mt-10 pt-10 border-t border-on-surface/5 text-center">
          <p className="text-[11px] font-black text-on-surface-variant/30 uppercase tracking-[0.3em] mb-6">학생인가요? 코드를 입력하세요</p>
          <button
            onClick={() => navigate('/classroom-entry')}
            className="w-full py-5 rounded-2xl glass hover:bg-white text-primary font-black text-sm flex items-center justify-center gap-3 active:scale-95 transition-all border border-white/60 shadow-soft"
          >
            <MousePointer2 size={18} strokeWidth={3} />
            입장 코드로 간편 입장
          </button>
        </div>
      </motion.div>

      <div className="mt-12 flex gap-8 relative z-10">
        <div className="flex items-center gap-8 text-[11px] font-black text-on-surface-variant/30 uppercase tracking-[0.2em]">
          <span>© 2026 SAENGGI LOG AI</span>
          <span className="w-1 h-1 bg-on-surface-variant/20 rounded-full" />
          <span>System v2.5V</span>
        </div>
      </div>

    </div>
  );
};

export default Login;
