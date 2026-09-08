import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BANNER_THEMES } from '../components/classroom/SchoolProjectModal';
import {
  ArrowLeft, School, AlertCircle,
  Sparkles, ChevronRight
} from 'lucide-react';

const generateEntryCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const SchoolProjectNewPage = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [projectName, setProjectName] = useState('');
  const [schoolName, setSchoolName] = useState(profile?.school_name || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [bannerColor, setBannerColor] = useState('violet');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!projectName.trim() || !user) return;
    setSaving(true);
    try {
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

      const parentClassPayload: any = {
        name: `${schoolName.trim() || projectName.trim()} (전체)`,
        subject: projectName.trim(),
        teacher_id: user.id,
        entry_code: generateEntryCode(),
        school_project_id: proj.id,
      };
      await supabase.from('classes').insert(parentClassPayload);

      navigate(`/school-projects/${proj.id}/schools`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <button
        onClick={() => navigate('/classes')}
        className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> 대시보드로
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <School size={18} />
        </div>
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-wide mb-1">사업 관리 · 신규 생성</p>
          <h1 className="text-2xl font-black">학교 프로젝트 만들기</h1>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-3xl border border-surface-container-high p-8 space-y-5">
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
          <div
            className="w-full h-14 rounded-2xl mb-3 flex items-center px-5 gap-3 transition-all"
            style={{ background: `linear-gradient(135deg, ${BANNER_THEMES.find(t => t.key === bannerColor)?.from ?? '#7c3aed'}, ${BANNER_THEMES.find(t => t.key === bannerColor)?.to ?? '#6d28d9'})` }}
          >
            <School size={16} style={{ color: BANNER_THEMES.find(t => t.key === bannerColor)?.text ?? '#fff' }} />
            <span className="text-sm font-black" style={{ color: BANNER_THEMES.find(t => t.key === bannerColor)?.text ?? '#fff' }}>
              {projectName || '프로젝트 이름'}
            </span>
          </div>
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
          onClick={handleCreate}
          disabled={!projectName.trim() || !startDate || !endDate || saving}
          className="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-95 bg-primary hover:bg-primary-dim text-white"
        >
          {saving ? '생성 중...' : <><ChevronRight size={16} /> 만들기</>}
        </button>
      </div>
    </div>
  );
};

export default SchoolProjectNewPage;
