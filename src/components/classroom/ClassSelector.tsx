import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Plus, GraduationCap, Settings2, Trash2, Archive, ChevronDown, Check, School, SlidersHorizontal, Crown, Lock, X, Search } from 'lucide-react';

interface ClassSelectorProps {
  classes: any[];
  activeClassId: string | null;
  onSelectClass: (id: string) => void;
  onCreateClass: () => void;
  onEditClass: (classInfo: any) => void;
  onDeleteClass: (id: string) => void;
  onOpenArchive: () => void;
  onOpenClosedClasses: () => void;
  closedClassesCount?: number;
  schoolName?: string;
  onSchoolSettings?: () => void;
  currentUserId?: string;
}

// 수동 종료(is_closed) 또는 종료일(end_date) 경과 여부
const isClassClosed = (c: any) => {
  if (c.is_closed) return true;
  if (!c.end_date) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return c.end_date < today;
};

const ClassSelector = ({
  classes,
  activeClassId,
  onSelectClass,
  onCreateClass,
  onEditClass,
  onDeleteClass,
  onOpenArchive,
  onOpenClosedClasses,
  closedClassesCount = 0,
  schoolName,
  onSchoolSettings,
  currentUserId,
}: ClassSelectorProps) => {
  const [fullOpen, setFullOpen] = useState(false);
  const [query, setQuery] = useState('');
  const activeClass = classes.find(c => c.id === activeClassId);

  // 일반 학급 vs 학교 프로젝트 담당 학급 분리 — 종료된 학급(현재 보고 있는 학급 제외)은 메인 목록에서 숨김
  const regularClasses = classes.filter(c => !c.parent_class_id && (c.id === activeClassId || !isClassClosed(c)));
  const projectClasses = classes.filter(c => c.parent_class_id && (c.id === activeClassId || !isClassClosed(c)));

  // 전체화면 목록: Esc로 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!fullOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [fullOpen]);

  const closeFull = () => { setFullOpen(false); setQuery(''); };

  const q = query.trim().toLowerCase();
  const matchQuery = (c: any) => !q || `${c.name} ${c.subject || ''}`.toLowerCase().includes(q);
  const fullRegular = regularClasses.filter(matchQuery);
  const fullProject = projectClasses.filter(matchQuery);

  const renderFullCard = (c: any, isProject: boolean) => {
    const isActive = c.id === activeClassId;
    const canEdit = !isProject || c.teacher_id === currentUserId;
    const canDelete = !isProject || c.teacher_id === currentUserId;
    return (
      <div
        key={c.id}
        onClick={() => { onSelectClass(c.id); closeFull(); }}
        className={`group/card flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all hover:shadow-md ${
          isActive
            ? (isProject ? 'bg-violet-50 border-violet-300' : 'bg-primary/5 border-primary/30')
            : 'bg-surface-container-lowest border-surface-container-high hover:border-primary/30'
        }`}
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
          isActive ? (isProject ? 'bg-violet-500 text-white' : 'bg-primary text-white') : (isProject ? 'bg-violet-100 text-violet-500' : 'bg-primary/10 text-primary/70')
        }`}>
          {isProject ? <School size={20} /> : <GraduationCap size={20} strokeWidth={2.5} />}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`text-sm font-black tracking-tight truncate ${isActive ? (isProject ? 'text-violet-700' : 'text-primary') : 'text-on-surface'}`}>{c.name}</span>
          <span className={`text-[11px] font-black tracking-wider truncate ${isProject ? 'text-violet-400' : 'text-on-surface-variant/70'}`}>{c.subject}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isActive && <Check size={16} className={`${isProject ? 'text-violet-500' : 'text-primary'} mr-1`} />}
          {canEdit && !isProject && (
            <button title="학급 설정" onClick={(e) => { e.stopPropagation(); onEditClass(c); closeFull(); }} className="p-2 hover:bg-primary/10 rounded-lg text-on-surface-variant/60 hover:text-primary transition-all"><Settings2 size={15} /></button>
          )}
          {canDelete && (
            <button title="학급 삭제" onClick={(e) => { e.stopPropagation(); onDeleteClass(c.id); closeFull(); }} className="p-2 hover:bg-error/10 rounded-lg text-error/50 hover:text-error transition-all"><Trash2 size={15} /></button>
          )}
        </div>
      </div>
    );
  };

  return (
    <nav className="w-full bg-surface-container-lowest border-b border-surface-container-high px-3 sm:px-6 py-3 shrink-0 z-50 sticky top-0 shadow-soft">
      <div className="max-w-[1600px] mx-auto flex items-center gap-2 sm:gap-6">
        {/* Brand/Label */}
        <div className="hidden lg:flex flex-col items-start shrink-0 mr-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/70 leading-none">Classboard</span>
          <h2 className="text-xs font-black font-manrope text-on-surface tracking-tight mt-0.5">Management</h2>
        </div>

        <div className="w-px h-6 bg-on-surface/5 hidden lg:block" />

        {/* 현재 선택된 반 + 드롭다운 */}
        <div className="relative">
          <button
            onClick={() => setFullOpen(true)}
            className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2 sm:py-2.5 rounded-2xl shadow-sm transition-all group ${
              activeClass?.parent_class_id
                ? 'bg-violet-50 border border-violet-200 hover:bg-violet-100'
                : 'bg-primary/5 border border-primary/20 hover:bg-primary/10'
            }`}
          >
            <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-white flex items-center justify-center shrink-0 ${
              activeClass?.parent_class_id
                ? 'bg-violet-500 shadow-lg shadow-violet-200'
                : 'bg-primary shadow-lg shadow-primary/20'
            }`}>
              {activeClass?.parent_class_id ? <School size={18} /> : <GraduationCap size={18} strokeWidth={2.5} />}
            </div>

            {activeClass ? (
              <div className="flex flex-col items-start text-left min-w-0 max-w-[90px] sm:max-w-[180px]">
                <div className="flex items-center gap-1.5 min-w-0 w-full">
                  <span className="text-sm font-black tracking-tight text-on-surface truncate">
                    {activeClass.name}
                  </span>
                  {activeClass.parent_class_id && (
                    <span className="text-[9px] font-black bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full shrink-0">담당</span>
                  )}
                  {isClassClosed(activeClass) && (
                    <span className="flex items-center gap-0.5 text-[9px] font-black bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full shrink-0"><Lock size={9} />종료</span>
                  )}
                </div>
                <span className={`text-[11px] font-black uppercase tracking-[0.1em] whitespace-nowrap truncate w-full ${activeClass.parent_class_id ? 'text-violet-500' : 'text-primary/80'}`}>
                  {activeClass.subject}
                </span>
              </div>
            ) : (
              <span className="text-sm font-black text-on-surface-variant">반 선택</span>
            )}

            <ChevronDown
              size={16}
              className="text-primary/75 ml-1"
            />

            {/* active indicator */}
            <motion.div
              layoutId="active-nav-glow"
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]"
            />
          </button>
        </div>

        {/* 학급 수정 버튼 — 배정받은 담당 학급은 설정 불가, 프로젝트 생성자는 가능 */}
        {activeClass && (!activeClass.parent_class_id || activeClass.teacher_id === currentUserId) && (
          <button
            onClick={() => onEditClass(activeClass)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-neutral-200 hover:border-primary/30 hover:bg-primary/5 text-neutral-500 hover:text-primary font-black text-xs transition-all shadow-sm group shrink-0"
            title="학급 설정"
          >
            <Settings2 size={14} className="group-hover:rotate-90 transition-transform duration-300" />
            <span className="hidden sm:inline">학급 설정</span>
          </button>
        )}

        {/* 우측 여백 채우기 */}
        <div className="flex-1" />

        {/* 학교 이름 + 설정 버튼 */}
        {schoolName && (
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-2xl bg-surface-container border border-surface-container-high shrink-0">
            <School size={14} className="text-on-surface-variant/80 shrink-0" />
            <span className="text-xs font-black text-on-surface-variant truncate max-w-[140px]">{schoolName}</span>
            {onSchoolSettings && (
              <button
                onClick={onSchoolSettings}
                className="ml-1 p-1 rounded-lg hover:bg-primary/10 text-on-surface-variant/70 hover:text-primary transition-all"
                title="학교 설정"
              >
                <SlidersHorizontal size={13} />
              </button>
            )}
          </div>
        )}

        {/* Global Actions (드롭다운 외부에도 유지) */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            onClick={onOpenArchive}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white border border-white/60 hover:border-secondary/20 text-on-surface hover:text-secondary transition-all active:scale-90 group shadow-sm hover:shadow-soft flex items-center justify-center"
            title="아카이브함 열기"
          >
            <Archive size={16} className="group-hover:-translate-y-0.5 transition-transform" />
          </button>
          <button
            onClick={onCreateClass}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white border border-white/60 hover:border-primary/20 text-on-surface hover:text-primary transition-all active:scale-90 group shadow-sm hover:shadow-soft flex items-center justify-center"
            title="새 학급 추가"
          >
            <Plus size={16} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      </div>

      {/* 전체화면 학급 목록 — MainLayout의 main이 fixed를 가두므로 body로 포탈 */}
      {fullOpen && createPortal(
        <div className="fixed inset-0 z-[600] bg-surface flex flex-col">
          <div className="flex items-center gap-3 px-4 sm:px-8 py-4 border-b border-surface-container-high bg-surface-container-lowest shrink-0">
            <h2 className="text-lg font-black text-on-surface shrink-0">전체 학급 목록 <span className="text-primary">({classes.length})</span></h2>
            <div className="relative flex-1 max-w-md ml-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="학급 이름·과목 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-container text-sm font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1" />
            <button onClick={() => { onCreateClass(); closeFull(); }} className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/90 active:scale-95 transition-all shadow-md shadow-primary/20">
              <Plus size={14} strokeWidth={3} />새 학급 추가
            </button>
            <button onClick={() => { onOpenArchive(); closeFull(); }} className="p-2.5 rounded-xl bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" title="아카이브"><Archive size={16} /></button>
            <button onClick={closeFull} className="p-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant transition-all" title="닫기 (Esc)"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 custom-scrollbar">
            <div className="max-w-[1600px] mx-auto space-y-8">
              {fullRegular.length > 0 && (
                <section>
                  <p className="mb-3 text-[11px] font-black text-on-surface-variant/60 uppercase tracking-widest">내 학급 ({fullRegular.length})</p>
                  <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">{fullRegular.map(c => renderFullCard(c, false))}</div>
                </section>
              )}
              {fullProject.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-3"><Crown size={12} className="text-violet-500" /><p className="text-[11px] font-black text-violet-500 uppercase tracking-widest">학교 프로젝트 담당 ({fullProject.length})</p></div>
                  <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">{fullProject.map(c => renderFullCard(c, true))}</div>
                </section>
              )}
              {fullRegular.length === 0 && fullProject.length === 0 && (
                <p className="text-center text-sm font-bold text-on-surface-variant/60 py-20">검색 결과가 없습니다.</p>
              )}
              {closedClassesCount > 0 && (
                <button onClick={() => { onOpenClosedClasses(); closeFull(); }} className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black text-rose-500 bg-rose-50 hover:bg-rose-100 transition-all">
                  <Lock size={13} />종료된 학급 {closedClassesCount}개 보기
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
};

export default ClassSelector;
