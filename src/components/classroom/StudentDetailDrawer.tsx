import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, User as UserIcon, BookOpen, Clock, Activity, FileText, CheckCircle2,
  FolderOpen, AlignLeft, Link2, ImageIcon, File, Upload, ExternalLink, Megaphone, MessageSquare, Loader2,
  Reply, Send, XCircle, MessageCircle, Check, AlertTriangle, PenLine
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { downloadFile } from '../../lib/fileUtils';
import { ImageCarousel, getResultImagePublicUrls } from '../common/ImageCarousel';
import SubmissionViewerModal, { getViewerKind } from './SubmissionViewerModal';

interface StudentDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string | null;
  fromClassId?: string;
  onAskAI?: (studentId: string) => void;
}

const StudentDetailDrawer = ({ isOpen, onClose, studentId, fromClassId, onAskAI }: StudentDetailDrawerProps) => {
  const { user } = useAuth();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);
  // 관찰기록 반려
  const [rejectingObsId, setRejectingObsId] = useState<string | null>(null);
  const [obsFeedback, setObsFeedback] = useState('');
  const [savingObsReject, setSavingObsReject] = useState(false);
  // 결과물 피드백
  const [feedbackResultId, setFeedbackResultId] = useState<string | null>(null);
  const [resultFeedback, setResultFeedback] = useState('');
  const [savingResultFeedback, setSavingResultFeedback] = useState(false);
  // 관찰 기록 추가 폼
  const [showObsForm, setShowObsForm] = useState(false);
  const [obsTitle, setObsTitle] = useState('');
  const [obsCategory, setObsCategory] = useState('과제물');
  const [obsContent, setObsContent] = useState('');
  const [savingObs, setSavingObs] = useState(false);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const navigate = useNavigate();

  const handleSaveReply = async (suggestionId: string) => {
    if (!replyText.trim()) return;
    setSavingReplyId(suggestionId);
    try {
      const { error } = await supabase
        .from('student_suggestions')
        .update({
          teacher_reply: replyText.trim(),
          replied_at: new Date().toISOString(),
          is_reply_read: false
        })
        .eq('id', suggestionId);
      if (error) throw error;
      setSuggestions(prev => prev.map(s =>
        s.id === suggestionId
          ? { ...s, teacher_reply: replyText.trim(), replied_at: new Date().toISOString(), is_reply_read: false }
          : s
      ));
      setReplyingId(null);
      setReplyText('');
    } catch (err) {
      console.error('Reply save error:', err);
    } finally {
      setSavingReplyId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownloadResult = (result: any) => {
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(result.storage_path);
    downloadFile(data.publicUrl, result.display_name || 'download');
  };

  const handleRejectObs = async () => {
    if (!rejectingObsId || !obsFeedback.trim()) return;
    setSavingObsReject(true);
    try {
      const obs = student?.observations?.find((o: any) => o.id === rejectingObsId);
      await supabase.from('observations').update({
        status: 'rejected',
        teacher_feedback: obsFeedback.trim(),
      }).eq('id', rejectingObsId);
      setStudent((prev: any) => ({
        ...prev,
        observations: prev.observations.map((o: any) =>
          o.id === rejectingObsId ? { ...o, status: 'rejected', teacher_feedback: obsFeedback.trim() } : o
        ),
      }));
      if (studentId) {
        const classId = fromClassId || student?.class_id;
        const { error: notifErr } = await supabase.from('student_notifications').insert({
          student_id: studentId,
          class_id: classId,
          title: '활동 기록이 반려되었습니다',
          content: `"${obs?.activity_name || '활동 기록'}" — ${obsFeedback.trim()}`,
          type: 'rejection',
          is_read: false,
        });
        if (notifErr) console.error('student_notifications insert error (reject obs):', notifErr);
      }
      setRejectingObsId(null);
      setObsFeedback('');
    } catch (err) {
      console.error('Reject obs error:', err);
    } finally {
      setSavingObsReject(false);
    }
  };

  const handleApproveObs = async (obsId: string) => {
    const obs = student?.observations?.find((o: any) => o.id === obsId);
    await supabase.from('observations').update({ status: 'approved', teacher_feedback: null }).eq('id', obsId);
    setStudent((prev: any) => ({
      ...prev,
      observations: prev.observations.map((o: any) =>
        o.id === obsId ? { ...o, status: 'approved', teacher_feedback: null } : o
      ),
    }));
    if (studentId) {
      const classId = fromClassId || student?.class_id;
      const { error: notifErr } = await supabase.from('student_notifications').insert({
        student_id: studentId,
        class_id: classId,
        title: '활동 기록이 승인되었습니다 ✅',
        content: `"${obs?.activity_name || '활동 기록'}"이 선생님께 승인되었습니다.`,
        type: 'approval',
        is_read: false,
      });
      if (notifErr) console.error('student_notifications insert error (approve obs):', notifErr);
    }
  };

  const handleSaveResultFeedback = async () => {
    if (!feedbackResultId || !resultFeedback.trim()) return;
    setSavingResultFeedback(true);
    try {
      const groupItems = results.filter(r => (r.submission_group || r.id) === feedbackResultId);
      const firstItem = groupItems[0];
      const feedback = resultFeedback.trim();
      await supabase.from('student_results').update({
        teacher_feedback: feedback,
      }).eq(firstItem?.submission_group ? 'submission_group' : 'id', feedbackResultId);
      setResults(prev => prev.map(r =>
        (r.submission_group || r.id) === feedbackResultId ? { ...r, teacher_feedback: feedback } : r
      ));
      if (studentId) {
        const classId = fromClassId || student?.class_id;
        const { error: notifErr } = await supabase.from('student_notifications').insert({
          student_id: studentId,
          class_id: classId,
          title: '결과 제출에 선생님 피드백이 도착했습니다',
          content: `"${firstItem?.title || '결과 제출'}" — ${feedback}`,
          type: 'feedback',
          is_read: false,
        });
        if (notifErr) console.error('student_notifications insert error (result feedback):', notifErr);
      }
      setFeedbackResultId(null);
      setResultFeedback('');
    } catch (err) {
      console.error('Result feedback error:', err);
    } finally {
      setSavingResultFeedback(false);
    }
  };

  const handleDeleteResultFeedback = async (groupId: string) => {
    setSavingResultFeedback(true);
    try {
      const groupItems = results.filter(r => (r.submission_group || r.id) === groupId);
      const firstItem = groupItems[0];
      await supabase.from('student_results').update({
        teacher_feedback: null,
      }).eq(firstItem?.submission_group ? 'submission_group' : 'id', groupId);
      setResults(prev => prev.map(r =>
        (r.submission_group || r.id) === groupId ? { ...r, teacher_feedback: null } : r
      ));
      setFeedbackResultId(null);
      setResultFeedback('');
    } catch (err) {
      console.error('Result feedback delete error:', err);
    } finally {
      setSavingResultFeedback(false);
    }
  };

  useEffect(() => {
    const fetchStudentDetail = async () => {
      if (!studentId || !isOpen) return;
      setLoading(true);
      try {
        const [studentRes, resultsRes, suggestionsRes] = await Promise.all([
          supabase
            .from('students')
            .select(`*, observations(id, content, activity_name, created_at, is_student_record, status, teacher_feedback, ai_concern)`)
            .eq('id', studentId)
            .single(),
          supabase
            .from('student_results')
            .select('*, teacher_feedback')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false }),
          supabase
            .from('student_suggestions')
            .select('*')
            .eq('student_id', studentId)
            .order('created_at', { ascending: false })
        ]);

        if (studentRes.error) throw studentRes.error;
        setStudent(studentRes.data);
        if (!resultsRes.error) setResults(resultsRes.data || []);
        if (!suggestionsRes.error) setSuggestions(suggestionsRes.data || []);
      } catch (err) {
        console.error('Error fetching student detail for drawer:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudentDetail();
  }, [studentId, isOpen]);

  const handleSaveObs = async () => {
    if (!obsTitle.trim() || !obsContent.trim()) return;
    setSavingObs(true);
    try {
      const { data, error } = await supabase.from('observations').insert({
        teacher_id: user?.id,
        student_id: studentId,
        activity_name: obsTitle.trim(),
        category: obsCategory,
        content: obsContent.trim(),
        is_student_record: false,
      }).select().single();
      if (error) throw error;
      setStudent((prev: any) => ({
        ...prev,
        observations: [data, ...(prev?.observations || [])],
      }));
      setObsTitle('');
      setObsCategory('과제물');
      setObsContent('');
      setShowObsForm(false);
    } catch (err) {
      console.error('관찰 기록 저장 오류:', err);
    } finally {
      setSavingObs(false);
    }
  };

  const handleNavigateToFullPage = () => {
    if (studentId) {
      navigate(`/student-view/${studentId}`, { state: { fromClassId } });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (<>
    {createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[2000]">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        />
        
        {/* Drawer */}
        <motion.div 
          initial={{ x: '100%', boxShadow: '-20px 0 40px rgba(0,0,0,0)' }}
          animate={{ x: 0, boxShadow: '-20px 0 40px rgba(0,0,0,0.1)' }}
          exit={{ x: '100%', boxShadow: '-20px 0 40px rgba(0,0,0,0)' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute top-0 right-0 h-full w-full max-w-md bg-surface border-l border-white/40 flex flex-col overflow-hidden text-on-surface"
        >
          {/* Drawer Header */}
          <header className="p-6 border-b border-surface-container-high flex flex-col gap-6 bg-white/50 backdrop-blur-xl shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex gap-4 items-center">
                <div className="w-14 h-14 bg-gradient-to-br from-primary/10 to-secondary/10 rounded-[1.25rem] flex items-center justify-center text-primary shadow-inner overflow-hidden">
                  {student?.avatar_url ? (
                    <img src={student.avatar_url} alt={student.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon size={24} strokeWidth={2} />
                  )}
                </div>
                <div>
                  {loading ? (
                    <div className="h-6 w-24 bg-surface-container animate-pulse rounded-md mb-2" />
                  ) : (
                    <h2 className="text-2xl font-black tracking-tight">{student?.full_name}</h2>
                  )}
                  {loading ? (
                     <div className="h-4 w-12 bg-surface-container animate-pulse rounded-md" />
                  ) : (
                    <span className="px-2 py-0.5 bg-surface-container-high text-xs font-black uppercase text-on-surface-variant/75 rounded border border-neutral-200">
                       {student?.student_number ? `${student.student_number}번` : '정보 없음'}
                    </span>
                  )}
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 -mr-2 text-on-surface-variant/65 hover:text-on-surface hover:bg-surface-container rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleNavigateToFullPage}
                className="flex-1 py-3 bg-on-surface text-surface rounded-xl text-xs font-black hover:bg-primary transition-all shadow-soft active:scale-95 flex items-center justify-center gap-2"
              >
                <BookOpen size={14} /> 전체 기록실 이동
              </button>
              {onAskAI && (
                <button
                  onClick={() => studentId && onAskAI(studentId)}
                  className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/85 transition-all shadow-soft active:scale-95 flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} /> AI에게 물어보기
                </button>
              )}
            </div>
          </header>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-surface-container-low/30">
            {loading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 bg-surface-container/50 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                {/* Quick AI Summary Hook */}
                <div className="p-5 layered-card rounded-2xl bg-gradient-to-br from-primary/5 to-transparent border-primary/10 relative overflow-hidden group">
                   <div className="absolute -right-4 -top-4 text-primary/10 group-hover:rotate-12 transition-transform duration-500"><Sparkles size={60} /></div>
                   <div className="relative z-10 flex items-center gap-2 mb-3">
                      <Sparkles size={16} className="text-primary" />
                      <h4 className="text-xs font-black uppercase tracking-widest text-primary">AI 빠른 인사이트</h4>
                   </div>
                   <p className="text-sm font-bold text-on-surface-variant leading-relaxed relative z-10 line-clamp-3">
                     {student?.observations?.length > 0 ?
                       "누적된 활동 기록을 분석하여 학생의 주요 성장 키워드와 성취도를 시각적으로 시뮬레이션 할 수 있습니다."
                       : "아직 등록된 활동 기록이 없습니다. 새로운 교사 메모를 추가하여 AI 분석을 시작하세요."}
                   </p>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 bg-white rounded-2xl shadow-sm border border-neutral-100 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-secondary/60">
                         <Activity size={14} />
                         <span className="text-xs font-black uppercase tracking-widest">전체 활동</span>
                      </div>
                      <span className="text-2xl font-black">{student?.observations?.length || 0}</span>
                   </div>
                   <div className="p-4 bg-white rounded-2xl shadow-sm border border-neutral-100 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-primary/60">
                         <FileText size={14} />
                         <span className="text-xs font-black uppercase tracking-widest">기록 보고서</span>
                      </div>
                      <span className="text-2xl font-black">0</span>
                   </div>
                </div>

                {/* Recent Activity Mini List */}
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <button
                       onClick={handleNavigateToFullPage}
                       className="flex items-center gap-2 group"
                     >
                       <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2 group-hover:text-primary transition-colors">
                         <Clock size={14} /> Recent Activities
                       </h4>
                       <span className="text-xs font-black text-primary/70 group-hover:text-primary transition-colors flex items-center gap-1">
                         전체 보기 →
                       </span>
                     </button>
                     <button
                       onClick={() => setShowObsForm(v => !v)}
                       className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                         showObsForm
                           ? 'bg-primary/10 text-primary'
                           : 'bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary'
                       }`}
                     >
                       <PenLine size={11} /> 교사 메모
                     </button>
                   </div>

                   {/* 인라인 관찰 기록 폼 */}
                   {showObsForm && (
                     <div className="p-4 bg-white rounded-2xl border border-primary/15 shadow-sm space-y-3">
                       <input
                         type="text"
                         value={obsTitle}
                         onChange={e => setObsTitle(e.target.value)}
                         placeholder="활동명 (예: 모둠 발표)"
                         className="w-full px-3 py-2.5 bg-surface-container rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                       />
                       <div className="flex gap-1.5 flex-wrap">
                         {['발표', '과제물', '토론', '실험'].map(cat => (
                           <button
                             key={cat}
                             onClick={() => setObsCategory(cat)}
                             className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                               obsCategory === cat
                                 ? 'bg-primary-container text-primary'
                                 : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                             }`}
                           >
                             {cat}
                           </button>
                         ))}
                       </div>
                       <textarea
                         value={obsContent}
                         onChange={e => setObsContent(e.target.value)}
                         placeholder="관찰 내용을 입력하세요..."
                         rows={3}
                         className="w-full px-3 py-2.5 bg-surface-container rounded-xl text-xs font-medium resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                       />
                       <div className="flex gap-2 justify-end">
                         <button
                           onClick={() => { setShowObsForm(false); setObsTitle(''); setObsContent(''); setObsCategory('과제물'); }}
                           className="px-3 py-1.5 text-xs font-black text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-lg transition-all"
                         >
                           취소
                         </button>
                         <button
                           onClick={handleSaveObs}
                           disabled={savingObs || !obsTitle.trim() || !obsContent.trim()}
                           className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-black disabled:opacity-50 hover:bg-primary/80 transition-all"
                         >
                           {savingObs ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} 저장
                         </button>
                       </div>
                     </div>
                   )}
                   {student?.observations?.length > 0 ? (
                     <div className="space-y-3">
                       {student.observations.slice(0, 3).map((obs: any) => (
                         <div
                           key={obs.id}
                           onClick={handleNavigateToFullPage}
                           className="p-4 bg-white rounded-2xl shadow-sm border border-neutral-100/50 hover:border-primary/20 hover:bg-primary/[0.02] transition-colors cursor-pointer"
                         >
                            <div className="flex items-start justify-between mb-1">
                              <p className="text-xs font-bold text-on-surface-variant/65">
                                {new Date(obs.created_at).toLocaleDateString('ko-KR')}
                              </p>
                              {obs.is_student_record && (
                                <div className="flex flex-col items-end gap-1">
                                  {obs.status === 'rejected' ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="flex items-center gap-1 text-xs font-black text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                                        <XCircle size={9} /> 반려됨
                                      </span>
                                      <button onClick={(e) => { e.stopPropagation(); handleApproveObs(obs.id); }}
                                        className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md hover:bg-emerald-100 transition-all">
                                        승인으로 변경
                                      </button>
                                    </div>
                                  ) : obs.status === 'pending' ? (
                                    <span className="flex items-center gap-1 text-xs font-black text-amber-500 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                                      <Clock size={9} /> 승인대기
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs font-black text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-md">
                                      <CheckCircle2 size={9} /> 승인완료
                                    </span>
                                  )}
                                  {obs.status !== 'rejected' && rejectingObsId !== obs.id && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setRejectingObsId(obs.id); setObsFeedback(''); }}
                                      className="flex items-center gap-1 text-xs font-black text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md hover:bg-red-100 transition-all"
                                    >
                                      <XCircle size={9} /> 반려+피드백
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <p className="text-sm font-black text-on-surface/80">{obs.activity_name}</p>
                            {/* AI 검토 권장 카드 */}
                            {obs.ai_concern && (
                              <div className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
                                  <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                                  <span className="text-xs font-black text-amber-800 uppercase tracking-widest flex-1">AI 검토 권장</span>
                                  <span className={`text-xs font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                    obs.status === 'approved'
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                      : obs.status === 'rejected'
                                      ? 'bg-red-100 text-red-600 border-red-200'
                                      : 'bg-amber-200 text-amber-700 border-amber-300'
                                  }`}>
                                    {obs.status === 'approved' && '✓ 승인됨'}
                                    {obs.status === 'rejected' && '✕ 반려됨'}
                                    {obs.status === 'pending'  && '⏳ 대기'}
                                  </span>
                                </div>
                                <p className="px-3 py-2 text-xs font-bold text-amber-900 leading-relaxed">{obs.ai_concern}</p>
                              </div>
                            )}
                            {/* 기존 피드백 표시 */}
                            {obs.teacher_feedback && obs.status === 'rejected' && (
                              <p className="mt-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-lg px-2 py-1">
                                💬 {obs.teacher_feedback}
                              </p>
                            )}
                            {/* 인라인 피드백 입력 폼 */}
                            {obs.is_student_record && obs.status !== 'rejected' && rejectingObsId === obs.id && (
                              <div className="mt-2 space-y-1.5" onClick={e => e.stopPropagation()}>
                                <textarea
                                  value={obsFeedback}
                                  onChange={e => setObsFeedback(e.target.value)}
                                  placeholder="반려 사유를 입력하세요..."
                                  className="w-full text-xs p-2.5 border border-red-200 rounded-xl resize-none bg-red-50 focus:outline-none focus:border-red-400"
                                  rows={2}
                                  autoFocus
                                />
                                <div className="flex gap-1.5">
                                  <button onClick={handleRejectObs} disabled={savingObsReject || !obsFeedback.trim()}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-black disabled:opacity-50 transition-all">
                                    {savingObsReject ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} 반려 전송
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); setRejectingObsId(null); setObsFeedback(''); }}
                                    className="px-3 py-1.5 bg-neutral-100 text-neutral-500 rounded-lg text-xs font-black hover:bg-neutral-200 transition-all">
                                    취소
                                  </button>
                                </div>
                              </div>
                            )}
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="p-6 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                        <p className="text-xs font-bold text-neutral-400">최근 활동 기록이 없습니다.</p>
                     </div>
                   )}
                </div>

                {/* 결과 제출 목록 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                      <FolderOpen size={14} /> 결과 제출
                    </h4>
                    <span className="text-xs font-black text-on-surface-variant/70 bg-surface-container px-2 py-0.5 rounded-md">
                      {(() => {
                        const keys = new Set(results.map(r => r.submission_group || r.id));
                        return keys.size;
                      })()}건
                    </span>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-primary" /></div>
                  ) : results.length === 0 ? (
                    <div className="p-4 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                      <p className="text-xs font-bold text-neutral-400">제출된 결과물이 없습니다.</p>
                    </div>
                  ) : (() => {
                    const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                      text:  { icon: <AlignLeft size={13} />,  color: 'text-primary bg-primary/10',     label: '텍스트' },
                      link:  { icon: <Link2 size={13} />,      color: 'text-blue-500 bg-blue-50',       label: '링크' },
                      image: { icon: <ImageIcon size={13} />,  color: 'text-emerald-500 bg-emerald-50', label: '이미지' },
                      file:  { icon: <File size={13} />,       color: 'text-amber-500 bg-amber-50',     label: '파일' }
                    };
                    const groups: Record<string, any[]> = {};
                    results.forEach(r => {
                      const key = r.submission_group || r.id;
                      if (!groups[key]) groups[key] = [];
                      groups[key].push(r);
                    });
                    const groupedEntries = Object.entries(groups).sort(([, a], [, b]) =>
                      new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime()
                    );

                    return (
                      <div className="space-y-2">
                        {groupedEntries.map(([groupId, groupItems]) => {
                          const firstItem = groupItems[0];
                          const title = groupItems.find(r => r.title)?.title;
                          const textItem = groupItems.find(r => r.result_type === 'text');
                          const linkItem = groupItems.find(r => r.result_type === 'link');
                          const imageItem = groupItems.find(r => r.result_type === 'image');
                          const fileItem = groupItems.find(r => r.result_type === 'file');
                          const types = [...new Set(groupItems.map(r => r.result_type as string))];
                          const teacherFeedback = groupItems.find(r => r.teacher_feedback)?.teacher_feedback;
                          const imagePublicUrls = getResultImagePublicUrls(supabase.storage, imageItem);

                          return (
                            <div key={groupId} className="p-3.5 bg-white rounded-xl border border-neutral-100 hover:border-primary/20 transition-colors group">
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                    {title && <span className="font-black text-xs text-on-surface w-full">{title}</span>}
                                    {types.map(type => {
                                      const cfg = typeConfig[type] || typeConfig.file;
                                      return (
                                        <span key={type} className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.color}`}>
                                          {cfg.icon}{cfg.label}
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {textItem?.text_content && (
                                    <p className="text-xs font-medium text-on-surface/80 line-clamp-2 leading-relaxed mb-1">{textItem.text_content}</p>
                                  )}
                                  {linkItem?.link_url && (
                                    <a href={linkItem.link_url} target="_blank" rel="noopener noreferrer"
                                      className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1 truncate mb-1">
                                      <ExternalLink size={10} />{linkItem.link_url}
                                    </a>
                                  )}
                                  {imageItem && imagePublicUrls.length > 0 && (
                                    <div className="flex items-center gap-2 mt-1 mb-1">
                                      <ImageCarousel
                                        urls={imagePublicUrls}
                                        alt={title || '이미지'}
                                        thumbClassName="max-h-20 rounded-lg object-cover hover:opacity-80"
                                      />
                                      <button
                                        onClick={() => handleDownloadResult(imageItem)}
                                        title="다운로드"
                                        className="w-7 h-7 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-all opacity-0 group-hover:opacity-100 shrink-0"
                                      >
                                        <Upload size={12} className="rotate-180" />
                                      </button>
                                    </div>
                                  )}
                                  {fileItem && (
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5">
                                        <File size={10} />{fileItem.display_name}
                                        {fileItem.file_size ? ` (${formatFileSize(fileItem.file_size)})` : ''}
                                      </p>
                                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                        {getViewerKind(fileItem.display_name || '') !== 'unsupported' && (
                                          <button
                                            onClick={() => {
                                              const { data } = supabase.storage.from('student-attachments').getPublicUrl(fileItem.storage_path);
                                              setViewerFile({ url: data.publicUrl, name: fileItem.display_name || 'file' });
                                            }}
                                            title="미리보기"
                                            className="w-7 h-7 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-colors"
                                          >
                                            <ExternalLink size={12} />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleDownloadResult(fileItem)}
                                          title="다운로드"
                                          className="w-7 h-7 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-colors"
                                        >
                                          <Upload size={12} className="rotate-180" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* 기존 피드백 표시 */}
                              {teacherFeedback && (
                                <div className="mt-2 flex items-start justify-between gap-2 bg-indigo-50 rounded-lg px-2 py-1">
                                  <p className="text-xs font-bold text-indigo-600 flex-1">
                                    💬 선생님 피드백: {teacherFeedback}
                                  </p>
                                  <button
                                    onClick={() => handleDeleteResultFeedback(groupId)}
                                    disabled={savingResultFeedback}
                                    className="text-[10px] font-black text-indigo-400 hover:text-red-500 transition-colors shrink-0"
                                  >
                                    삭제
                                  </button>
                                </div>
                              )}
                              {/* 피드백 버튼 / 인라인 입력 */}
                              {feedbackResultId === groupId ? (
                                <div className="mt-2 space-y-1.5">
                                  <textarea
                                    value={resultFeedback}
                                    onChange={e => setResultFeedback(e.target.value)}
                                    placeholder="피드백 내용을 입력하세요..."
                                    className="w-full text-xs p-2.5 border border-indigo-200 rounded-xl resize-none bg-indigo-50 focus:outline-none focus:border-indigo-400"
                                    rows={2}
                                    autoFocus
                                  />
                                  <div className="flex gap-1.5">
                                    <button onClick={handleSaveResultFeedback} disabled={savingResultFeedback || !resultFeedback.trim()}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-black disabled:opacity-50 transition-all">
                                      {savingResultFeedback ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} 전송
                                    </button>
                                    <button onClick={() => { setFeedbackResultId(null); setResultFeedback(''); }}
                                      className="px-3 py-1.5 bg-neutral-100 text-neutral-500 rounded-lg text-xs font-black hover:bg-neutral-200 transition-all">
                                      취소
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setFeedbackResultId(groupId); setResultFeedback(firstItem.teacher_feedback || teacherFeedback || ''); }}
                                  className="mt-1.5 flex items-center gap-1 text-xs font-black text-indigo-500 hover:text-indigo-600 transition-colors"
                                >
                                  <MessageCircle size={10} /> {teacherFeedback ? '피드백 수정' : '피드백 남기기'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* 건의사항 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                      <Megaphone size={14} /> 질문·건의함
                    </h4>
                    <span className="text-xs font-black text-on-surface-variant/70 bg-surface-container px-2 py-0.5 rounded-md">
                      {suggestions.length}건
                    </span>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-primary" /></div>
                  ) : suggestions.length === 0 ? (
                    <div className="p-4 text-center border-2 border-dashed border-neutral-200 rounded-2xl">
                      <p className="text-xs font-bold text-neutral-400">등록된 질문·건의함 내용이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestions.map(s => {
                        const isReplying = replyingId === s.id;
                        return (
                          <div key={s.id} className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
                            {/* 학생 건의 내용 */}
                            <div className="flex items-start gap-3 p-3.5">
                              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-400 shrink-0">
                                <MessageSquare size={13} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-on-surface/85 leading-relaxed">{s.content}</p>
                                <p className="text-xs font-bold text-on-surface-variant/65 mt-1 flex items-center gap-1">
                                  <Clock size={9} />
                                  {new Date(s.created_at).toLocaleDateString('ko-KR')}
                                </p>
                              </div>
                            </div>

                            {/* 답변 영역 */}
                            {isReplying ? (
                              <div className="border-t border-neutral-100 bg-primary/[0.02] p-3.5 space-y-2">
                                <textarea
                                  value={replyText}
                                  onChange={e => setReplyText(e.target.value)}
                                  rows={3}
                                  autoFocus
                                  placeholder="학생에게 전달할 답변을 입력하세요..."
                                  className="w-full px-3 py-2 bg-white rounded-xl text-xs font-medium border border-neutral-200 focus:border-primary/40 focus:outline-none resize-none transition-all"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSaveReply(s.id)}
                                    disabled={savingReplyId === s.id || !replyText.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-black hover:bg-primary/80 disabled:opacity-50 transition-all"
                                  >
                                    {savingReplyId === s.id ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                                    답변 저장
                                  </button>
                                  <button
                                    onClick={() => { setReplyingId(null); setReplyText(''); }}
                                    className="px-3 py-1.5 text-neutral-500 rounded-lg text-xs font-black hover:bg-neutral-100 transition-all"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            ) : s.teacher_reply ? (
                              <div className="border-t border-primary/10 bg-primary/[0.03] p-3.5">
                                <div className="flex items-start gap-2">
                                  <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
                                    <Reply size={11} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-primary uppercase tracking-wider mb-1">선생님 답변</p>
                                    <p className="text-xs font-medium text-on-surface/85 leading-relaxed">{s.teacher_reply}</p>
                                    {s.replied_at && (
                                      <p className="text-xs font-bold text-on-surface-variant/65 mt-1 flex items-center gap-1">
                                        <Clock size={9} />
                                        {new Date(s.replied_at).toLocaleDateString('ko-KR')}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => { setReplyingId(s.id); setReplyText(s.teacher_reply); }}
                                    className="text-xs font-black text-primary/70 hover:text-primary transition-colors shrink-0 px-2 py-1 rounded-md hover:bg-primary/10"
                                  >
                                    수정
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="border-t border-neutral-100 px-3.5 py-2.5">
                                <button
                                  onClick={() => { setReplyingId(s.id); setReplyText(''); }}
                                  className="text-xs font-black text-primary/75 hover:text-primary flex items-center gap-1.5 transition-colors"
                                >
                                  <Reply size={11} /> 답변 작성
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
    )}
    <SubmissionViewerModal
      isOpen={!!viewerFile}
      onClose={() => setViewerFile(null)}
      fileUrl={viewerFile?.url || ''}
      fileName={viewerFile?.name || ''}
    />
  </>);
};

export default StudentDetailDrawer;
