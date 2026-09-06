import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ExternalLink, GraduationCap, LayoutDashboard, LogIn } from 'lucide-react';
import { useAuth, isAnonymousUser } from '../lib/auth';
import { stories } from '../data/stories';

export default function StoryHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user && !isAnonymousUser(user);

  const sorted = [...stories].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-[#FFFBF5] font-pretendard">
      <nav className="sticky top-0 z-50 bg-[#FFFBF5]/90 backdrop-blur border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
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

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-md mb-4">
            <BookOpen size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-amber-900 tracking-tight">클래스로그 AI 활용 이야기</h1>
          <p className="text-sm text-amber-700/70 mt-1.5">
            직접 만든 개발자가 하나씩 소개하는 클래스로그 AI 기능과 활용 팁
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sorted.map((story, idx) => (
            <motion.a
              key={story.id}
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="group rounded-2xl overflow-hidden bg-white border border-amber-100 shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col"
            >
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-[11px] font-black flex items-center justify-center shrink-0">
                    {story.order}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {story.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="font-bold text-sm text-amber-900 leading-snug flex-1">{story.title}</p>
                <p className="text-xs text-amber-700/60 mt-2 line-clamp-3 leading-relaxed">{story.summary}</p>
                <div className="flex items-center gap-1 mt-4 text-[11px] font-bold text-amber-500 group-hover:text-amber-600">
                  블로그에서 읽기 <ExternalLink size={12} />
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </div>
  );
}
