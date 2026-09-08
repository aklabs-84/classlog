import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import {
  X, School, AlertCircle,
  Sparkles, ChevronRight, Save, Check
} from 'lucide-react';

interface SchoolProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editProject?: any;
}

export const BANNER_THEMES = [
  { key: 'violet', label: '보라',    from: '#7c3aed', to: '#6d28d9', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'blue',   label: '파랑',    from: '#2563eb', to: '#4338ca', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'emerald',label: '초록',    from: '#059669', to: '#0d9488', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'rose',   label: '분홍',    from: '#e11d48', to: '#db2777', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'amber',  label: '주황',    from: '#d97706', to: '#b45309', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'sky',    label: '하늘',    from: '#0ea5e9', to: '#3b82f6', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'slate',  label: '슬레이트', from: '#475569', to: '#334155', text: '#ffffff', sub: 'rgba(255,255,255,0.65)' },
  { key: 'night',  label: '딥 네이비', from: '#1e1b4b', to: '#312e81', text: '#e0e7ff', sub: 'rgba(224,231,255,0.6)' },
  { key: 'forest', label: '딥 그린', from: '#14532d', to: '#166534', text: '#dcfce7', sub: 'rgba(220,252,231,0.6)' },
  { key: 'peach',  label: '피치',    from: '#fde68a', to: '#fdba74', text: '#78350f', sub: 'rgba(120,53,15,0.5)' },
];

