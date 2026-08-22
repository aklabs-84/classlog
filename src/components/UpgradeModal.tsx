import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, GraduationCap, Zap, Crown } from 'lucide-react';

type Reason = 'class_limit' | 'ai_limit' | 'ai_free_block' | 'ai_bulk' | 'teacher_invite' | 'naiss_export';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: Reason;
  currentPlan?: string;
}

const REASON_CONFIG: Record<Reason, {
  emoji: string;
  title: string;
  desc: string;
  freeLimit: string;
  proGain: string;
}> = {
  class_limit: {
    emoji: '🏫',
    title: '클래스 생성 한도 초과',
    desc: '현재 플랜의 클래스 생성 한도에 도달했습니다.\n무료: 1개 · Basic: 5개 · Pro: 10개',
    freeLimit: '무료 1개 / Basic 5개',
    proGain: '클래스 최대 10개 생성',
  },
  ai_limit: {
    emoji: '✨',
    title: 'AI 사용 한도 초과',
    desc: '이번 달 무료 체험 한도에 도달했습니다.\nBasic·Pro는 넉넉한 사용량으로 계속 이용할 수 있어요.\n다음 달 1일에 자동으로 초기화됩니다.',
    freeLimit: '무료 월 20회',
    proGain: 'AI 넉넉하게 사용',
  },
  ai_free_block: {
    emoji: '✨',
    title: 'AI 사용 한도 초과',
    desc: '이번 달 무료 체험 한도에 도달했습니다.\nBasic·Pro는 넉넉한 사용량으로 계속 이용할 수 있어요.\n다음 달 1일에 자동으로 초기화됩니다.',
    freeLimit: '무료 월 20회',
    proGain: 'AI 넉넉하게 사용',
  },
  ai_bulk: {
    emoji: '⚡',
    title: 'Pro 기능',
    desc: '학급 전체 세특을 한 번에 생성하는 일괄 생성은 Pro 플랜 전용 기능입니다.',
    freeLimit: '개별 AI 생성만 가능',
    proGain: '학급 전체 일괄 생성',
  },
  teacher_invite: {
    emoji: '🔗',
    title: 'Pro 기능',
    desc: '교과 선생님을 담임반에 초대하는 연동 기능은 Pro 플랜 전용입니다.',
    freeLimit: '교사 연동 불가',
    proGain: '교사 연동 무제한',
  },
  naiss_export: {
    emoji: '📤',
    title: 'Pro 기능 — NAISS 내보내기',
    desc: 'NAISS 워크스테이션 및 나이스 포맷 내보내기는 Pro 플랜 전용 기능입니다.',
    freeLimit: '기본 CSV 내보내기만 가능',
    proGain: 'NAISS 포맷 내보내기',
  },
};

const UpgradeModal = ({ isOpen, onClose, reason, currentPlan: _currentPlan }: UpgradeModalProps) => {
  const config = REASON_CONFIG[reason];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 px-6 pt-8 pb-10 text-white text-center relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
              <div className="text-4xl mb-3">{config.emoji}</div>
              <h2 className="text-xl font-black mb-1">{config.title}</h2>
              <p className="text-sm text-white/80 whitespace-pre-line">{config.desc}</p>
            </div>

            {/* Plan Compare */}
            <div className="px-6 -mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <GraduationCap size={14} className="text-gray-400" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Free</span>
                  </div>
                  <p className="text-sm font-bold text-gray-700">{config.freeLimit}</p>
                </div>
                <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 text-center relative">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    PRO
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <Crown size={14} className="text-amber-500" />
                    <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Pro</span>
                  </div>
                  <p className="text-sm font-black text-amber-800">{config.proGain}</p>
                </div>
              </div>
            </div>

            {/* Pro 기능 목록 */}
            <div className="px-6 py-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Pro 플랜에서 가능한 것들</p>
              <div className="space-y-2">
                {[
                  '클래스 무제한 생성',
                  'AI 넉넉하게 사용',
                  '학급 전체 일괄 AI 생성',
                  '교과 교사 연동 초대',
                  'NAISS 포맷 내보내기',
                  '학교 프로젝트 생성',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
                    <Sparkles size={13} className="text-amber-400 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 pb-6 space-y-2">
              <a
                href="mailto:aklabs84@naver.com?subject=클래스로그 AI Pro 업그레이드 문의"
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:shadow-amber-200 transition-all hover:scale-[1.02] active:scale-95"
              >
                <Zap size={16} />
                Pro 업그레이드 문의하기
              </a>
              <button
                onClick={onClose}
                className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
              >
                나중에 하기
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UpgradeModal;
