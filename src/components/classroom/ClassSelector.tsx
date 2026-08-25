import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, GraduationCap, Settings2, Trash2, Archive, ChevronDown, Check, School, SlidersHorizontal, Crown, Lock } from 'lucide-react';

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
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeClass = classes.find(c => c.id === activeClassId);

  // 일반 학급 vs 학교 프로젝트 담당 학급 분리 — 종료된 학급(현재 보고 있는 학급 제외)은 메인 목록에서 숨김
  const regularClasses = classes.filter(c => !c.parent_class_id && (c.id === activeClassId || !isClassClosed(c)));
  const projectClasses = classes.filter(c => c.parent_class_id && (c.id === activeClassId || !isClassClosed(c)));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onSelectClass(id);
    setOpen(false);
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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
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
              className={`text-primary/75 ml-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />

            {/* active indicator */}
            <motion.div
              layoutId="active-nav-glow"
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)]"
            />
          </button>

          {/* 드롭다운 메뉴 */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full left-0 mt-3 w-72 bg-surface-container-lowest rounded-2xl shadow-elevated border border-surface-container-high overflow-hidden z-[100]"
              >
                {/* 헤더 */}
                <div className="px-5 py-3 border-b border-surface-container-high">
                  <p className="text-xs font-black text-on-surface-variant/80 uppercase tracking-[0.2em]">
                    전체 학급 목록 ({classes.length})
                  </p>
                </div>

                {/* 학급 리스트 */}
                <div className="py-2 max-h-[360px] overflow-y-auto custom-scrollbar">
                  {/* 일반 학급 */}
                  {regularClasses.length > 0 && (
                    <>
                      {projectClasses.length > 0 && (
                        <p className="px-4 pt-1 pb-2 text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">내 학급</p>
                      )}
                      {regularClasses.map(c => {
                        const isActive = c.id === activeClassId;
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between px-4 py-3 mx-2 rounded-xl transition-all group/item ${
                              isActive ? 'bg-primary/5 border border-primary/15' : 'hover:bg-surface-container cursor-pointer'
                            }`}
                            onClick={() => !isActive && handleSelect(c.id)}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                isActive ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-primary/10 text-primary/70 group-hover/item:bg-primary/20'
                              }`}>
                                <GraduationCap size={16} strokeWidth={2.5} />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className={`text-sm font-black tracking-tight truncate ${isActive ? 'text-primary' : 'text-on-surface'}`}>{c.name}</span>
                                <span className="text-[11px] font-black uppercase tracking-wider text-on-surface-variant/70">{c.subject}</span>
                              </div>
                            </div>
                            {isActive ? (
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Check size={14} className="text-primary mr-1" />
                                <button onClick={(e) => { e.stopPropagation(); onEditClass(c); setOpen(false); }} className="p-1.5 hover:bg-primary/10 rounded-lg text-primary/70 hover:text-primary transition-all"><Settings2 size={14} /></button>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteClass(c.id); setOpen(false); }} className="p-1.5 hover:bg-error/10 rounded-lg text-error/60 hover:text-error transition-all"><Trash2 size={14} /></button>
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-neutral-200 group-hover/item:border-primary/30 transition-all shrink-0 ml-2" />
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* 학교 프로젝트 담당 학급 */}
                  {projectClasses.length > 0 && (
                    <>
                      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 border-t border-surface-container-high mt-1">
                        <Crown size={10} className="text-violet-500" />
                        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">학교 프로젝트 담당</p>
                      </div>
                      {projectClasses.map(c => {
                        const isActive = c.id === activeClassId;
                        return (
                          <div
                            key={c.id}
                            className={`flex items-center justify-between px-4 py-3 mx-2 rounded-xl transition-all group/item ${
                              isActive ? 'bg-violet-50 border border-violet-200' : 'hover:bg-violet-50/50 cursor-pointer'
                            }`}
                            onClick={() => !isActive && handleSelect(c.id)}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                                isActive ? 'bg-violet-500 text-white shadow-md shadow-violet-200' : 'bg-violet-100 text-violet-500 group-hover/item:bg-violet-200'
                              }`}>
                                <School size={15} />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className={`text-sm font-black tracking-tight truncate ${isActive ? 'text-violet-700' : 'text-on-surface'}`}>{c.name}</span>
                                <span className="text-[11px] font-black uppercase tracking-wider text-violet-400">{c.subject}</span>
                              </div>
                            </div>
                            {isActive ? (
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Check size={14} className="text-violet-500 mr-1" />
                                {/* 프로젝트 생성자(teacher_id)만 하위 클래스 삭제 가능 */}
                                {c.teacher_id === currentUserId && (
                                  <button onClick={(e) => { e.stopPropagation(); onDeleteClass(c.id); setOpen(false); }} className="p-1.5 hover:bg-error/10 rounded-lg text-error/60 hover:text-error transition-all" title="학급 삭제"><Trash2 size={14} /></button>
                                )}
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-violet-200 group-hover/item:border-violet-400 transition-all shrink-0 ml-2" />
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* 종료된 학급 바로가기 */}
                {closedClassesCount > 0 && (
                  <button
                    onClick={() => { onOpenClosedClasses(); setOpen(false); }}
                    className="flex items-center gap-2 w-[calc(100%-1rem)] mx-2 mt-1 px-4 py-2.5 rounded-xl text-xs font-black text-rose-500 bg-rose-50 hover:bg-rose-100 transition-all"
                  >
                    <Lock size={13} />
                    종료된 학급 {closedClassesCount}개 보기
                  </button>
                )}

                {/* 푸터 액션 */}
                <div className="px-4 py-3 border-t border-surface-container-high flex gap-2">
                  <button
                    onClick={() => { onCreateClass(); setOpen(false); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/90 active:scale-95 transition-all shadow-md shadow-primary/20"
                  >
                    <Plus size={14} strokeWidth={3} />
                    새 학급 추가
                  </button>
                  <button
                    onClick={() => { onOpenArchive(); setOpen(false); }}
                    className="px-4 py-2.5 bg-surface-container rounded-xl text-xs font-black text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all"
                    title="아카이브"
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
    </nav>
  );
};

export default ClassSelector;
