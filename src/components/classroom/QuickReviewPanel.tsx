import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { generateFeedbackDraft } from '../../lib/gemini';
import {
  X, Sparkles, CheckCircle2, XCircle, Clock,
  AlertTriangle, Loader2, SkipForward, Link2, Paperclip,
} from 'lucide-react';
import AiCreditCost from '../common/AiCreditCost';

interface ReviewItem {
  id: string;
  type: 'obs' | 'result';
  studentId: string;
  studentName: string;
  studentNumber: string;
  classId: string;
  className: string;
  title: string;
  content: string;
  resultType?: string;
  linkUrl?: string;
  displayName?: string;
  submissionGroup?: string;
  createdAt: string;
  waitDays: number;
  aiConcern: boolean;
}

interface QuickReviewPanelProps {
  onClose: () => void;
  onCountChange: (count: number) => void;
}

function getWaitDays(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

function WaitBadge({ days }: { days: number }) {
  const label = days === 0 ? '오늘 제출' : days === 1 ? '1일 대기' : `${days}일 대기`;
  const cls = days >= 3
    ? 'text-red-600 bg-red-50 border-red-200'
    : days >= 1
      ? 'text-amber-600 bg-amber-50 border-amber-200'
      : 'text-emerald-600 bg-emerald-50 border-emerald-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg border ${cls}`}>
      <Clock size={10} />
      {label}
    </span>
  );
}

