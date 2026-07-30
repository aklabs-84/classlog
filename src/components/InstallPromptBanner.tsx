import { useState } from 'react';
import { X, Download, Share, MoreVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function InstallPromptBanner() {
  const { installState, triggerInstall, dismiss } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (installState === 'idle' || installState === 'installed' || installState === 'dismissed') {
    return null;
  }

  return (
    <>
      {/* Android / PC Chrome: 하단 배너 */}
      <AnimatePresence>
        {installState === 'available' && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9990] w-[min(360px,calc(100vw-2rem))]"
          >
            <div className="glass border border-white/60 rounded-2xl shadow-elevated p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                <Download size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-on-surface leading-tight">클래스로그 앱 설치</p>
                <p className="text-[11px] text-on-surface-variant/60 font-medium mt-0.5">홈 화면에 추가하면 더 빠르게 열려요</p>
              </div>
              <button
                onClick={triggerInstall}
                className="px-3 py-2 btn-gradient rounded-xl text-xs font-black shrink-0 shadow-md shadow-primary/20"
              >
                설치
              </button>
              <button
                onClick={() => dismiss(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant/40 hover:text-on-surface hover:bg-white/60 transition-all shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Safari: 하단 배너 → 탭하면 안내 팝업 */}
      <AnimatePresence>
        {installState === 'ios' && !showIOSGuide && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9990] w-[min(360px,calc(100vw-2rem))]"
          >
            <div className="glass border border-white/60 rounded-2xl shadow-elevated p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
                <Download size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-on-surface leading-tight">클래스로그 앱 설치</p>
                <p className="text-[11px] text-on-surface-variant/60 font-medium mt-0.5">홈 화면에 추가해 앱처럼 사용해 보세요</p>
              </div>
              <button
                onClick={() => setShowIOSGuide(true)}
                className="px-3 py-2 btn-gradient rounded-xl text-xs font-black shrink-0 shadow-md shadow-primary/20"
              >
                방법 보기
              </button>
              <button
                onClick={() => dismiss(true)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant/40 hover:text-on-surface hover:bg-white/60 transition-all shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS 설치 안내 모달 */}
      <AnimatePresence>
        {installState === 'ios' && showIOSGuide && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9991] bg-black/50 backdrop-blur-sm"
              onClick={() => setShowIOSGuide(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-[9992] bg-white rounded-t-3xl shadow-elevated p-6 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-black text-on-surface">클래스로그 앱 설치 방법</h3>
                <button
                  onClick={() => { setShowIOSGuide(false); dismiss(false); }}
                  className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <Share size={16} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-on-surface">1단계</p>
                    <p className="text-sm text-on-surface-variant/70 mt-0.5 leading-relaxed">
                      하단 툴바의 <span className="font-black text-blue-500">공유 버튼</span>을 탭하세요
                      <br />
                      <span className="text-[11px] text-on-surface-variant/50">(사각형에 위쪽 화살표 모양)</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <MoreVertical size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-on-surface">2단계</p>
                    <p className="text-sm text-on-surface-variant/70 mt-0.5 leading-relaxed">
                      스크롤해서 <span className="font-black text-primary">"홈 화면에 추가"</span>를 탭하세요
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-green-500 text-base font-black">✓</span>
                  </div>
                  <div>
                    <p className="text-sm font-black text-on-surface">3단계</p>
                    <p className="text-sm text-on-surface-variant/70 mt-0.5 leading-relaxed">
                      오른쪽 위 <span className="font-black text-green-600">"추가"</span>를 탭하면 완료!
                      <br />
                      <span className="text-[11px] text-on-surface-variant/50">홈 화면에 클래스로그 아이콘이 생깁니다</span>
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => { setShowIOSGuide(false); dismiss(true); }}
                className="mt-6 w-full py-3.5 btn-gradient rounded-2xl font-black text-sm shadow-md shadow-primary/20"
              >
                알겠어요!
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
