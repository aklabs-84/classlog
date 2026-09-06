import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Trash2, Shuffle, ChevronDown, X,
  Maximize2, Minimize2, Crown, RefreshCw, Check,
  UserPlus, Download, Copy, CheckCheck, Layers, Target,
  Save, Loader2, History,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { regenerateClassGroups } from '../../lib/groupRegenerate';
import { useScrollLock } from '../../hooks/useScrollLock';

interface Student {
  id: string;
  name: string;
  number: string;
}

interface Group {
  id: number;
  name: string;
  members: Student[];
  leader: Student | null;
}

interface PickHistoryEntry {
  id: string;
  created_at: string;
  groups: { name: string; leader: string | null; members: string[] }[];
}

const PRESET_GROUP_NAMES = ['1조', '2조', '3조', '4조', '5조', '6조', '7조', '8조', '9조', '10조'];

const GroupPicker = () => {
  const { user } = useAuth();

  // 모드: 랜덤 분배 vs 저장된 조 뽑기
  const [mode, setMode] = useState<'random' | 'saved'>('random');

  // 학생 목록
  const [students, setStudents] = useState<Student[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [newStudentName, setNewStudentName] = useState('');

  // 클래스 불러오기
  const [classes, setClasses] = useState<any[]>([]);
  const [loadingClass, setLoadingClass] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);

  // 설정
  const [splitMode, setSplitMode] = useState<'groups' | 'members'>('groups');
  const [groupCount, setGroupCount] = useState(4);
  const [memberCount, setMemberCount] = useState(4);
  const [autoLeader, setAutoLeader] = useState(true);

  // 결과
  const [groups, setGroups] = useState<Group[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [revealedGroups, setRevealedGroups] = useState<Set<number>>(new Set());

  // 전체화면 발표 모드
  const [presentMode, setPresentMode] = useState(false);

  // 저장 기능
  const [copied, setCopied] = useState(false);

  // 클래스 적용
  const [loadedClassId, setLoadedClassId] = useState<string | null>(null);
  const [loadedClassName, setLoadedClassName] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);

  // 클래스별 뽑기 이력
  const [pickHistory, setPickHistory] = useState<PickHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleSaveImage = () => {
    if (groups.length === 0) return;

    const SCALE = 2;
    const COLS = Math.min(groups.length, 4);
    const ROWS = Math.ceil(groups.length / COLS);
    const MAX_MEMBERS = Math.max(...groups.map(g => g.members.length));
    const CARD_W = 240 * SCALE;
    const CARD_H = (100 + MAX_MEMBERS * 36) * SCALE;
    const GAP = 20 * SCALE;
    const HEADER = 80 * SCALE;

    const canvas = document.createElement('canvas');
    canvas.width = COLS * CARD_W + (COLS + 1) * GAP;
    canvas.height = ROWS * CARD_H + (ROWS + 1) * GAP + HEADER;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 배경
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 제목
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${28 * SCALE}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('🎯 조 편성 결과', GAP, 52 * SCALE);

    const emojis = ['🔵', '🔴', '🟢', '🟡', '🟣', '🟠', '⚫', '⚪'];

    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    };

    groups.forEach((group, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GAP + col * (CARD_W + GAP);
      const y = HEADER + GAP + row * (CARD_H + GAP);

      // 카드 배경
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rr(x, y, CARD_W, CARD_H, 16 * SCALE);
      ctx.fill();

      // 이모지
      ctx.font = `${30 * SCALE}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(emojis[group.id % 8], x + CARD_W / 2, y + 38 * SCALE);

      // 조 이름
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${18 * SCALE}px sans-serif`;
      ctx.fillText(group.name, x + CARD_W / 2, y + 62 * SCALE);

      // 인원수
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `${11 * SCALE}px sans-serif`;
      ctx.fillText(`${group.members.length}명`, x + CARD_W / 2, y + 80 * SCALE);

      // 멤버
      ctx.textAlign = 'left';
      group.members.forEach((member, mi) => {
        const isLeader = group.leader?.id === member.id;
        const my = y + 96 * SCALE + mi * 36 * SCALE;

        ctx.fillStyle = isLeader ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)';
        rr(x + 12 * SCALE, my, CARD_W - 24 * SCALE, 28 * SCALE, 7 * SCALE);
        ctx.fill();

        ctx.fillStyle = isLeader ? '#fbbf24' : '#ffffff';
        ctx.font = `${isLeader ? 'bold ' : ''}${13 * SCALE}px sans-serif`;
        ctx.fillText(isLeader ? `👑 ${member.name}` : member.name, x + 22 * SCALE, my + 19 * SCALE);
      });
    });

    const link = document.createElement('a');
    link.download = `조편성_결과_${new Date().toLocaleDateString('ko-KR').replace(/[\s.]/g, '')}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyText = () => {
    const text = groups.map(g => {
      const leader = g.leader ? `(조장: ${g.leader.name})` : '';
      const members = g.members.map(m => m.name).join(', ');
      return `${g.name} ${leader}\n${members}`;
    }).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    if (user) fetchClasses();
  }, [user?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 발표 모드일 때 body 스크롤 잠금
  useScrollLock(presentMode);

  const fetchClasses = async () => {
    const { data: ownData } = await supabase
      .from('classes').select('id, name, class_type')
      .eq('teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
    let assignedData: any[] = [];
    try {
      const { data } = await supabase.from('classes').select('id, name, class_type')
        .eq('assigned_teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
      assignedData = data || [];
    } catch (_e) {}
    const seen = new Set<string>();
    const combined = [...(ownData || []), ...assignedData].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (combined.length > 0) setClasses(combined);
  };

  const loadClassStudents = async (classId: string, className: string) => {
    setLoadingClass(true);
    setClassDropdownOpen(false);
    setLoadedClassId(classId);
    setLoadedClassName(className);
    const { data } = await supabase
      .from('students')
      .select('id, full_name, student_number')
      .eq('class_id', classId)
      .order('student_number', { ascending: true });
    if (data) {
      const merged = [...students];
      data.forEach((s) => {
        if (!merged.find((m) => m.id === s.id)) {
          merged.push({ id: s.id, name: s.full_name, number: s.student_number ?? '' });
        }
      });
      setStudents(merged);
    }
    setLoadingClass(false);
    loadPickHistory(classId);
  };

  const loadPickHistory = async (classId: string) => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('group_pick_history')
      .select('id, created_at, groups')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(30);
    setPickHistory(data || []);
    setHistoryLoading(false);
  };

  const savePickHistory = async (result: Group[]) => {
    if (!loadedClassId) return;
    const snapshot = result.map((g) => ({
      name: g.name,
      leader: g.leader?.name ?? null,
      members: g.members.map((m) => m.name),
    }));
    const { error } = await supabase.from('group_pick_history').insert({
      teacher_id: user!.id,
      class_id: loadedClassId,
      class_name: loadedClassName,
      groups: snapshot,
    });
    if (!error) loadPickHistory(loadedClassId);
  };

  const deletePickHistory = async (id: string) => {
    setPickHistory((prev) => prev.filter((h) => h.id !== id));
    await supabase.from('group_pick_history').delete().eq('id', id);
  };

  const addManualStudents = () => {
    const lines = manualInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const newStudents: Student[] = lines.map((name, i) => ({
      id: `manual-${Date.now()}-${i}`,
      name,
      number: String(students.length + i + 1),
    }));
    setStudents((prev) => [...prev, ...newStudents]);
    setManualInput('');
  };

  const addSingleStudent = () => {
    if (!newStudentName.trim()) return;
    setStudents((prev) => [
      ...prev,
      { id: `manual-${Date.now()}`, name: newStudentName.trim(), number: String(prev.length + 1) },
    ]);
    setNewStudentName('');
  };

  const removeStudent = (id: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const clearAll = () => {
    setStudents([]);
    setGroups([]);
    setShowResult(false);
    setRevealedGroups(new Set());
  };

  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pickGroups = useCallback(async () => {
    if (students.length < 2) return;

    setIsPicking(true);
    setShowResult(false);
    setRevealedGroups(new Set());
    setGroups([]);

    await new Promise((r) => setTimeout(r, 2200));

    const shuffled = shuffle(students);
    const numGroups =
      splitMode === 'groups'
        ? groupCount
        : Math.ceil(shuffled.length / memberCount);

    const result: Group[] = Array.from({ length: numGroups }, (_, i) => ({
      id: i,
      name: PRESET_GROUP_NAMES[i] ?? `${i + 1}조`,
      members: [],
      leader: null,
    }));

    shuffled.forEach((student, idx) => {
      result[idx % numGroups].members.push(student);
    });

    if (autoLeader) {
      result.forEach((g) => {
        if (g.members.length > 0) {
          g.leader = g.members[Math.floor(Math.random() * g.members.length)];
        }
      });
    }

    setGroups(result);
    setIsPicking(false);
    setShowResult(true);
    if (loadedClassId) savePickHistory(result);

    // 조별 순차 공개
    for (let i = 0; i < result.length; i++) {
      await new Promise((r) => setTimeout(r, 400 * i));
      setRevealedGroups((prev) => new Set([...prev, i]));
    }
  }, [students, splitMode, groupCount, memberCount, autoLeader, loadedClassId, loadedClassName]);

  const reshuffle = () => {
    setShowResult(false);
    setRevealedGroups(new Set());
    setTimeout(pickGroups, 100);
  };

  const handleApplyToClass = async () => {
    if (!loadedClassId || groups.length === 0) return;
    if (!confirm(`"${loadedClassName}" 클래스의 조 편성을 현재 결과로 교체할까요? (같은 이름의 조는 유지되고, 이전 제출 기록은 그대로 보존됩니다)`)) return;

    setApplyLoading(true);

    const desiredGroups = groups.map((g, i) => ({
      name: g.name,
      color: ROULETTE_COLORS[i % ROULETTE_COLORS.length],
      sort_order: i,
    }));

    const assignments = groups.flatMap(g =>
      g.members
        .filter(m => !m.id.startsWith('manual-'))
        .map(m => ({ studentId: m.id, groupName: g.name }))
    );

    await regenerateClassGroups(loadedClassId, desiredGroups, assignments);

    setApplyLoading(false);
    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 3000);
  };

  const numGroups =
    splitMode === 'groups'
      ? groupCount
      : Math.ceil(students.length / Math.max(memberCount, 1));

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* 모드 전환 탭 */}
        <div className="flex items-center gap-1 p-1 bg-surface-container/50 rounded-2xl w-fit border border-white/40 shadow-soft">
          <button
            onClick={() => setMode('random')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-all ${mode === 'random' ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
          >
            <Shuffle size={15} />
            랜덤 조 편성
          </button>
          <button
            onClick={() => setMode('saved')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-all ${mode === 'saved' ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
          >
            <Target size={15} />
            저장된 조 뽑기
          </button>
        </div>

        {/* 저장된 조 뽑기 모드 */}
        {mode === 'saved' && <SavedGroupPicker userId={user?.id ?? ''} />}

        {/* 랜덤 조 편성 모드 */}
        {mode === 'random' && <>

        {/* 발표 모드 버튼 */}
        {showResult && (
          <div className="flex justify-end">
            <button
              onClick={() => setPresentMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-md"
            >
              <Maximize2 size={16} />
              발표 모드
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: 학생 목록 */}
          <div className="glass rounded-2xl p-5 border border-white/40 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-on-surface flex items-center gap-2">
                <Users size={18} className="text-primary" />
                학생 목록
                <span className="ml-1 text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {students.length}명
                </span>
              </h3>
              {students.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-error/60 hover:text-error flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={13} />
                  전체 삭제
                </button>
              )}
            </div>

            {/* 클래스에서 불러오기 */}
            <div className="relative">
              <button
                onClick={() => setClassDropdownOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/40 bg-surface-container-low/50 text-sm font-bold hover:border-primary/30 transition-all"
              >
                <span className="text-on-surface-variant">
                  {loadingClass ? '불러오는 중...' : '클래스에서 학생 불러오기'}
                </span>
                <ChevronDown size={16} className={`transition-transform ${classDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {classDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-white/40 z-50 overflow-hidden"
                  >
                    {classes.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-on-surface-variant">클래스가 없습니다</div>
                    ) : (
                      classes.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => loadClassStudents(c.id, c.name)}
                          className="w-full text-left px-4 py-2.5 text-sm font-bold hover:bg-primary/5 transition-colors flex items-center gap-2"
                        >
                          <Users size={14} className="text-primary/60" />
                          {c.name}
                          <span className="ml-auto text-[10px] text-on-surface-variant/60 font-normal">
                            {c.class_type === 'homeroom' ? '담임' : '과목'}
                          </span>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 직접 입력 */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-on-surface-variant">직접 입력</p>
              <div className="flex gap-2">
                <input
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) addSingleStudent();
                  }}
                  placeholder="이름 입력 후 Enter"
                  className="flex-1 px-3 py-2 rounded-xl border border-white/40 bg-surface-container-low/50 text-sm font-bold focus:outline-none focus:border-primary/40 transition-all"
                />
                <button
                  onClick={addSingleStudent}
                  className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all"
                >
                  <Plus size={16} strokeWidth={3} />
                </button>
              </div>
              <textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder={"여러 명 한번에 입력\n(한 줄에 한 명씩)"}
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-white/40 bg-surface-container-low/50 text-sm resize-none focus:outline-none focus:border-primary/40 transition-all"
              />
              {manualInput.trim() && (
                <button
                  onClick={addManualStudents}
                  className="w-full py-2 bg-primary/10 text-primary rounded-xl text-sm font-bold hover:bg-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus size={15} />
                  추가하기
                </button>
              )}
            </div>

            {/* 학생 목록 */}
            {students.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                <AnimatePresence>
                  {students.map((s) => (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low/50 group"
                    >
                      <span className="text-sm font-bold text-on-surface">
                        <span className="text-on-surface-variant/50 text-xs mr-1.5">{s.number}</span>
                        {s.name}
                      </span>
                      <button
                        onClick={() => removeStudent(s.id)}
                        className="opacity-0 group-hover:opacity-100 text-error/50 hover:text-error transition-all"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* RIGHT: 설정 */}
          <div className="glass rounded-2xl p-5 border border-white/40 space-y-5">
            <h3 className="font-black text-on-surface">조 구성 설정</h3>

            {/* 분리 방식 */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-on-surface-variant">분리 방식</p>
              <div className="grid grid-cols-2 gap-2">
                {(['groups', 'members'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSplitMode(mode)}
                    className={`py-2.5 rounded-xl text-sm font-black transition-all border ${
                      splitMode === mode
                        ? 'bg-primary text-white border-primary shadow-md'
                        : 'border-white/40 text-on-surface-variant hover:border-primary/30'
                    }`}
                  >
                    {mode === 'groups' ? '조 개수로 나누기' : '조원 수로 나누기'}
                  </button>
                ))}
              </div>
            </div>

            {/* 슬라이더 */}
            {splitMode === 'groups' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-on-surface-variant">조 개수</p>
                  <span className="text-2xl font-black gradient-text">{groupCount}조</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={Math.max(2, students.length)}
                  value={groupCount}
                  onChange={(e) => setGroupCount(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-on-surface-variant/50">
                  <span>2조</span>
                  <span>{Math.max(2, students.length)}조</span>
                </div>
                {students.length > 0 && (
                  <p className="text-xs text-center text-on-surface-variant">
                    조당 약 <strong>{Math.ceil(students.length / groupCount)}명</strong>
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-on-surface-variant">조원 수</p>
                  <span className="text-2xl font-black gradient-text">{memberCount}명</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={Math.max(2, students.length)}
                  value={memberCount}
                  onChange={(e) => setMemberCount(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                {students.length > 0 && (
                  <p className="text-xs text-center text-on-surface-variant">
                    총 <strong>{Math.ceil(students.length / memberCount)}개 조</strong> 구성
                  </p>
                )}
              </div>
            )}

            {/* 조장 자동 지정 */}
            <div
              onClick={() => setAutoLeader((v) => !v)}
              className="flex items-center justify-between p-3 rounded-xl border border-white/40 cursor-pointer hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-2">
                <Crown size={16} className="text-amber-500" />
                <div>
                  <p className="text-sm font-bold">조장 자동 지정</p>
                  <p className="text-[10px] text-on-surface-variant">랜덤으로 조장 1명 자동 선정</p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-all duration-300 flex items-center px-1 ${autoLeader ? 'bg-primary justify-end' : 'bg-on-surface/10 justify-start'}`}>
                <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </div>

            {/* 미리보기 */}
            {students.length > 0 && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                <p className="text-xs text-on-surface-variant">
                  <strong className="text-on-surface">{students.length}명</strong>을{' '}
                  <strong className="text-primary">{numGroups}개 조</strong>로 나눕니다
                </p>
              </div>
            )}

            {/* 뽑기 버튼 */}
            <button
              onClick={pickGroups}
              disabled={students.length < 2 || isPicking}
              className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 ${
                students.length < 2 || isPicking
                  ? 'bg-on-surface/10 text-on-surface-variant cursor-not-allowed'
                  : 'btn-vibrant shadow-lg active:scale-95'
              }`}
            >
              {isPicking ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.5, ease: 'linear' }}
                  >
                    <Shuffle size={22} />
                  </motion.div>
                  조 뽑는 중...
                </>
              ) : (
                <>
                  <Shuffle size={22} />
                  랜덤 조 뽑기!
                </>
              )}
            </button>
          </div>
        </div>

        {/* 뽑기 애니메이션 */}
        <AnimatePresence>
          {isPicking && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <div className="text-center space-y-6">
                <motion.div
                  animate={{ rotate: [0, 15, -15, 10, -10, 5, -5, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="text-8xl"
                >
                  🎲
                </motion.div>
                <motion.p
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="text-white text-2xl font-black tracking-tight"
                >
                  조를 뽑는 중...
                </motion.p>
                <div className="flex gap-2 justify-center">
                  {students.slice(0, Math.min(6, students.length)).map((s, i) => (
                    <motion.div
                      key={s.id}
                      animate={{ y: [-8, 8, -8] }}
                      transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
                      className="px-3 py-1.5 bg-white/20 backdrop-blur rounded-lg text-white text-sm font-bold"
                    >
                      {s.name}
                    </motion.div>
                  ))}
                  {students.length > 6 && (
                    <div className="px-3 py-1.5 bg-white/20 backdrop-blur rounded-lg text-white text-sm font-bold">
                      +{students.length - 6}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 결과 */}
        <AnimatePresence>
          {showResult && groups.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xl font-black gradient-text flex items-center gap-2">
                  <Check size={22} className="text-green-500" />
                  조 편성 결과
                </h3>
                <div className="flex items-center gap-2">
                  {loadedClassId && (
                    <button
                      onClick={handleApplyToClass}
                      disabled={applyLoading}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60 ${
                        applySuccess
                          ? 'bg-emerald-500 text-white'
                          : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                      }`}
                    >
                      {applyLoading ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : applySuccess ? (
                        <Check size={15} />
                      ) : (
                        <Save size={15} />
                      )}
                      {applySuccess ? '적용 완료!' : `"${loadedClassName}"에 적용`}
                    </button>
                  )}
                  <button
                    onClick={reshuffle}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/40 text-sm font-bold hover:border-primary/30 hover:text-primary transition-all"
                  >
                    <RefreshCw size={15} />
                    다시 뽑기
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((group) => (
                  <AnimatePresence key={group.id}>
                    {revealedGroups.has(group.id) && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.7, rotateY: 90 }}
                        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="glass rounded-2xl p-4 border border-white/40 space-y-3"
                      >
                        <div className="text-center">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: 'spring' }}
                            className="text-3xl mb-1"
                          >
                            {['🔵', '🔴', '🟢', '🟡', '🟣', '🟠', '⚫', '⚪'][group.id % 8]}
                          </motion.div>
                          <h4 className="font-black text-on-surface text-lg">{group.name}</h4>
                          <p className="text-xs text-on-surface-variant">{group.members.length}명</p>
                        </div>

                        <div className="space-y-1">
                          {group.members.map((member) => (
                            <div
                              key={member.id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
                                group.leader?.id === member.id
                                  ? 'bg-amber-50 border border-amber-200'
                                  : 'bg-surface-container-low/50'
                              }`}
                            >
                              {group.leader?.id === member.id && (
                                <Crown size={12} className="text-amber-500 shrink-0" />
                              )}
                              <span className="font-bold text-on-surface truncate">{member.name}</span>
                              {group.leader?.id === member.id && (
                                <span className="ml-auto text-[9px] text-amber-600 font-black shrink-0">조장</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 클래스별 뽑기 이력 */}
        {loadedClassId && (
          <div className="glass rounded-2xl p-5 border border-white/40 space-y-3">
            <h3 className="font-black text-on-surface flex items-center gap-2">
              <History size={18} className="text-primary" />
              "{loadedClassName}" 뽑기 이력
              {pickHistory.length > 0 && (
                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {pickHistory.length}건
                </span>
              )}
            </h3>
            {historyLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-primary" />
              </div>
            ) : pickHistory.length === 0 ? (
              <p className="text-xs text-on-surface-variant/50 text-center py-4">
                이 클래스에서 뽑은 이력이 아직 없습니다.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {pickHistory.map((h) => (
                  <div key={h.id} className="p-3 rounded-xl bg-surface-container-low/50 border border-white/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold text-on-surface-variant/60">
                        {new Date(h.created_at).toLocaleString('ko-KR')}
                      </span>
                      <button
                        onClick={() => deletePickHistory(h.id)}
                        className="text-error/50 hover:text-error transition-colors"
                        title="이력 삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {h.groups.map((g, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded-lg bg-white/60 text-[11px] font-bold text-on-surface"
                          title={g.members.join(', ')}
                        >
                          {g.name} ({g.members.length}명)
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </>} {/* 랜덤 모드 닫기 */}
      </div>

      {/* 발표 모드 — portal로 document.body에 직접 마운트해 stacking context 문제 우회 */}
      {createPortal(
        <AnimatePresence>
          {presentMode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto' }}
              className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
            >
              <div className="min-h-screen p-8 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <h1 className="text-3xl font-black text-white">🎯 조 편성 결과</h1>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyText}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-all font-black text-sm border border-white/30"
                    >
                      {copied ? <CheckCheck size={16} className="text-green-400" /> : <Copy size={16} />}
                      {copied ? '복사됨!' : '텍스트 복사'}
                    </button>
                    <button
                      onClick={handleSaveImage}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-all font-black text-sm border border-white/30"
                    >
                      <Download size={16} />
                      이미지 저장
                    </button>
                    <button
                      onClick={() => setPresentMode(false)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/20 text-white hover:bg-white/30 transition-all font-black text-sm border border-white/30"
                    >
                      <Minimize2 size={18} />
                      발표 종료 (ESC)
                    </button>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 content-start p-2">
                  {groups.map((group) => (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: group.id * 0.1 }}
                      className="bg-white/10 backdrop-blur rounded-3xl p-6 border border-white/20 space-y-4"
                    >
                      <div className="text-center">
                        <div className="text-5xl mb-2">
                          {['🔵', '🔴', '🟢', '🟡', '🟣', '🟠', '⚫', '⚪'][group.id % 8]}
                        </div>
                        <h4 className="font-black text-white text-2xl">{group.name}</h4>
                        <p className="text-white/50 text-sm">{group.members.length}명</p>
                      </div>

                      <div className="space-y-2">
                        {group.members.map((member) => (
                          <div
                            key={member.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                              group.leader?.id === member.id
                                ? 'bg-amber-500/20 border border-amber-500/40'
                                : 'bg-white/10'
                            }`}
                          >
                            {group.leader?.id === member.id && (
                              <Crown size={14} className="text-amber-400 shrink-0" />
                            )}
                            <span className="font-bold text-white text-base">{member.name}</span>
                            {group.leader?.id === member.id && (
                              <span className="ml-auto text-[10px] text-amber-400 font-black shrink-0">조장</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

// ── 저장된 조 뽑기 컴포넌트 ──────────────────────────────────────
const ROULETTE_COLORS = [
  '#6366F1','#EC4899','#F59E0B','#10B981',
  '#3B82F6','#EF4444','#8B5CF6','#06B6D4',
];

interface SavedGroup {
  id: string;
  name: string;
  color: string;
  members: { student_id: string; full_name: string }[];
}

const SavedGroupPicker = ({ userId }: { userId: string }) => {
  const [classes, setClasses]               = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [savedGroups, setSavedGroups]       = useState<SavedGroup[]>([]);
  const [loading, setLoading]               = useState(false);
  const [classOpen, setClassOpen]           = useState(false);

  // 뽑기 상태
  const [spinning, setSpinning]             = useState(false);
  const [pickedGroup, setPickedGroup]       = useState<SavedGroup | null>(null);
  const [spinIdx, setSpinIdx]               = useState(0);
  const [history, setHistory]               = useState<string[]>([]);
  const [excludePicked, setExcludePicked]   = useState(false);
  const [_remaining, setRemaining]           = useState<string[]>([]);
  const spinRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => setClasses(data || []));
  }, [userId]);

  const loadGroups = async (classId: string) => {
    setLoading(true);
    setPickedGroup(null);
    setHistory([]);
    const { data: gData } = await supabase
      .from('class_groups')
      .select('id, name, color')
      .eq('class_id', classId)
      .eq('is_archived', false)
      .order('sort_order');

    if (!gData || gData.length === 0) { setSavedGroups([]); setLoading(false); return; }

    const { data: mData } = await supabase
      .from('class_group_members')
      .select('group_id, students(full_name)')
      .in('group_id', gData.map((g: any) => g.id));

    const groups: SavedGroup[] = gData.map((g: any) => ({
      ...g,
      members: (mData || [])
        .filter((m: any) => m.group_id === g.id)
        .map((m: any) => ({ student_id: '', full_name: m.students?.full_name ?? '' })),
    }));
    setSavedGroups(groups);
    setRemaining(groups.map(g => g.id));
    setLoading(false);
  };

  const pickGroup = async () => {
    const pool = excludePicked
      ? savedGroups.filter(g => !history.includes(g.id))
      : savedGroups;

    if (pool.length === 0) {
      alert('모든 조가 이미 뽑혔습니다. 초기화 후 다시 시도하세요.');
      return;
    }

    setSpinning(true);
    setPickedGroup(null);

    // 룰렛 애니메이션 (1.8초)
    let tick = 0;
    spinRef.current = setInterval(() => {
      setSpinIdx(Math.floor(Math.random() * savedGroups.length));
      tick++;
      if (tick > 22) {
        clearInterval(spinRef.current!);
        const winner = pool[Math.floor(Math.random() * pool.length)];
        setPickedGroup(winner);
        setHistory(prev => [...prev, winner.id]);
        setSpinning(false);
      }
    }, 80);
  };

  const resetHistory = () => {
    setHistory([]);
    setPickedGroup(null);
  };

  return (
    <div className="space-y-6">
      {/* 클래스 선택 */}
      <div className="glass rounded-3xl p-6 space-y-4">
        <h3 className="font-black text-base flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          저장된 조 불러오기
        </h3>

        <div className="relative">
          <button
            onClick={() => setClassOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-container/50 border border-white/40 rounded-2xl text-sm font-bold hover:border-primary/30 transition-colors"
          >
            <span>{selectedClassId ? classes.find(c => c.id === selectedClassId)?.name : '클래스를 선택하세요'}</span>
            <ChevronDown size={16} className={`transition-transform ${classOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {classOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setClassOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute top-full mt-1 left-0 right-0 z-20 bg-white border border-neutral-200 rounded-2xl shadow-lg overflow-hidden"
                >
                  {classes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedClassId(c.id); setClassOpen(false); loadGroups(c.id); }}
                      className="w-full px-4 py-3 text-left text-sm font-bold hover:bg-neutral-50 transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && selectedClassId && savedGroups.length === 0 && (
          <p className="text-center text-sm text-on-surface-variant/50 py-6">
            이 클래스에 저장된 조가 없습니다.<br />
            <span className="text-xs">클래스 페이지 → 조 편성 탭에서 먼저 조를 만들어주세요.</span>
          </p>
        )}
      </div>

      {/* 뽑기 섹션 */}
      {savedGroups.length > 0 && (
        <div className="glass rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-black text-base flex items-center gap-2">
              <Target size={18} className="text-primary" />
              발표 조 뽑기
              <span className="text-xs font-bold text-on-surface-variant/50">{savedGroups.length}개 조</span>
            </h3>
            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludePicked}
                onChange={e => setExcludePicked(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              뽑힌 조 제외
            </label>
          </div>

          {/* 룰렛 애니메이션 영역 */}
          <div className="flex flex-col items-center gap-6">
            <AnimatePresence mode="wait">
              {spinning && (
                <motion.div
                  key="spinning"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="w-48 h-48 rounded-full flex items-center justify-center text-white font-black text-2xl shadow-2xl"
                  style={{ backgroundColor: savedGroups[spinIdx % savedGroups.length]?.color ?? '#6366F1' }}
                >
                  {savedGroups[spinIdx % savedGroups.length]?.name ?? ''}
                </motion.div>
              )}
              {!spinning && pickedGroup && (
                <motion.div
                  key="picked"
                  initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div
                    className="w-52 h-52 rounded-full flex flex-col items-center justify-center text-white shadow-2xl gap-2"
                    style={{ backgroundColor: pickedGroup.color }}
                  >
                    <span className="text-4xl">🎯</span>
                    <span className="font-black text-3xl">{pickedGroup.name}</span>
                  </div>
                  {pickedGroup.members.length > 0 && (
                    <div className="text-center space-y-1">
                      <p className="text-xs font-black text-on-surface-variant/60 uppercase tracking-widest">조원</p>
                      <p className="font-bold text-sm">
                        {pickedGroup.members.map(m => m.full_name).join(', ')}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
              {!spinning && !pickedGroup && (
                <motion.div
                  key="idle"
                  className="w-48 h-48 rounded-full bg-surface-container/50 border-4 border-dashed border-primary/20 flex items-center justify-center text-on-surface-variant/30"
                >
                  <div className="text-center">
                    <Target size={32} className="mx-auto mb-2" />
                    <p className="text-xs font-bold">뽑기 버튼을 누르세요</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3">
              <button
                onClick={pickGroup}
                disabled={spinning}
                className="flex items-center gap-2 px-8 py-4 bg-primary text-white font-black text-base rounded-2xl hover:bg-primary/90 disabled:opacity-50 transition-all shadow-lg hover:shadow-primary/30 active:scale-95"
              >
                {spinning ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 뽑는 중...</>
                ) : (
                  <><Shuffle size={18} /> {pickedGroup ? '다시 뽑기' : '조 뽑기'}</>
                )}
              </button>
              {history.length > 0 && (
                <button onClick={resetHistory} className="px-4 py-4 border border-neutral-200 text-neutral-500 hover:text-neutral-800 rounded-2xl font-bold text-sm transition-colors">
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 조 목록 (뽑힌 조 표시) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2 border-t border-neutral-100">
            {savedGroups.map(g => {
              const isPicked = history.includes(g.id);
              const isLatest = pickedGroup?.id === g.id;
              return (
                <div
                  key={g.id}
                  className={`rounded-2xl p-3 border-2 transition-all ${isLatest ? 'border-current shadow-lg scale-105' : isPicked ? 'opacity-40 border-transparent' : 'border-transparent bg-surface-container/50'}`}
                  style={isLatest ? { borderColor: g.color, backgroundColor: g.color + '18' } : {}}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="font-black text-xs">{g.name}</span>
                    {isPicked && <Check size={11} className="text-emerald-500 ml-auto" />}
                  </div>
                  <p className="text-[10px] text-on-surface-variant/50 truncate">
                    {g.members.map(m => m.full_name).join(', ') || '멤버 없음'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupPicker;