export default function QuickReviewPanel({ onClose, onCountChange }: QuickReviewPanelProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  const draftTargetIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = items[currentIdx] as ReviewItem | undefined;
  const remaining = Math.max(0, items.length - currentIdx);

  useEffect(() => { if (user?.id) fetchPendingItems(); }, [user?.id]);
  useEffect(() => {
    setFeedback('');
    setDraftLoading(false);
    draftTargetIdRef.current = null;
  }, [currentIdx]);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const showToast = (message: string, ok = true) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, ok });
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  };

  const fetchPendingItems = async () => {
    setLoading(true);
    try {
      const { data: classesData } = await supabase
        .from('classes')
        .select('id, name, students(id, full_name, student_number)')
        .eq('teacher_id', user!.id)
        .eq('is_archived', false);

      const studentMap: Record<string, { name: string; number: string; classId: string; className: string }> = {};
      const studentIds: string[] = [];

      for (const cls of (classesData || [])) {
        for (const s of (cls.students || []) as any[]) {
          studentMap[s.id] = { name: s.full_name, number: s.student_number, classId: cls.id, className: cls.name };
          studentIds.push(s.id);
        }
      }

      if (studentIds.length === 0) {
        setItems([]);
        onCountChange(0);
        return;
      }

      const [obsRes, resultsRes] = await Promise.all([
        supabase
          .from('observations')
          .select('id, activity_name, content, created_at, ai_concern, student_id')
          .in('student_id', studentIds)
          .eq('is_student_record', true)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(50),
        supabase
          .from('student_results')
          .select('id, title, text_content, result_type, link_url, display_name, created_at, student_id, submission_group')
          .in('student_id', studentIds)
          .or('status.is.null,status.eq.submitted')
          .order('created_at', { ascending: true })
          .limit(50),
      ]);

      const obsItems: ReviewItem[] = (obsRes.data || []).map(o => ({
        id: o.id,
        type: 'obs' as const,
        studentId: o.student_id,
        studentName: studentMap[o.student_id]?.name || '학생',
        studentNumber: studentMap[o.student_id]?.number || '',
        classId: studentMap[o.student_id]?.classId || '',
        className: studentMap[o.student_id]?.className || '',
        title: o.activity_name,
        content: o.content || '',
        createdAt: o.created_at,
        waitDays: getWaitDays(o.created_at),
        aiConcern: Boolean(o.ai_concern),
      }));

      // submission_group이 있는 row는 그룹의 첫 번째 row만 사용 (중복 카운트 방지)
      const seenResultGroups = new Set<string>();
      const resultItems: ReviewItem[] = [];
      for (const r of (resultsRes.data || [])) {
        const key = r.submission_group || r.id;
        if (seenResultGroups.has(key)) continue;
        seenResultGroups.add(key);
        resultItems.push({
          id: r.id,
          type: 'result' as const,
          studentId: r.student_id,
          studentName: studentMap[r.student_id]?.name || '학생',
          studentNumber: studentMap[r.student_id]?.number || '',
          classId: studentMap[r.student_id]?.classId || '',
          className: studentMap[r.student_id]?.className || '',
          title: r.title || '결과 제출물',
          content: r.text_content || '',
          resultType: r.result_type,
          linkUrl: r.link_url,
          displayName: r.display_name,
          submissionGroup: r.submission_group || undefined,
          createdAt: r.created_at,
          waitDays: getWaitDays(r.created_at),
          aiConcern: false,
        });
      }

      const merged = [...obsItems, ...resultItems].sort((a, b) => {
        if (a.aiConcern && !b.aiConcern) return -1;
        if (!a.aiConcern && b.aiConcern) return 1;
        return b.waitDays - a.waitDays;
      });

      setItems(merged);
      onCountChange(merged.length);
    } catch (err) {
      console.error('QuickReviewPanel fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    setFeedback('');
    const next = currentIdx + 1;
    onCountChange(Math.max(0, items.length - next));
    if (next >= items.length) {
      onClose();
    } else {
      setCurrentIdx(next);
    }
  };

  const handleApprove = async () => {
    if (!current || processing) return;
    setProcessing(true);
    try {
      await supabase.from('observations').update({ status: 'approved', teacher_feedback: null }).eq('id', current.id);
      await supabase.from('student_notifications').insert({
        student_id: current.studentId,
        class_id: current.classId,
        title: '활동 기록이 승인되었습니다 ✅',
        content: `"${current.title}"이 선생님께 승인되었습니다.`,
        type: 'approval',
        is_read: false,
      });
      showToast(`승인 완료: ${current.studentName} · ${current.title}`);
      goNext();
    } catch (err) {
      console.error('Approve error:', err);
      showToast('처리 중 오류가 발생했습니다', false);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!current || processing) return;
    setProcessing(true);
    try {
      const feedbackText = feedback.trim();
      await supabase.from('observations').update({
        status: 'rejected',
        teacher_feedback: feedbackText || null,
      }).eq('id', current.id);
      await supabase.from('student_notifications').insert({
        student_id: current.studentId,
        class_id: current.classId,
        title: '활동 기록이 반려되었습니다',
        content: feedbackText
          ? `"${current.title}" — ${feedbackText}`
          : `"${current.title}"이 반려되었습니다.`,
        type: 'rejection',
        is_read: false,
      });
      showToast(`반려 완료: ${current.studentName} · ${current.title}`);
      goNext();
    } catch (err) {
      console.error('Reject error:', err);
      showToast('처리 중 오류가 발생했습니다', false);
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveResult = async () => {
    if (!current || processing) return;
    setProcessing(true);
    try {
      const col = current.submissionGroup ? 'submission_group' : 'id';
      const val = current.submissionGroup || current.id;
      await supabase.from('student_results').update({ status: 'approved' }).eq(col, val);
      await supabase.from('student_notifications').insert({
        student_id: current.studentId,
        class_id: current.classId,
        title: '제출 결과가 확인되었습니다 ✅',
        content: `"${current.title}"이 선생님께 확인되었습니다.`,
        type: 'approval',
        is_read: false,
      });
      showToast(`승인 완료: ${current.studentName} · ${current.title}`);
      goNext();
    } catch (err) {
      console.error('ApproveResult error:', err);
      showToast('처리 중 오류가 발생했습니다', false);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectResult = async () => {
    if (!current || processing) return;
    setProcessing(true);
    try {
      const feedbackText = feedback.trim();
      const col = current.submissionGroup ? 'submission_group' : 'id';
      const val = current.submissionGroup || current.id;
      await supabase.from('student_results').update({
        status: 'rejected',
        rejection_feedback: feedbackText || null,
      }).eq(col, val);
      await supabase.from('student_notifications').insert({
        student_id: current.studentId,
        class_id: current.classId,
        title: '제출 결과가 반려되었습니다',
        content: feedbackText
          ? `"${current.title}" — ${feedbackText}`
          : `"${current.title}"이 반려되었습니다. 수정 후 재제출하세요.`,
        type: 'rejection',
        is_read: false,
      });
      showToast(`반려 완료: ${current.studentName} · ${current.title}`);
      goNext();
    } catch (err) {
      console.error('RejectResult error:', err);
      showToast('처리 중 오류가 발생했습니다', false);
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!current || draftLoading) return;
    setDraftLoading(true);
    const targetId = current.id;
    draftTargetIdRef.current = targetId;
    try {
      const contentForDraft = current.content || current.linkUrl || current.displayName || '';
      const draft = await generateFeedbackDraft(current.type, current.title, contentForDraft, current.classId);
      if (draftTargetIdRef.current === targetId) {
        setFeedback(draft.trim());
      }
    } catch (err) {
      console.error('Draft generation error:', err);
    } finally {
      if (draftTargetIdRef.current === targetId) {
        setDraftLoading(false);
      }
    }
  };

  const renderContentPreview = (item: ReviewItem) => {
    if (item.content) {
      return <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{item.content}</p>;
    }
    if (item.resultType === 'link' && item.linkUrl) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-blue-600">
          <Link2 size={12} />
          <span className="truncate">{item.linkUrl}</span>
        </div>
      );
    }
    if (item.displayName) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Paperclip size={12} />
          <span>{item.displayName}</span>
        </div>
      );
    }
    return <p className="text-xs text-gray-400 italic">(내용 없음)</p>;
  };

  if (!loading && items.length === 0) {
    return (
      <div className="fixed inset-0 z-[700] flex items-end justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          className="relative w-full max-w-lg bg-white rounded-t-3xl p-8 pb-12 shadow-2xl"
        >
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <CheckCircle2 size={30} className="text-emerald-500" />
            </div>
            <div>
              <h3 className="font-black text-lg text-gray-900">모두 완료!</h3>
              <p className="text-sm text-gray-500 mt-1">대기 중인 항목이 없습니다 🎉</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 bg-primary text-white rounded-2xl font-black text-sm active:scale-95 transition-transform"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[700] flex items-end justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl"
        style={{ maxHeight: '92dvh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div>
            <h2 className="font-black text-base text-gray-900">빠른 처리 큐</h2>
            {!loading && items.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {currentIdx + 1}/{items.length} · 남은 {remaining}건
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Progress bar */}
        {!loading && items.length > 0 && (
          <div className="px-5 pb-2">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                animate={{ width: `${(currentIdx / items.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key="toast"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className={`mx-5 mb-1 px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 ${
                toast.ok
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {toast.ok
                ? <CheckCircle2 size={14} className="shrink-0" />
                : <AlertTriangle size={14} className="shrink-0" />
              }
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 pb-10" style={{ maxHeight: 'calc(92dvh - 120px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">대기 항목 불러오는 중...</span>
            </div>
          ) : current ? (
            <div className="space-y-4">

              {/* Card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="bg-gray-50 rounded-2xl p-4 border border-gray-100"
                >
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <WaitBadge days={current.waitDays} />
                    <span className={`text-[11px] font-black px-2 py-1 rounded-lg border ${
                      current.type === 'obs'
                        ? 'text-blue-600 bg-blue-50 border-blue-200'
                        : 'text-violet-600 bg-violet-50 border-violet-200'
                    }`}>
                      {current.type === 'obs' ? '활동기록' : '결과제출'}
                    </span>
                    {current.aiConcern && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg border text-red-600 bg-red-50 border-red-200">
                        <AlertTriangle size={10} />
                        AI 주의
                      </span>
                    )}
                  </div>

                  {/* Student */}
                  <p className="text-[11px] text-gray-400 mb-1">
                    {current.className} · {current.studentNumber}번 {current.studentName}
                  </p>

                  {/* Title */}
                  <h3 className="font-black text-gray-900 text-sm mb-2 leading-tight">{current.title}</h3>

                  {/* Content */}
                  {renderContentPreview(current)}
                </motion.div>
              </AnimatePresence>

              {/* AI Draft button */}
              <button
                onClick={handleGenerateDraft}
                disabled={draftLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-black text-sm hover:bg-primary/5 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {draftLoading
                  ? <><Loader2 size={15} className="animate-spin" /> AI 초안 생성 중...</>
                  : <><Sparkles size={15} /> AI 피드백 초안 생성 <AiCreditCost feature="feedback_draft" /></>
                }
              </button>

              {/* Feedback textarea */}
              <div>
                <label className="text-xs font-black text-gray-400 mb-1.5 block">
                  피드백
                  <span className="text-gray-300 ml-1 font-medium">
                    (선택 — 반려 시 학생에게 전달)
                  </span>
                </label>
                <textarea
                  id="qr-feedback-input"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="반려 사유 또는 피드백을 입력하세요 (선택)..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white leading-relaxed"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={goNext}
                  disabled={processing}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-sm transition-all active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <SkipForward size={14} />
                  다음에
                </button>

                {current.type === 'obs' ? (
                  <>
                    <button
                      onClick={handleReject}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-sm transition-all active:scale-95 disabled:opacity-40"
                    >
                      {processing
                        ? <Loader2 size={14} className="animate-spin" />
                        : <XCircle size={14} />
                      }
                      반려
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition-all active:scale-95 disabled:opacity-40"
                    >
                      {processing
                        ? <Loader2 size={14} className="animate-spin" />
                        : <CheckCircle2 size={14} />
                      }
                      승인
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleRejectResult}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-black text-sm transition-all active:scale-95 disabled:opacity-40"
                    >
                      {processing
                        ? <Loader2 size={14} className="animate-spin" />
                        : <XCircle size={14} />
                      }
                      반려
                    </button>
                    <button
                      onClick={handleApproveResult}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition-all active:scale-95 disabled:opacity-40"
                    >
                      {processing
                        ? <Loader2 size={14} className="animate-spin" />
                        : <CheckCircle2 size={14} />
                      }
                      승인
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-4 py-12">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <CheckCircle2 size={30} className="text-emerald-500" />
              </div>
              <div>
                <h3 className="font-black text-lg text-gray-900">모두 완료!</h3>
                <p className="text-sm text-gray-500 mt-1">대기 중인 항목이 없습니다 🎉</p>
              </div>
              <button
                onClick={onClose}
                className="px-8 py-3 bg-primary text-white rounded-2xl font-black text-sm active:scale-95 transition-transform"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
