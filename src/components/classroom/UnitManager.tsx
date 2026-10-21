import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Plus,
  ChevronRight,
  CheckCircle,
  Clock,
  Users,
  Pencil,
  Trash2,
  FileText,
  AlertCircle,
  X,
} from 'lucide-react';
import UnitCreateModal from './UnitCreateModal';
import { appConfirm } from '../../lib/appDialog';

interface Props {
  classId: string;
  teacherId: string;
}

const FORM_LABELS: Record<string, string> = {
  self_eval: '자기평가서',
  inquiry_reflection: '탐구소감문',
  performance_record: '수행평가 기술',
  reading_record: '독서기록'
};

const UnitManager = ({ classId, teacherId }: Props) => {
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<any>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, any[]>>({});
  const [submissionsLoading, setSubmissionsLoading] = useState<Record<string, boolean>>({});
  const [detailModal, setDetailModal] = useState<{ sub: any; unitTitle: string } | null>(null);

  useEffect(() => {
    fetchUnits();
  }, [classId]);

  const fetchUnits = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('units')
        .select('*')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      if (!error && data) setUnits(data);
    } catch (err) {
      console.error('Error fetching units:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async (unitId: string) => {
    setSubmissionsLoading(prev => ({ ...prev, [unitId]: true }));
    try {
      const { data, error } = await supabase
        .from('unit_submissions')
        .select('*, students(full_name, student_number)')
        .eq('unit_id', unitId)
        .order('submitted_at', { ascending: false })
        .select('id, student_id, unit_id, submitted_at, performance_record, inquiry_reflection, self_eval, reading_record_title, reading_record_author, reading_record_reflection, students(full_name, student_number)');
      if (!error && data) {
        setSubmissions(prev => ({ ...prev, [unitId]: data }));
      }
    } catch (err) {
      console.error('Error fetching submissions:', err);
    } finally {
      setSubmissionsLoading(prev => ({ ...prev, [unitId]: false }));
    }
  };

  const handleDeleteUnit = async (unitId: string, title: string) => {
    if (!await appConfirm(`"${title}" 단원을 삭제하시겠습니까? 학생 제출 데이터도 함께 삭제됩니다.`)) return;
    try {
      const { error } = await supabase.from('units').delete().eq('id', unitId);
      if (!error) fetchUnits();
    } catch (err) {
      console.error('Error deleting unit:', err);
    }
  };

  const handleCompleteUnit = async (unitId: string) => {
    if (!await appConfirm('이 단원을 마무리하면 학생들에게 마무리 서식 제출 알림이 표시됩니다. 계속하시겠습니까?')) return;
    try {
      const { error } = await supabase
        .from('units')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', unitId);
      if (!error) fetchUnits();
    } catch (err) {
      console.error('Error completing unit:', err);
    }
  };

  const handleToggleExpand = (unitId: string) => {
    if (expandedUnit === unitId) {
      setExpandedUnit(null);
    } else {
      setExpandedUnit(unitId);
      if (!submissions[unitId]) fetchSubmissions(unitId);
    }
  };

  const getEnabledForms = (formConfig: Record<string, boolean>) =>
    Object.entries(formConfig || {})
      .filter(([, v]) => v)
      .map(([k]) => FORM_LABELS[k])
      .filter(Boolean);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-24 bg-surface-container animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">단원 관리</h3>
          <p className="text-sm font-bold text-on-surface-variant mt-1">
            단원을 만들고 마무리 시 학생 서식 제출을 관리하세요.
          </p>
        </div>
        <button
          onClick={() => { setEditUnit(null); setIsCreateModalOpen(true); }}
          className="flex items-center gap-2 px-6 py-3 btn-gradient rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <Plus size={18} />
          새 단원
        </button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-4 p-5 bg-primary/5 border border-primary/10 rounded-2xl">
        <AlertCircle size={18} className="text-primary mt-0.5 shrink-0" />
        <p className="text-[14px] font-bold text-primary/70 leading-relaxed">
          단원을 <strong>마무리</strong>하면 학생들의 "단원 마무리" 탭에 서식이 표시됩니다.
          학생이 제출한 내용은 AI 세특 초안 생성 시 자동으로 활용됩니다.
        </p>
      </div>

      {/* Units List */}
      {units.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-4 text-on-surface-variant">
          <div className="w-20 h-20 bg-surface-container rounded-3xl flex items-center justify-center">
            <BookOpen size={40} className="opacity-30" />
          </div>
          <p className="font-bold text-lg">아직 만든 단원이 없습니다.</p>
          <p className="text-sm font-bold text-center leading-relaxed">
            단원을 만들면 학생들이 단원 마무리 서식을 제출할 수 있습니다.
          </p>
          <button
            onClick={() => { setEditUnit(null); setIsCreateModalOpen(true); }}
            className="mt-2 flex items-center gap-2 px-8 py-4 btn-gradient rounded-2xl font-bold text-sm shadow-lg shadow-primary/20"
          >
            <Plus size={18} /> 첫 단원 만들기
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {units.map(unit => {
            const enabledForms = getEnabledForms(unit.form_config || {});
            const submissionList = submissions[unit.id] || [];
            const isExpanded = expandedUnit === unit.id;
            const isLoading = submissionsLoading[unit.id];

            return (
              <motion.div
                key={unit.id}
                layout
                className={`rounded-2xl border-2 overflow-hidden transition-colors ${
                  unit.status === 'active'
                    ? 'border-primary/20 bg-primary/[0.02]'
                    : unit.status === 'completed'
                    ? 'border-secondary/20 bg-secondary/[0.02]'
                    : 'border-surface-container bg-surface-container-low'
                }`}
              >
                <div className="p-6 flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      unit.status === 'active'
                        ? 'bg-primary/10 text-primary'
                        : unit.status === 'completed'
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {unit.status === 'completed' ? <CheckCircle size={22} /> : <Clock size={22} />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h4 className="font-bold text-base">{unit.title}</h4>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[13px] font-bold  shrink-0 ${
                          unit.status === 'active'
                            ? 'bg-primary/10 text-primary'
                            : unit.status === 'completed'
                            ? 'bg-secondary/10 text-secondary'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        {unit.status === 'active' ? '진행 중' : unit.status === 'completed' ? '마무리됨' : '임시저장'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {enabledForms.map(form => (
                        <span
                          key={form}
                          className="text-[14px] font-bold text-on-surface-variant bg-white border border-surface-container px-2 py-0.5 rounded-md"
                        >
                          {form}
                        </span>
                      ))}
                      {enabledForms.length === 0 && (
                        <span className="text-[14px] font-bold text-on-surface-variant">서식 없음</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {unit.status === 'active' && (
                      <button
                        onClick={() => handleCompleteUnit(unit.id)}
                        className="px-4 py-2 bg-secondary text-white rounded-xl font-bold text-[14px] hover:bg-secondary/80 active:scale-95 transition-all shadow-sm"
                      >
                        단원 마무리
                      </button>
                    )}
                    {unit.status === 'completed' && (
                      <button
                        onClick={() => handleToggleExpand(unit.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold text-[14px] transition-all"
                      >
                        <Users size={14} />
                        제출 현황
                        <ChevronRight
                          size={14}
                          className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditUnit(unit); setIsCreateModalOpen(true); }}
                      className="w-9 h-9 rounded-xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-all"
                      title="수정"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteUnit(unit.id, unit.title)}
                      className="w-9 h-9 rounded-xl bg-surface-container hover:bg-error/10 hover:text-error flex items-center justify-center text-on-surface-variant transition-all"
                      title="삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Submissions Panel */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="border-t border-surface-container overflow-hidden"
                    >
                      <div className="p-6 bg-white space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-bold flex items-center gap-2">
                            <Users size={16} className="text-secondary" />
                            학생 제출 현황
                          </h5>
                          <span className="text-[14px] font-bold text-on-surface-variant bg-surface-container px-3 py-1 rounded-lg">
                            {submissionList.length}명 제출
                          </span>
                        </div>

                        {isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : submissionList.length === 0 ? (
                          <p className="text-sm font-bold text-on-surface-variant text-center py-6">
                            아직 제출한 학생이 없습니다.
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {submissionList.map(sub => {
                              const hasContent = sub.performance_record || sub.inquiry_reflection || sub.self_eval || sub.reading_record_title;
                              return (
                                <div
                                  key={sub.id}
                                  onClick={() => hasContent && setDetailModal({ sub, unitTitle: unit.title })}
                                  className={`flex items-center justify-between p-3 bg-surface-container-low rounded-xl transition-colors ${hasContent ? 'cursor-pointer hover:bg-surface-container hover:shadow-sm' : ''}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-secondary/10 text-secondary rounded-lg flex items-center justify-center">
                                      <FileText size={14} />
                                    </div>
                                    <div>
                                      <p className="font-bold text-sm">{sub.students?.full_name}</p>
                                      <p className="text-[14px] font-bold text-on-surface-variant">
                                        {sub.students?.student_number ? `${sub.students.student_number}번 · ` : ''}
                                        {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {hasContent && (
                                      <span className="text-[13px] font-bold text-primary hover:text-primary transition-colors">
                                        내용 보기 →
                                      </span>
                                    )}
                                    <span className="text-[14px] font-bold text-secondary bg-secondary/10 px-2 py-1 rounded-lg">
                                      제출 완료
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <UnitCreateModal
            classId={classId}
            teacherId={teacherId}
            onClose={() => { setIsCreateModalOpen(false); setEditUnit(null); }}
            onCreated={fetchUnits}
            editUnit={editUnit}
          />
        )}
      </AnimatePresence>

      {/* 제출 내용 상세 모달 */}
      <AnimatePresence>
        {detailModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDetailModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-start justify-between p-7 pb-4 border-b border-slate-200 dark:border-slate-700">
                <div>
                  <p className="text-[14px] font-bold text-primary  mb-1">{detailModal.unitTitle}</p>
                  <h3 className="text-lg font-bold">
                    {detailModal.sub.students?.student_number ? `${detailModal.sub.students.student_number}번 ` : ''}{detailModal.sub.students?.full_name}
                  </h3>
                  <p className="text-[14px] font-bold text-on-surface-variant mt-1 flex items-center gap-1">
                    <Clock size={11} />
                    {new Date(detailModal.sub.submitted_at).toLocaleString('ko-KR')} 제출
                  </p>
                </div>
                <button
                  onClick={() => setDetailModal(null)}
                  className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant transition-all mt-1"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 내용 */}
              <div className="px-7 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
                {detailModal.sub.performance_record && (
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-primary ">수행평가 활동 기술</p>
                    <div className="p-4 bg-primary/[0.03] rounded-xl border border-primary/10 text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap">
                      {detailModal.sub.performance_record}
                    </div>
                    <p className="text-[14px] font-bold text-on-surface-variant text-right">{detailModal.sub.performance_record.length}자</p>
                  </div>
                )}
                {detailModal.sub.inquiry_reflection && (
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-violet-600 ">탐구소감문</p>
                    <div className="p-4 bg-violet-50/40 rounded-xl border border-violet-100 text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap">
                      {detailModal.sub.inquiry_reflection}
                    </div>
                    <p className="text-[14px] font-bold text-on-surface-variant text-right">{detailModal.sub.inquiry_reflection.length}자</p>
                  </div>
                )}
                {detailModal.sub.self_eval && (
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-emerald-600 ">자기평가서</p>
                    <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap">
                      {detailModal.sub.self_eval}
                    </div>
                    <p className="text-[14px] font-bold text-on-surface-variant text-right">{detailModal.sub.self_eval.length}자</p>
                  </div>
                )}
                {detailModal.sub.reading_record_title && (
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-amber-600 ">독서기록</p>
                    <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100 space-y-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-bold text-on-surface">{detailModal.sub.reading_record_title}</span>
                        {detailModal.sub.reading_record_author && (
                          <span className="text-on-surface-variant/60 font-bold">— {detailModal.sub.reading_record_author}</span>
                        )}
                      </div>
                      {detailModal.sub.reading_record_reflection && (
                        <p className="text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap pt-2 border-t border-amber-100">
                          {detailModal.sub.reading_record_reflection}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-7 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                <button
                  onClick={() => setDetailModal(null)}
                  className="px-6 py-2.5 bg-surface-container hover:bg-surface-container-high rounded-xl font-bold text-sm text-on-surface-variant transition-all"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UnitManager;
