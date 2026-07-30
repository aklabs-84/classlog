import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  GraduationCap,
  ArrowRight, Copy,
  Check, Loader2, Play, Trophy, Eye, Share2, BookOpen,
  ChevronRight, Users, Heart,
  PlayCircle, ExternalLink,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { setDemoClassId } from '../lib/demo';

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// 체험 흐름: 인트로 → (실제 계정으로 자동 로그인) → 실제 Classroom/Export 화면 그대로 사용
// → 화면 상단 DemoModeBanner의 "체험 종료"를 누르면 여기로 돌아와 완료 화면을 본다.

interface FinishedState {
  finished: true;
  classId: string;
}

const Demo = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState('');

  const finishedState = location.state as FinishedState | null;

  const handleStart = async () => {
    setProvisioning(true);
    setProvisionError('');
    try {
      const res = await fetch('/api/demo-provision', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '데모 학급 생성에 실패했습니다.');

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.login_token_hash,
        type: 'magiclink',
      });
      if (otpError) throw new Error('데모 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');

      setDemoClassId(data.class_id);
      navigate(`/classroom?id=${data.class_id}`);
    } catch (err: any) {
      setProvisionError(err.message || '잠시 후 다시 시도해주세요.');
    } finally {
      setProvisioning(false);
    }
  };

  if (finishedState?.finished && finishedState.classId) {
    return <DemoFinished navigate={navigate} classId={finishedState.classId} />;
  }

  return (
    <div className="min-h-screen bg-surface font-pretendard">
      <DemoIntro onNext={handleStart} loading={provisioning} error={provisionError} />
    </div>
  );
};

// ─── 인트로 ────────────────────────────────────────────────────────────────────

const DemoIntro = ({
  onNext, loading, error,
}: {
  onNext: () => void;
  loading: boolean;
  error: string;
}) => (
  <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-violet-200 rotate-3">
        <GraduationCap size={40} className="text-white" />
      </div>
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 text-xs font-black rounded-full mb-5">
        <Heart size={11} fill="currentColor" /> 클래스로그 AI 인터랙티브 데모
      </span>
      <h1 className="text-3xl md:text-4xl font-black text-on-surface mb-4 tracking-tight leading-tight">
        클릭 한 번으로<br />
        <span className="text-primary">실제 화면을 그대로 체험하세요</span>
      </h1>
      <p className="text-on-surface-variant text-sm leading-relaxed max-w-sm mx-auto mb-10">
        로그인 없이 바로 실제 선생님 계정으로 입장해<br />
        학급 대시보드, 활동기록 승인, 결과물 평가, <strong>AI 세특 생성</strong>까지<br />
        실제 화면 그대로 직접 눌러보세요.
      </p>

      {/* 체험 가능 항목 미리보기 */}
      <div className="flex flex-wrap justify-center gap-2 mb-10 max-w-md mx-auto">
        {[
          '학급 대시보드', '활동기록 승인·반려', '결과물 평가', '학생 화면 체험', 'AI 세특 자동 생성',
        ].map((s, i) => (
          <span key={s} className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full text-[11px] font-bold text-on-surface-variant">
            <span className="text-primary font-black">{i + 1}</span> {s}
          </span>
        ))}
      </div>

      <button
        onClick={onNext}
        disabled={loading}
        className="px-8 py-4 bg-primary hover:bg-primary-dim disabled:opacity-60 text-white font-black rounded-2xl text-base transition-all shadow-lg shadow-primary/20 hover:scale-105 flex items-center gap-2 mx-auto"
      >
        {loading
          ? <><Loader2 size={18} className="animate-spin" /> 데모 학급 준비 중...</>
          : <><Play size={18} strokeWidth={3} /> 체험 시작하기</>
        }
      </button>
      {error && <p className="mt-3 text-xs text-red-500 font-bold">{error}</p>}
      <p className="mt-4 text-xs text-on-surface-variant/60">로그인·회원가입 없이 바로 체험 가능합니다</p>
    </motion.div>
  </div>
);

// ─── 체험 종료 후 완료 화면 ───────────────────────────────────────────────────

const DemoFinished = ({ navigate, classId }: { navigate: ReturnType<typeof useNavigate>; classId: string }) => {
  const [copied, setCopied] = useState(false);
  const demoShareUrl = `${window.location.origin}/share/${classId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(demoShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-surface font-pretendard">
      <div className="max-w-2xl mx-auto px-4 pb-16 pt-16">
        {/* 완료 배지 */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black mb-4">
            <Trophy size={14} className="text-amber-500" />
            체험을 종료했습니다
          </div>
          <h2 className="text-2xl font-black text-on-surface mb-2">공유 URL로 전달</h2>
          <p className="text-on-surface-variant text-sm">담당 선생님께 URL 하나로 전체 학생 기록을 공유할 수 있어요</p>
        </motion.div>

        {/* URL 카드 */}
        <div className="bg-surface-container-lowest rounded-2xl border border-surface-container-high overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-surface-container bg-violet-50">
            <p className="text-xs font-black text-violet-800">📎 공유 링크 예시 (2시간 후 만료)</p>
          </div>
          <div className="p-4">
            <div className="flex gap-2 mb-3">
              <div className="flex-1 bg-surface-container rounded-xl px-3 py-2.5 text-xs font-mono text-on-surface-variant truncate">
                {demoShareUrl}
              </div>
              <button
                onClick={handleCopy}
                className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-primary text-white hover:bg-primary-dim'}`}
              >
                {copied ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}
              </button>
            </div>
            <a
              href={demoShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 flex items-center justify-center gap-1.5 w-full py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 font-bold rounded-xl text-[11px] transition-all"
            >
              <ExternalLink size={12} />
              실제 공유 화면 열어보기
            </a>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-on-surface-variant">
              {[
                { icon: Eye, label: '열람: 링크만 있으면 OK' },
                { icon: Users, label: '로그인 불필요' },
                { icon: BookOpen, label: '학생 기록 전체 열람' },
                { icon: Share2, label: '카카오·이메일 공유' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Icon size={11} className="text-primary" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/#request-section')}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black rounded-2xl text-base transition-all shadow-lg shadow-amber-200 hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <Heart size={18} fill="currentColor" />
            무료로 사용 신청하기
            <ArrowRight size={18} strokeWidth={3} />
          </button>

          <button
            onClick={() => navigate('/video-guide')}
            className="w-full py-3.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 font-black rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <PlayCircle size={18} className="text-violet-500" />
            영상으로 더 자세히 알아보기
            <ChevronRight size={15} strokeWidth={2.5} />
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 border border-surface-container-high text-on-surface-variant hover:bg-surface-container font-bold rounded-2xl text-sm transition-all"
          >
            랜딩 페이지로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};

export default Demo;
