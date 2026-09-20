import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Archive, 
  RefreshCcw, 
  Trash2, 
  GraduationCap, 
  AlertCircle,
  Calendar,
  Search,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { collectClassResultPaths, removeStoragePaths } from '../lib/storageCleanup';
import { useNavigate } from 'react-router-dom';

const ArchivePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [archivedClasses, setArchivedClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState<{id: string; msg: string}[]>([]);

  const showToast = (msg: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    if (user) {
      fetchArchivedClasses();
    }
  }, [user]);

  const fetchArchivedClasses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user?.id)
        .eq('is_archived', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArchivedClasses(data || []);
    } catch (error) {
      console.error('Error fetching archived classes:', error);
      showToast('보관된 학급을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreClass = async (id: string) => {
    try {
      const { error } = await supabase
        .from('classes')
        .update({ is_archived: false })
        .eq('id', id);

      if (error) throw error;
      
      showToast("학급이 복원되었습니다. ✨");
      await fetchArchivedClasses();
    } catch (error: any) {
      console.error('Error restoring class:', error);
      if (String(error?.message || '').includes('CLASS_LIMIT_EXCEEDED')) {
        showToast("진행 중인 클래스 한도에 도달했어요. 다른 클래스를 종료하거나 보관한 뒤 복원해 주세요.");
        return;
      }
      showToast("학급 복원 중 오류가 발생했습니다.");
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 학급을 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 모든 관련 데이터가 사라집니다.`)) return;
    
    try {
      const filePaths = await collectClassResultPaths(id);
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await removeStoragePaths(filePaths);

      showToast("학급이 영구적으로 삭제되었습니다.");
      await fetchArchivedClasses();
    } catch (error) {
      console.error('Error permanent deleting class:', error);
      showToast("영구 삭제 중 오류가 발생했습니다.");
    }
  };

  const filteredClasses = archivedClasses.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.subject || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <div className="flex flex-col relative bg-surface-container-low/20 rounded-[3rem] border border-white/40 shadow-2xl font-pretendard">
      {/* Header */}
      <header className="w-full glass border-b border-white/10 px-8 py-6 shrink-0 z-50 shadow-soft backdrop-blur-2xl">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate(-1)}
              className="p-3 bg-white/40 hover:bg-white rounded-2xl text-on-surface-variant transition-all hover:shadow-soft"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-3 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-[9px] font-black uppercase tracking-widest">
                  Archive Management
                </span>
              </div>
              <h1 className="text-3xl font-black tracking-tightest leading-tight">학급 <span className="gradient-text">보관함</span></h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="relative group min-w-[300px]">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text" 
                  placeholder="보관된 학급 검색..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 text-sm font-bold text-neutral-900 outline-none pl-14 pr-8 py-3.5 rounded-2xl w-full transition-all placeholder:text-neutral-400 shadow-sm" 
                />
             </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-8 md:p-12">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          {/* Warning Banner */}
          <div className="bg-error/5 p-6 rounded-[2rem] flex items-center gap-6 border border-error/10 animate-fade-in shadow-sm">
             <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-error shadow-sm shrink-0">
                <AlertCircle size={24} />
             </div>
             <div className="space-y-1">
               <p className="text-sm font-black text-error/80">보관된 학급 데이터 관리 주의사항</p>
               <p className="text-xs font-bold text-error/60 leading-relaxed">
                 학급을 영구 삭제하면 해당 학급의 모든 학생 명단 및 제출된 관찰 기록 데이터가 **영구적으로 폐기**됩니다. 
                 필요 시 사전 백업을 권장드립니다.
               </p>
             </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-64 bg-surface-container animate-pulse rounded-[2.5rem]" />
              ))}
            </div>
          ) : filteredClasses.length > 0 ? (
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {filteredClasses.map((c) => (
                <motion.div 
                  key={c.id} 
                  variants={itemVariants}
                  className="layered-card p-8 rounded-[2.5rem] bg-white/60 hover:bg-white hover:shadow-elevated transition-all duration-500 flex flex-col group relative overflow-hidden"
                >
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
                  
                  <div className="flex items-start justify-between mb-8 relative z-10">
                    <div className="w-14 h-14 bg-surface-container rounded-2xl flex items-center justify-center text-on-surface-variant/40 group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
                      <GraduationCap size={28} />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                       <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/30 flex items-center gap-1.5">
                          <Calendar size={12} />
                          {new Date(c.created_at).toLocaleDateString()}
                       </span>
                       <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                         c.class_type === 'homeroom' ? 'bg-secondary/5 text-secondary border-secondary/10' : 'bg-primary/5 text-primary border-primary/10'
                       }`}>
                         {c.class_type === 'homeroom' ? '담임' : '교과'}
                       </span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-8 relative z-10">
                    <h3 className="text-2xl font-black tracking-tight">{c.name}</h3>
                    <p className="text-sm font-bold text-on-surface-variant/60">{c.subject || '과목 미지정'}</p>
                  </div>

                  <div className="mt-auto flex items-center gap-3 relative z-10">
                    <button 
                      onClick={() => handleRestoreClass(c.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-4 bg-primary/5 hover:bg-primary text-primary hover:text-white rounded-2xl font-black text-sm transition-all shadow-sm border border-primary/10"
                    >
                      <RefreshCcw size={16} />
                      복원하기
                    </button>
                    <button 
                      onClick={() => handlePermanentDelete(c.id, c.name)}
                      className="p-4 bg-error/5 hover:bg-error text-error/40 hover:text-white rounded-2xl transition-all shadow-sm border border-error/10"
                      title="영구 삭제"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="py-40 flex flex-col items-center justify-center space-y-8">
               <div className="w-32 h-32 bg-surface-container rounded-[3rem] flex items-center justify-center text-on-surface-variant/10 shadow-inner group transition-all duration-700">
                  <Archive size={64} className="group-hover:scale-110 group-hover:rotate-6 transition-transform" />
               </div>
               <div className="text-center space-y-2">
                 <h3 className="text-3xl font-black tracking-tightest">{searchQuery ? '검색 결과가 없습니다.' : '보관함이 비어 있습니다.'}</h3>
                 <p className="text-on-surface-variant/40 font-bold">
                   {searchQuery ? '다른 검색어를 입력해 보세요.' : '정기적으로 학급을 아카이빙하여 대시보드를 깔끔하게 관리하세요.'}
                 </p>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* Toast Notifs */}
      <div className="fixed top-12 right-12 z-[200] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              className="bg-neutral-900 text-white px-8 py-5 rounded-[2rem] shadow-2xl text-sm font-black flex items-center gap-4 pointer-events-auto border border-white/10"
            >
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]" />
              {toast.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ArchivePage;