const SchoolProjectModal = ({ isOpen, onClose, onSaved, editProject }: SchoolProjectModalProps) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bannerColor, setBannerColor] = useState('violet');
  const [saving, setSaving] = useState(false);
  const [savedInfo, setSavedInfo] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editProject) {
        setProjectName(editProject.name || '');
        setSchoolName(editProject.school_name || '');
        setStartDate(editProject.start_date || '');
        setEndDate(editProject.end_date || '');
        setBannerColor(editProject.banner_color || 'violet');
      } else {
        setProjectName('');
        setSchoolName(profile?.school_name || '');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setBannerColor('violet');
      }
    }
  }, [isOpen, editProject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const generateEntryCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  // 프로젝트 기본 정보 저장 → 신규 생성 시 관리자 대시보드로 즉시 이동
  const handleSaveInfo = async () => {
    if (!projectName.trim() || !user) return;
    setSaving(true);
    try {
      if (editProject) {
        // 편집: 기본 정보만 업데이트
        await supabase.from('school_projects').update({
          name: projectName.trim(),
          school_name: schoolName.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          banner_color: bannerColor,
        }).eq('id', editProject.id);
        setSavedInfo(true);
        setTimeout(() => setSavedInfo(false), 1500);
        onSaved();
        onClose();
        return;
      }

      // 신규 프로젝트 생성
      const { data: proj } = await supabase
        .from('school_projects')
        .insert({
          name: projectName.trim(),
          school_name: schoolName.trim() || null,
          admin_id: user.id,
          start_date: startDate || null,
          end_date: endDate || null,
          banner_color: bannerColor,
        })
        .select('id')
        .single();

      if (!proj) return;

      // 부모(전체) 클래스 자동 생성
      const parentClassPayload: any = {
        name: `${schoolName.trim() || projectName.trim()} (전체)`,
        subject: projectName.trim(),
        teacher_id: user.id,
        entry_code: generateEntryCode(),
        school_project_id: proj.id,
      };
      await supabase.from('classes').insert(parentClassPayload);

      onSaved();
      onClose();
      navigate(`/school-projects/${proj.id}/schools`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl bg-surface-container-lowest rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-surface-container-high"
          >
            {/* 헤더 */}
            <div className="px-8 py-6 flex items-center justify-between shrink-0 border-b border-surface-container-high">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <School size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-0.5">
                    {editProject ? '사업 관리 · 정보 수정' : '사업 관리 · 신규 생성'}
                  </p>
                  <h2 className="text-lg font-black text-on-surface">학교 프로젝트</h2>
                </div>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-8">
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest block mb-2">프로젝트 이름 *</label>
                    <input
                      type="text"
                      placeholder="예: 바이브코딩 수업"
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      className="w-full px-4 py-3.5 bg-surface-container rounded-2xl text-sm font-bold border-2 border-transparent focus:border-primary/30 focus:bg-surface-container-lowest outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest block mb-2">학교 이름</label>
                    <input
                      type="text"
                      placeholder="예: 대건고등학교"
                      value={schoolName}
                      onChange={e => setSchoolName(e.target.value)}
                      className="w-full px-4 py-3.5 bg-surface-container rounded-2xl text-sm font-bold border-2 border-transparent focus:border-primary/30 focus:bg-surface-container-lowest outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest block mb-2">수업 시작일 *</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full px-4 py-3.5 bg-surface-container rounded-2xl text-sm font-bold border-2 border-transparent focus:border-primary/30 focus:bg-surface-container-lowest outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest block mb-2">수업 종료일 *</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="w-full px-4 py-3.5 bg-surface-container rounded-2xl text-sm font-bold border-2 border-transparent focus:border-primary/30 focus:bg-surface-container-lowest outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* 배너 테마 */}
                  <div>
                    <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest block mb-3">공유 페이지 배너 색상</label>
                    {/* 미리보기 */}
                    <div
                      className="w-full h-14 rounded-2xl mb-3 flex items-center px-5 gap-3 transition-all"
                      style={{ background: `linear-gradient(135deg, ${BANNER_THEMES.find(t => t.key === bannerColor)?.from ?? '#7c3aed'}, ${BANNER_THEMES.find(t => t.key === bannerColor)?.to ?? '#6d28d9'})` }}
                    >
                      <School size={16} style={{ color: BANNER_THEMES.find(t => t.key === bannerColor)?.text ?? '#fff' }} />
                      <span className="text-sm font-black" style={{ color: BANNER_THEMES.find(t => t.key === bannerColor)?.text ?? '#fff' }}>
                        {projectName || '프로젝트 이름'}
                      </span>
                    </div>
                    {/* 팔레트 */}
                    <div className="flex flex-wrap gap-2">
                      {BANNER_THEMES.map(theme => (
                        <button
                          key={theme.key}
                          type="button"
                          onClick={() => setBannerColor(theme.key)}
                          title={theme.label}
                          className={`w-9 h-9 rounded-xl transition-all border-2 ${bannerColor === theme.key ? 'scale-110 border-gray-800 shadow-md' : 'border-transparent hover:scale-105'}`}
                          style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Pro 공유 안내 */}
                  <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                    <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-on-surface">Pro 크레딧 자동 공유</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        초대한 선생님들은 <strong>수업 기간 동안</strong> Pro 기능(AI, 화이트보드 등)을 무제한으로 사용할 수 있습니다.
                        수업 종료일 이후 자동으로 혜택이 만료됩니다.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-secondary/5 rounded-2xl border border-secondary/10 flex items-start gap-3">
                    <AlertCircle size={16} className="text-secondary mt-0.5 shrink-0" />
                    <p className="text-xs text-on-surface-variant">
                      주차/자료/퀴즈/화이트보드를 이 프로젝트에서 등록하면 <strong>모든 반 클래스에 자동 적용</strong>됩니다.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveInfo}
                    disabled={!projectName.trim() || !startDate || !endDate || saving}
                    className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-95 ${
                      savedInfo
                        ? 'bg-emerald-500 text-white'
                        : 'bg-primary hover:bg-primary-dim text-white'
                    }`}
                  >
                    {saving ? '저장 중...'
                      : savedInfo ? <><Check size={16} /> 저장됨!</>
                      : editProject
                        ? <><Save size={16} /> 변경 내용 저장</>
                        : <><ChevronRight size={16} /> 만들기</>
                    }
                  </button>
                </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SchoolProjectModal;
