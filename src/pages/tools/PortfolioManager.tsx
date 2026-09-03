import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { generatePortfolioIntroDraft } from '../../lib/gemini';
import type { LessonPlanSections } from '../../lib/gemini';
import {
  Loader2, Check, Link2, Eye, EyeOff, Globe, Lock, Sparkles, BookOpen, ExternalLink,
} from 'lucide-react';

const SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;

const VISIBILITY_OPTIONS: { value: 'private' | 'link_only' | 'public'; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: 'private', label: '비공개', desc: '나만 볼 수 있습니다', icon: <Lock size={15} /> },
  { value: 'link_only', label: '링크 전용', desc: '링크를 아는 사람만 열람할 수 있습니다', icon: <Link2 size={15} /> },
  { value: 'public', label: '전체 공개', desc: '검색 엔진에도 노출됩니다', icon: <Globe size={15} /> },
];

interface ClassRow { id: string; name: string; subject: string | null; }
interface MaterialRow { id: string; class_id: string; }
interface PlanRow { id: string; class_id: string; sections: LessonPlanSections; created_at: string; }

interface PortfolioRow {
  slug: string;
  intro: string;
  visibility: 'private' | 'link_only' | 'public';
  included_class_ids: string[];
  showcase_plan_ids: Record<string, string>;
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

const PortfolioManager = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);

  const [slug, setSlug] = useState('');
  const [slugCheck, setSlugCheck] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [intro, setIntro] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'link_only' | 'public'>('private');
  const [includedClassIds, setIncludedClassIds] = useState<string[]>([]);
  const [showcasePlanIds, setShowcasePlanIds] = useState<Record<string, string>>({});
  const [plansByClass, setPlansByClass] = useState<Record<string, PlanRow[]>>({});
  const [generatingIntro, setGeneratingIntro] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: classData }, { data: portfolioData }] = await Promise.all([
        supabase.from('classes').select('id, name, subject').eq('teacher_id', user.id).eq('is_archived', false).order('created_at', { ascending: false }),
        supabase.from('teacher_portfolios').select('slug, intro, visibility, included_class_ids, showcase_plan_ids').eq('teacher_id', user.id).maybeSingle(),
      ]);
      setClasses((classData || []) as ClassRow[]);
      if (portfolioData) {
        const p = portfolioData as PortfolioRow;
        setSlug(p.slug);
        setSlugCheck('available');
        setIntro(p.intro);
        setVisibility(p.visibility);
        setIncludedClassIds(p.included_class_ids || []);
        setShowcasePlanIds(p.showcase_plan_ids || {});
      }
      setLoading(false);
    })();
  }, [user?.id]);

  // 선택된 클래스가 바뀔 때마다 해당 클래스들의 발행된 자료 수 + 저장된 수업계획서 목록을 불러온다
  useEffect(() => {
    if (!user || includedClassIds.length === 0) { setMaterials([]); setPlansByClass({}); return; }
    supabase
      .from('class_materials')
      .select('id, class_id')
      .in('class_id', includedClassIds)
      .eq('is_published', true)
      .then(({ data }) => setMaterials((data || []) as MaterialRow[]));
    supabase
      .from('lesson_plans')
      .select('id, class_id, sections, created_at')
      .eq('teacher_id', user.id)
      .in('class_id', includedClassIds)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const grouped: Record<string, PlanRow[]> = {};
        for (const p of (data || []) as PlanRow[]) {
          (grouped[p.class_id] ||= []).push(p);
        }
        setPlansByClass(grouped);
      });
  }, [user?.id, includedClassIds.join(',')]);

  const stats = useMemo(() => {
    const selectedClasses = classes.filter(c => includedClassIds.includes(c.id));
    const subjects = Array.from(new Set(selectedClasses.map(c => c.subject).filter((s): s is string => !!s)));
    return { classCount: selectedClasses.length, subjects, totalMaterials: materials.length };
  }, [classes, includedClassIds, materials]);

  const checkSlug = useCallback(async (value: string) => {
    if (!SLUG_PATTERN.test(value)) { setSlugCheck('invalid'); return; }
    setSlugCheck('checking');
    const { data } = await supabase.from('teacher_portfolios').select('teacher_id').eq('slug', value).maybeSingle();
    if (!data || data.teacher_id === user?.id) setSlugCheck('available');
    else setSlugCheck('taken');
  }, [user?.id]);

  const toggleClass = (id: string) => {
    setIncludedClassIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const setShowcasePlanForClass = (classId: string, planId: string) => {
    setShowcasePlanIds(prev => {
      const next = { ...prev };
      if (planId) next[classId] = planId; else delete next[classId];
      return next;
    });
  };

  const handleGenerateIntro = async () => {
    setGeneratingIntro(true);
    try {
      const showcaseTitles = classes
        .filter(c => showcasePlanIds[c.id])
        .map(c => (plansByClass[c.id] || []).find(p => p.id === showcasePlanIds[c.id])?.sections.basicInfo.unitTitle || c.name);
      const draft = await generatePortfolioIntroDraft(stats, showcaseTitles);
      setIntro(draft);
    } catch {
      alert('소개글 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setGeneratingIntro(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (slugCheck !== 'available' && slug) { alert('slug 중복 확인을 먼저 완료해주세요.'); return; }
    if (!SLUG_PATTERN.test(slug)) { alert('URL은 영문 소문자/숫자/하이픈으로 3~32자여야 합니다.'); return; }
    setSaving(true);
    const { error } = await supabase.from('teacher_portfolios').upsert({
      teacher_id: user.id,
      slug,
      intro,
      visibility,
      included_class_ids: includedClassIds,
      showcase_plan_ids: showcasePlanIds,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'teacher_id' });
    setSaving(false);
    if (error) { alert(`저장 중 오류가 발생했습니다: ${error.message}`); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!user) return null;
  if (loading) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>;

  const publicUrl = slug ? `${window.location.origin}/portfolio/${slug}` : '';

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-xs text-on-surface-variant">
        누적된 클래스·수업 자료를 자동 집계해 외부에 공유할 수 있는 포트폴리오 페이지를 만듭니다. 기본값은 전체 비공개이며, 직접 선택한 클래스/자료만 노출됩니다. 프로필 사진은 설정 화면에서 등록한 이미지가 자동으로 함께 표시됩니다.
      </p>

      {/* 1. slug */}
      <section className="glass rounded-2xl p-4 border border-white/40 space-y-2">
        <p className="font-black text-sm text-on-surface">공개 주소</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant shrink-0">{window.location.origin}/portfolio/</span>
          <input
            value={slug}
            onChange={e => { setSlug(e.target.value.toLowerCase()); setSlugCheck('idle'); }}
            onBlur={() => slug && checkSlug(slug)}
            placeholder="my-name"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-surface-container bg-surface-container-low/50 text-sm font-bold outline-none focus:border-primary/40"
          />
        </div>
        {slugCheck === 'checking' && <p className="text-xs text-on-surface-variant">확인 중…</p>}
        {slugCheck === 'available' && <p className="text-xs text-emerald-600 font-bold flex items-center gap-1"><Check size={12} /> 사용 가능한 주소입니다</p>}
        {slugCheck === 'taken' && <p className="text-xs text-red-500 font-bold">이미 사용 중인 주소입니다</p>}
        {slugCheck === 'invalid' && <p className="text-xs text-red-500 font-bold">영문 소문자/숫자/하이픈으로 3~32자여야 합니다</p>}
      </section>

      {/* 2. 공개범위 */}
      <section className="glass rounded-2xl p-4 border border-white/40 space-y-2">
        <p className="font-black text-sm text-on-surface">공개 범위</p>
        <div className="flex flex-col gap-1.5">
          {VISIBILITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setVisibility(opt.value)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${visibility === opt.value ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-surface-container-low'}`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${visibility === opt.value ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>{opt.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-on-surface">{opt.label}</p>
                <p className="text-xs text-on-surface-variant">{opt.desc}</p>
              </div>
              {visibility === opt.value && <Check size={15} className="text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </section>

      {/* 3. 클래스 선택 */}
      <section className="glass rounded-2xl p-4 border border-white/40 space-y-2">
        <p className="font-black text-sm text-on-surface">통계에 포함할 클래스</p>
        {classes.length === 0 ? (
          <p className="text-xs text-on-surface-variant py-4 text-center opacity-60">클래스가 없습니다</p>
        ) : (
          <div className="flex flex-col gap-1">
            {classes.map(cls => (
              <label key={cls.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-container-low cursor-pointer">
                <input type="checkbox" checked={includedClassIds.includes(cls.id)} onChange={() => toggleClass(cls.id)} className="accent-primary" />
                <BookOpen size={14} className="text-on-surface-variant shrink-0" />
                <span className="font-bold text-sm text-on-surface flex-1">{cls.name}</span>
                {cls.subject && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">{cls.subject}</span>}
              </label>
            ))}
          </div>
        )}
        {includedClassIds.length > 0 && (
          <div className="flex items-center gap-4 pt-2 border-t border-surface-container text-xs text-on-surface-variant">
            <span>클래스 {stats.classCount}개</span>
            <span>과목 {stats.subjects.join(', ') || '-'}</span>
            <span>자료 {stats.totalMaterials}건</span>
          </div>
        )}
      </section>

      {/* 4. 대표 수업 사례 — 클래스별로 공개할 수업계획서를 지정 */}
      <section className="glass rounded-2xl p-4 border border-white/40 space-y-2">
        <p className="font-black text-sm text-on-surface">대표 수업 사례</p>
        <p className="text-xs text-on-surface-variant">클래스별로 공개할 수업계획서를 고르면, 방문자가 "진행한 수업" 목록에서 그 클래스를 클릭했을 때 목차·학습목표·활동흐름을 볼 수 있습니다. (수업 자료 원문은 공개되지 않습니다)</p>
        {includedClassIds.length === 0 ? (
          <p className="text-xs text-on-surface-variant py-4 text-center opacity-60">위에서 클래스를 먼저 선택하세요</p>
        ) : (
          <div className="flex flex-col gap-2">
            {classes.filter(c => includedClassIds.includes(c.id)).map(cls => {
              const plans = plansByClass[cls.id] || [];
              return (
                <div key={cls.id} className="rounded-xl border border-surface-container p-3">
                  <p className="font-bold text-sm text-on-surface mb-2 truncate">{cls.name}</p>
                  {plans.length === 0 ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-on-surface-variant">아직 저장된 수업계획서가 없습니다.</p>
                      <a href="/teaching-tools?tool=lesson-plan" className="text-xs font-bold text-primary hover:underline shrink-0">계획서 만들기 →</a>
                    </div>
                  ) : (
                    <select
                      value={showcasePlanIds[cls.id] || ''}
                      onChange={e => setShowcasePlanForClass(cls.id, e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-surface-container bg-surface-container-low/50 text-sm outline-none focus:border-primary/40"
                    >
                      <option value="">공개하지 않음</option>
                      {plans.map(p => (
                        <option key={p.id} value={p.id}>{p.sections?.basicInfo?.unitTitle || '(제목 없음)'} · {formatDate(p.created_at)}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. 소개글 */}
      <section className="glass rounded-2xl p-4 border border-white/40 space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-black text-sm text-on-surface">소개글</p>
          <button
            onClick={handleGenerateIntro}
            disabled={generatingIntro}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs text-primary bg-primary/10 hover:bg-primary/15 transition-colors disabled:opacity-50"
          >
            {generatingIntro ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI 초안 생성
          </button>
        </div>
        <textarea
          value={intro}
          onChange={e => setIntro(e.target.value)}
          rows={5}
          placeholder="학교 담당자에게 보여줄 소개 문구를 직접 작성하거나 AI 초안을 생성해보세요."
          className="w-full px-3 py-2.5 rounded-xl border border-surface-container bg-surface-container-low/50 text-sm outline-none focus:border-primary/40 resize-none"
        />
      </section>

      {/* 6. 저장 */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
          {saved ? '저장됨' : '저장'}
        </button>
        {slug && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
            {visibility === 'private' ? <EyeOff size={13} /> : <Eye size={13} />} 공개 페이지 보기 <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
};

export default PortfolioManager;
