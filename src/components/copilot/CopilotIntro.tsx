import { useNavigate } from 'react-router-dom';
import { Bot, Lock, Sparkles } from 'lucide-react';

const FEATURES = [
  '말로 시키면 수업 계획서·자료·세특 초안을 바로 만들어 줘요',
  '클래스 기록을 보면서 학생 분석과 피드백을 도와줘요',
  '필요한 도구 화면으로 바로 연결해 줘요',
];

// 무료 회원에게 보여주는 AI 코파일럿 소개 화면 (대화창은 유료 회원만 열린다).
export default function CopilotIntro() {
  const navigate = useNavigate();
  return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center space-y-6">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center text-primary">
        <Bot size={30} />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-on-surface flex items-center justify-center gap-2">
          AI 코파일럿 <span className="inline-flex items-center gap-1 text-[11px] font-black bg-amber-50 text-amber-700 rounded-full px-2 py-0.5"><Lock size={11} /> 유료 회원 전용</span>
        </h1>
        <p className="text-sm font-bold text-on-surface-variant">대화만으로 수업 준비를 끝내는 AI 도우미예요.</p>
      </div>
      <ul className="text-left space-y-2.5 bg-surface-container/50 rounded-2xl p-5">
        {FEATURES.map(f => (
          <li key={f} className="flex items-start gap-2 text-sm font-bold text-on-surface">
            <Sparkles size={14} className="text-primary mt-0.5 shrink-0" /> {f}
          </li>
        ))}
      </ul>
      <button
        onClick={() => navigate('/pricing')}
        className="px-6 py-3 btn-gradient rounded-xl font-black text-sm shadow-lg shadow-primary/20"
      >
        요금제 보고 시작하기
      </button>
      <p className="text-xs font-bold text-on-surface-variant/70">무료 플랜에서도 각 도구(클래스룸·아이디어 기록·자료 에디터 등)의 AI 기능은 그대로 쓸 수 있어요.</p>
    </div>
  );
}
