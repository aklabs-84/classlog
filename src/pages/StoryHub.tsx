import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ExternalLink, GraduationCap, LayoutDashboard, LogIn, Newspaper } from 'lucide-react';
import { useAuth, isAnonymousUser } from '../lib/auth';
import { stories, type Story } from '../data/stories';

const THUMB_GRADIENTS = [
  'from-amber-300 to-orange-400',
  'from-rose-300 to-amber-400',
  'from-orange-300 to-red-400',
  'from-yellow-300 to-amber-500',
];

export default function StoryHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user && !isAnonymousUser(user);

  const sorted = [...stories].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-[#FFFBF5] font-pretendard">
      <nav className="sticky top-0 z-50 bg-[#FFFBF5]/90 backdrop-blur border-b border-amber-100">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
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

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-md mb-4">
            <BookOpen size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-amber-900 tracking-tight">클래스로그 AI 활용 이야기</h1>
          <p className="text-sm text-amber-700/70 mt-1.5">
            직접 만든 개발자가 하나씩 소개하는 클래스로그 AI 기능과 활용 팁
          </p>
        </div>

        {/* 게시판 헤더 */}
        <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-b-2 border-amber-900/10 text-[11px] font-black text-amber-900/40 uppercase tracking-wider">
          <span className="w-16 text-center shrink-0">썸네일</span>
          <span className="flex-1">제목</span>
          <span className="w-16 text-center shrink-0">번호</span>
        </div>

        {/* 게시판 리스트 */}
        <ul className="divide-y divide-amber-900/10 border-b border-amber-900/10">
          {sorted.map((story, idx) => (
            <StoryRow key={story.id} story={story} index={idx} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function StoryRow({ story, index }: { story: Story; index: number }) {
  const gradient = THUMB_GRADIENTS[index % THUMB_GRADIENTS.length];

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
    >
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-4 px-4 py-4 hover:bg-white transition-colors"
      >
        {/* 썸네일 */}
        <div className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
          {story.thumbnail ? (
            <img src={story.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <Newspaper size={22} className="text-white/90" />
          )}
        </div>

        {/* 제목·요약·태그 */}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[15px] text-amber-950 leading-snug truncate group-hover:text-amber-700 transition-colors">
            {story.title}
          </p>
          <p className="text-xs text-amber-700/60 mt-1 line-clamp-1 leading-relaxed">{story.summary}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {story.tags.map(tag => (
              <span key={tag} className="text-[10px] font-bold text-amber-500/80">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* 번호 + 바로가기 아이콘 */}
        <div className="hidden sm:flex flex-col items-center gap-1 w-16 shrink-0 text-amber-900/30">
          <span className="text-sm font-black">{story.order}</span>
          <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </a>
    </motion.li>
  );
}
