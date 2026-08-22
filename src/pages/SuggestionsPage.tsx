import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, Send, Loader2, Reply, Clock, ChevronDown,
  MessageSquare, CheckCircle2, Filter, ArrowLeft, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type Suggestion = {
  id: string;
  student_id: string;
  class_id: string;
  teacher_id: string;
  content: string;
  student_name: string | null;
  teacher_reply: string | null;
  replied_at: string | null;
  is_reply_read: boolean;
  created_at: string;
};

type ClassInfo = { id: string; name: string; subject: string; class_type: string };

const SuggestionsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  // '' = 전체 수업 보기
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [classesLoading, setClassesLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'replied'>('all');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 수업 목록 로드
  useEffect(() => {
    if (!user) return;
    const fetchClasses = async () => {
      setClassesLoading(true);
      const { data } = await supabase
        .from('classes')
        .select('id, name, subject, class_type')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      setClasses(data || []);
      setClassesLoading(false);
    };
    fetchClasses();
  }, [user]);

  // teacher_id로 직접 조회 — classes 로드 여부와 무관하게 실행
  useEffect(() => {
    if (!user) return;
    const fetchAllSuggestions = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('student_suggestions')
        .select('*')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      setAllSuggestions((data as Suggestion[]) || []);
      setLoading(false);
    };
    fetchAllSuggestions();
  }, [user]);

  // 드롭다운 선택 = 클라이언트 필터
  const visibleSuggestions = selectedClassId
    ? allSuggestions.filter(s => s.class_id === selectedClassId)
    : allSuggestions;

  const filteredSuggestions = visibleSuggestions.filter(s => {
    if (filter === 'pending') return !s.teacher_reply;
    if (filter === 'replied') return !!s.teacher_reply;
    return true;
  });

  const pendingCount = visibleSuggestions.filter(s => !s.teacher_reply).length;
  const repliedCount = visibleSuggestions.filter(s => !!s.teacher_reply).length;

  const handleSaveReply = async (id: string) => {
    if (!replyText.trim()) return;
    setSavingId(id);
    const { error } = await supabase
      .from('student_suggestions')
      .update({ teacher_reply: replyText.trim(), replied_at: new Date().toISOString(), is_reply_read: false })
      .eq('id', id);
    if (!error) {
      setAllSuggestions(prev => prev.map(s =>
        s.id === id ? { ...s, teacher_reply: replyText.trim(), replied_at: new Date().toISOString() } : s
      ));
      setReplyingId(null);
      setReplyText('');
    }
    setSavingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 질문·건의 내용을 삭제하시겠습니까? 삭제하면 되돌릴 수 없습니다.')) return;
    setDeletingId(id);
    const { error } = await supabase
      .from('student_suggestions')
      .delete()
      .eq('id', id);
    if (!error) {
      setAllSuggestions(prev => prev.filter(s => s.id !== id));
    }
    setDeletingId(null);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const selectedClass = classes.find(c => c.id === selectedClassId);

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-8 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-all shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-500">
                <Megaphone size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-black">질문·건의함 관리</h1>
                <p className="text-sm text-on-surface-variant font-bold mt-0.5">
                  학생들의 질문과 건의를 확인하고 답변해 주세요.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 수업 선택 드롭다운 */}
        {!classesLoading && classes.length > 0 && (
          <div className="relative">
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-white border-2 border-primary/20 rounded-2xl font-black text-sm focus:outline-none focus:border-primary/50 transition-all cursor-pointer"
            >
              <option value="">전체 수업</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.subject ? ` · ${c.subject}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/50 pointer-events-none" />
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: '전체', count: visibleSuggestions.length, color: 'bg-neutral-50 border-neutral-200 text-neutral-600', key: 'all' },
          { label: '미답변', count: pendingCount, color: 'bg-rose-50 border-rose-200 text-rose-600', key: 'pending' },
          { label: '답변완료', count: repliedCount, color: 'bg-emerald-50 border-emerald-200 text-emerald-600', key: 'replied' },
        ].map(({ label, count, color, key }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`p-4 rounded-2xl border-2 transition-all text-left ${color} ${filter === key ? 'ring-2 ring-offset-2 ring-primary/30 shadow-md' : 'hover:shadow-sm'}`}
          >
            <p className="text-2xl font-black">{count}</p>
            <p className="text-xs font-black mt-0.5 opacity-70">{label}</p>
          </button>
        ))}
      </div>

      {/* 필터 탭 */}
      <div className="flex items-center gap-2 mb-6">
        <Filter size={14} className="text-on-surface-variant/50" />
        {[
          { key: 'all', label: '전체' },
          { key: 'pending', label: '📭 미답변' },
          { key: 'replied', label: '✅ 답변완료' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
              filter === key ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs font-bold text-on-surface-variant/50">
          {selectedClass ? selectedClass.name : '전체 수업'}
        </span>
      </div>

      {/* 건의사항 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 size={36} className="animate-spin text-primary" />
        </div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-30">
          <Megaphone size={56} />
          <p className="font-black text-lg">
            {filter === 'pending' ? '미답변 내용이 없습니다.' : filter === 'replied' ? '답변한 내용이 없습니다.' : '등록된 질문·건의함 내용이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {filteredSuggestions.map(s => {
              const isReplying = replyingId === s.id;
              const isSaving = savingId === s.id;
              const isDeleting = deletingId === s.id;
              const className = classes.find(c => c.id === s.class_id)?.name;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden"
                >
                  {/* 건의 내용 */}
                  <div className="p-6 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-400 shrink-0">
                      <MessageSquare size={18} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-on-surface">
                          {s.student_name || '이름 없음'}
                        </span>
                        {className && (
                          <span className="text-[10px] font-black text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-md">
                            {className}
                          </span>
                        )}
                        {s.teacher_reply ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <CheckCircle2 size={10} /> 답변완료
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                            📭 미답변
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-on-surface-variant font-bold flex items-center gap-1">
                          <Clock size={11} />{formatDate(s.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-on-surface leading-relaxed">{s.content}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={isDeleting}
                      title="삭제"
                      className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-neutral-300 hover:text-rose-500 hover:bg-rose-50 transition-all disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>

                  {/* 선생님 답변 영역 */}
                  {isReplying ? (
                    <div className="border-t border-primary/10 bg-primary/[0.02] px-6 py-4 space-y-3">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest">답변 작성</p>
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={4}
                        autoFocus
                        placeholder="학생에게 전달할 답변을 입력하세요..."
                        className="w-full px-4 py-3 bg-white rounded-2xl text-sm font-medium border-2 border-primary/20 focus:border-primary/50 focus:outline-none resize-none transition-all"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveReply(s.id)}
                          disabled={isSaving || !replyText.trim()}
                          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/80 disabled:opacity-50 transition-all"
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          답변 저장
                        </button>
                        <button
                          onClick={() => { setReplyingId(null); setReplyText(''); }}
                          className="px-5 py-2.5 text-on-surface-variant rounded-xl text-xs font-black hover:bg-surface-container transition-all"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : s.teacher_reply ? (
                    <div className="border-t border-primary/10 bg-primary/[0.02] px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
                          <Reply size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-black text-primary uppercase tracking-wider">선생님 답변</p>
                            {s.replied_at && (
                              <p className="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1">
                                <Clock size={9} />{formatDate(s.replied_at)}
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-medium text-on-surface/80 leading-relaxed">{s.teacher_reply}</p>
                        </div>
                        <button
                          onClick={() => { setReplyingId(s.id); setReplyText(s.teacher_reply || ''); }}
                          className="text-[10px] font-black text-primary/50 hover:text-primary transition-colors shrink-0 px-3 py-1.5 rounded-xl hover:bg-primary/10"
                        >
                          수정
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-neutral-100 px-6 py-3">
                      <button
                        onClick={() => { setReplyingId(s.id); setReplyText(''); }}
                        className="flex items-center gap-2 text-sm font-black text-primary/60 hover:text-primary transition-colors"
                      >
                        <Reply size={14} /> 답변 작성하기
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default SuggestionsPage;
