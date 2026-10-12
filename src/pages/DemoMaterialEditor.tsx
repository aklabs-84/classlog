import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Play, Loader2 } from 'lucide-react';
import { provisionDemoClass, EDITOR_TOUR_KEY } from '../lib/demo';

// 수업 자료 에디터 체험 입구. 로그인 없이 체험용 선생님 계정으로 들어가
// 실제 수업 자료 에디터 화면 위에서 안내 투어를 진행한다.
const DemoMaterialEditor = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    setLoading(true);
    setError('');
    try {
      await provisionDemoClass();
      sessionStorage.setItem(EDITOR_TOUR_KEY, JSON.stringify({ step: 0, status: 'active' }));
      navigate('/teaching-tools?tool=material-editor');
    } catch (err: any) {
      setError(err.message || '잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface font-pretendard flex flex-col items-center justify-center px-6 py-16 text-center">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
        <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-violet-200 rotate-3">
          <BookOpen size={38} className="text-white" />
        </div>
        <h1 className="text-3xl font-black text-on-surface mb-4 tracking-tight leading-tight">
          수업 자료 에디터,<br />
          <span className="text-primary">직접 눌러 보며 배워요</span>
        </h1>
        <p className="text-on-surface-variant text-sm leading-relaxed max-w-sm mx-auto mb-8">
          로그인 없이 실제 에디터 화면에서 안내를 따라 해 보세요.<br />
          제목 쓰기부터 / 메뉴, 학생이 적는 칸, 공개까지 7단계예요.
        </p>
        <button
          onClick={handleStart}
          disabled={loading}
          className="px-8 py-4 bg-primary hover:bg-primary-dim disabled:opacity-60 text-white font-black rounded-2xl text-base transition-all shadow-lg shadow-primary/20 hover:scale-105 flex items-center gap-2 mx-auto"
        >
          {loading ? <><Loader2 size={18} className="animate-spin" /> 체험 준비 중...</> : <><Play size={18} strokeWidth={3} /> 체험 시작하기</>}
        </button>
        {error && <p className="mt-3 text-xs text-red-500 font-bold">{error}</p>}
        <p className="mt-4 text-xs text-on-surface-variant/60">체험용 학급은 2시간 뒤 자동으로 사라져요 · 내 자료에는 영향이 없어요</p>
      </motion.div>
    </div>
  );
};

export default DemoMaterialEditor;
