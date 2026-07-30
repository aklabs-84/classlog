import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlayCircle, X, ChevronLeft, ChevronRight, Loader2,
  Video, HardDrive, ExternalLink, BookOpen, GraduationCap,
  LayoutDashboard, LogIn,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { parseVideoUrl } from '../lib/gallery';
import { useAuth, isAnonymousUser } from '../lib/auth';

export interface VideoGuideItem {
  id: string;
  title: string;
  description: string | null;
  url: string;
  category: string;
  order_num: number;
  is_active: boolean;
  created_at: string;
}

const ALL_LABEL = '전체';

export default function VideoGuide() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user && !isAnonymousUser(user);

  const [items, setItems] = useState<VideoGuideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_LABEL);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('video_guides')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('order_num')
      .then(({ data }) => {
        setItems(data ?? []);
        setLoading(false);
      });
  }, []);

  const categories = [ALL_LABEL, ...Array.from(new Set(items.map(i => i.category)))];
  const filtered = activeCategory === ALL_LABEL
    ? [...items].sort((a, b) => a.order_num - b.order_num)
    : items.filter(i => i.category === activeCategory);
  const lightboxItem = lightboxIndex !== null ? filtered[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-[#FFFBF5] font-pretendard">
      {/* 상단 네비게이션 */}
      <nav className="sticky top-0 z-50 bg-[#FFFBF5]/90 backdrop-blur border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-sm">
              <GraduationCap size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-base font-black tracking-tight text-amber-800">클래스로그 AI</span>
          </button>

          {isLoggedIn ? (
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-full transition-colors shadow-sm"
            >
              <LayoutDashboard size={14} />
              대시보드
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-full transition-colors shadow-sm"
            >
              <LogIn size={14} />
              선생님 로그인
            </button>
          )}
        </div>
      </nav>

      {/* 본문 */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* 헤더 */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-md mb-4">
            <PlayCircle size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-amber-900 tracking-tight">영상 가이드</h1>
          <p className="text-sm text-amber-700/70 mt-1.5">
            클래스로그 AI 사용 방법을 영상으로 확인하세요
          </p>
        </div>

        {/* 카테고리 탭 */}
        {!loading && items.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap justify-center">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  activeCategory === cat
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* 콘텐츠 */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={32} className="animate-spin text-amber-400" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((item, idx) => (
              <VideoCard
                key={item.id}
                item={item}
                onClick={() => setLightboxIndex(idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      <AnimatePresence>
        {lightboxItem !== null && lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={() => setLightboxIndex(null)}
          >
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
              onClick={() => setLightboxIndex(null)}
            >
              <X size={28} />
            </button>

            {lightboxIndex > 0 && (
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              >
                <ChevronLeft size={40} />
              </button>
            )}
            {lightboxIndex < filtered.length - 1 && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                onClick={e => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              >
                <ChevronRight size={40} />
              </button>
            )}

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="max-w-[90vw] flex flex-col items-center gap-4"
              onClick={e => e.stopPropagation()}
            >
              <VideoPlayer url={lightboxItem.url} />
              <div className="text-center">
                <p className="text-white font-bold text-base">{lightboxItem.title}</p>
                {lightboxItem.description && (
                  <p className="text-white/60 text-sm mt-1">{lightboxItem.description}</p>
                )}
                <p className="text-white/30 text-xs mt-2">
                  {lightboxIndex + 1} / {filtered.length}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function VideoCard({ item, onClick }: { item: VideoGuideItem; onClick: () => void }) {
  const info = parseVideoUrl(item.url);
  const isYoutube = info?.platform === 'youtube';
  const isDrive = info?.platform === 'drive';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group cursor-pointer rounded-2xl overflow-hidden bg-white border border-amber-100 shadow-sm hover:shadow-lg transition-all duration-200"
      onClick={onClick}
    >
      <div className="relative aspect-video bg-amber-50 overflow-hidden">
        {isYoutube && info?.thumbnailUrl ? (
          <>
            <img
              src={info.thumbnailUrl}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <PlayCircle size={28} className="text-white fill-white" />
              </div>
            </div>
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-600/80 text-white text-[10px] font-bold flex items-center gap-1">
              <Video size={10} /> YouTube
            </div>
          </>
        ) : isDrive ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-blue-50 to-blue-100">
            <HardDrive size={36} className="text-blue-400" />
            <span className="text-xs font-bold text-blue-600">구글 드라이브</span>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mt-10 group-hover:scale-110 transition-transform">
                <PlayCircle size={22} className="text-blue-600" />
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-100 to-gray-200">
            <ExternalLink size={32} className="text-gray-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center mt-8 group-hover:scale-110 transition-transform">
                <PlayCircle size={22} className="text-gray-600" />
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm">
          {item.category}
        </div>
      </div>

      <div className="p-4">
        <p className="font-bold text-sm text-amber-900 leading-snug line-clamp-2">{item.title}</p>
        {item.description && (
          <p className="text-xs text-amber-700/60 mt-1.5 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const info = parseVideoUrl(url);
  if (!info) return null;

  if (info.platform === 'direct') {
    return (
      <video
        src={info.embedUrl}
        controls
        autoPlay
        className="max-w-full max-h-[70vh] rounded-xl"
      />
    );
  }
  return (
    <iframe
      src={info.embedUrl}
      className="w-[80vw] max-w-[900px] aspect-video rounded-xl"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-amber-700/50">
      <BookOpen size={48} />
      <div className="text-center">
        <p className="font-bold text-sm">아직 등록된 영상이 없습니다</p>
        <p className="text-xs mt-1 opacity-70">곧 영상이 업로드될 예정입니다</p>
      </div>
    </div>
  );
}
