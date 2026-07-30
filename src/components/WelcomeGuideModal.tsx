import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { parseVideoUrl } from '../lib/gallery';

export interface WelcomeGuideVideo {
  id: string;
  title: string;
  description: string | null;
  url: string;
}

interface Props {
  isOpen: boolean;
  videos: WelcomeGuideVideo[];
  onClose: () => void;
}

export default function WelcomeGuideModal({ isOpen, videos, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const video = videos[idx];
  const isLast = idx === videos.length - 1;
  const info = video ? parseVideoUrl(video.url) : null;

  const handleClose = () => {
    setIdx(0);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && video && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-amber-400 to-orange-500 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={20} />
                <div>
                  <p className="font-black text-base leading-tight">클래스로그 AI 시작 가이드</p>
                  <p className="text-xs text-white/80 mt-0.5">{idx + 1} / {videos.length}</p>
                </div>
              </div>
              <button onClick={handleClose} className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="aspect-video bg-black rounded-2xl overflow-hidden">
                {info?.platform === 'direct' ? (
                  <video src={info.embedUrl} controls className="w-full h-full" />
                ) : info ? (
                  <iframe
                    key={video.id}
                    src={info.embedUrl}
                    className="w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                ) : null}
              </div>

              <div>
                <p className="font-bold text-sm text-on-surface">{video.title}</p>
                {video.description && (
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{video.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button onClick={handleClose} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                  건너뛰기
                </button>
                <div className="flex items-center gap-2">
                  {idx > 0 && (
                    <button
                      onClick={() => setIdx(i => i - 1)}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all"
                    >
                      <ChevronLeft size={16} className="text-slate-600" />
                    </button>
                  )}
                  <button
                    onClick={() => (isLast ? handleClose() : setIdx(i => i + 1))}
                    className="px-5 h-9 rounded-xl btn-gradient text-sm font-black flex items-center gap-1.5 shadow-md shadow-primary/20"
                  >
                    {isLast ? '시작하기!' : '다음'}
                    {!isLast && <ChevronRight size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
