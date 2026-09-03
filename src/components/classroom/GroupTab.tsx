import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Shuffle, X, Check, Loader2,
  Users, UserPlus, Bell, Dices, Pencil,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { regenerateClassGroups } from '../../lib/groupRegenerate';

interface Student {
  id: string;
  name: string;
  number: string;
}

interface ClassGroup {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface GroupTabProps {
  classId: string;
  students: Student[];
  onGroupsChanged?: () => void;
}

const GROUP_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981',
  '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4',
];

const GroupTab = ({ classId, students, onGroupsChanged }: GroupTabProps) => {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const [autoLoading, setAutoLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  const [randomOpen, setRandomOpen] = useState(false);
  const [randomSplitMode, setRandomSplitMode] = useState<'groups' | 'members'>('groups');
  const [randomGroupCount, setRandomGroupCount] = useState(4);
  const [randomMemberCount, setRandomMemberCount] = useState(4);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomGroupNames, setRandomGroupNames] = useState<string[]>([]);

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  useEffect(() => {
    if (classId) load();
  }, [classId]);

  const randomNumGroups = randomSplitMode === 'groups'
    ? randomGroupCount
    : Math.max(1, Math.ceil(students.length / randomMemberCount));

  useEffect(() => {
    setRandomGroupNames(prev => Array.from({ length: randomNumGroups }, (_, i) => prev[i] ?? `${i + 1}조`));
  }, [randomNumGroups]);

  const load = async () => {
    setLoading(true);
    const { data: gData } = await supabase
      .from('class_groups')
      .select('id, name, color, sort_order')
      .eq('class_id', classId)
      .eq('is_archived', false)
      .order('sort_order');

    const grps: ClassGroup[] = gData || [];
    setGroups(grps);

    if (grps.length > 0) {
      const { data: members } = await supabase
        .from('class_group_members')
        .select('group_id, student_id')
        .in('group_id', grps.map(g => g.id));

      const map: Record<string, string> = {};
      (members || []).forEach(m => { map[m.student_id] = m.group_id; });
      setMemberMap(map);
    } else {
      setMemberMap({});
    }
    setLoading(false);
  };

  const addGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    setAddLoading(true);
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    const { data, error } = await supabase
      .from('class_groups')
      .insert({ class_id: classId, name, color, sort_order: groups.length })
      .select()
      .single();
    setAddLoading(false);
    if (error) {
      if (error.code === '23505') {
        alert(`'${name}' 이름의 조가 이미 있습니다. 다른 이름을 사용해주세요.`);
      } else {
        alert('조 생성 중 오류가 발생했습니다.');
      }
      return;
    }
    setGroups(prev => [...prev, data]);
    setNewName('');
    setAdding(false);
    onGroupsChanged?.();
  };

  const deleteGroup = async (groupId: string) => {
    const newMap = { ...memberMap };
    Object.keys(newMap).forEach(sid => {
      if (newMap[sid] === groupId) delete newMap[sid];
    });
    setMemberMap(newMap);
    setGroups(prev => prev.filter(g => g.id !== groupId));
    // 하드 삭제 대신 보관 처리: student_results.group_id 연결을 끊지 않아
    // 과거 제출 기록의 조 배지가 계속 유지되도록 한다.
    await supabase.from('class_group_members').delete().eq('group_id', groupId);
    await supabase.from('class_groups').update({ is_archived: true }).eq('id', groupId);
    setDeleteTarget(null);
    onGroupsChanged?.();
  };

  const startRename = (group: ClassGroup) => {
    setRenamingGroupId(group.id);
    setRenameValue(group.name);
  };

  const submitRename = async () => {
    if (!renamingGroupId) return;
    const name = renameValue.trim();
    const target = groups.find(g => g.id === renamingGroupId);
    if (!name || !target || name === target.name) {
      setRenamingGroupId(null);
      return;
    }
    setRenameLoading(true);
    const { error } = await supabase
      .from('class_groups')
      .update({ name })
      .eq('id', renamingGroupId);
    setRenameLoading(false);
    if (error) {
      if (error.code === '23505') {
        alert(`'${name}' 이름의 조가 이미 있습니다. 다른 이름을 사용해주세요.`);
      } else {
        alert('조 이름 수정 중 오류가 발생했습니다.');
      }
      return;
    }
    setGroups(prev => prev.map(g => g.id === renamingGroupId ? { ...g, name } : g));
    setRenamingGroupId(null);
    onGroupsChanged?.();
  };

  const assignStudent = async (studentId: string, groupId: string | null) => {
    setSaving(studentId);
    const prevGroupId = memberMap[studentId];

    setMemberMap(prev => {
      const next = { ...prev };
      if (groupId) next[studentId] = groupId;
      else delete next[studentId];
      return next;
    });

    await supabase
      .from('class_group_members')
      .delete()
      .eq('student_id', studentId)
      .in('group_id', groups.map(g => g.id));

    if (groupId) {
      const { error } = await supabase
        .from('class_group_members')
        .insert({ group_id: groupId, student_id: studentId });
      if (error) {
        setMemberMap(prev => {
          const next = { ...prev };
          if (prevGroupId) next[studentId] = prevGroupId;
          else delete next[studentId];
          return next;
        });
      }
    }
    setSaving(null);
    onGroupsChanged?.();
  };

  const autoAssign = async () => {
    if (groups.length === 0) {
      alert('먼저 조를 만들어주세요.');
      return;
    }
    setAutoLoading(true);

    await supabase
      .from('class_group_members')
      .delete()
      .in('group_id', groups.map(g => g.id));

    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const newMap: Record<string, string> = {};
    const inserts: { group_id: string; student_id: string }[] = [];

    shuffled.forEach((student, idx) => {
      const groupIdx = idx % groups.length;
      const gid = groups[groupIdx].id;
      newMap[student.id] = gid;
      inserts.push({ group_id: gid, student_id: student.id });
    });

    if (inserts.length > 0) {
      await supabase.from('class_group_members').insert(inserts);
    }
    setMemberMap(newMap);
    setAutoLoading(false);
    onGroupsChanged?.();
  };

  const randomPickGroups = async () => {
    if (students.length < 2) return;
    if (groups.length > 0 && !confirm('기존 조를 새로운 조로 랜덤 재편성할까요? (같은 이름의 조는 유지되고, 이전 제출 기록은 그대로 보존됩니다)')) return;

    setRandomLoading(true);

    const numGroups = randomNumGroups;
    const names = Array.from({ length: numGroups }, (_, i) => randomGroupNames[i]?.trim() || `${i + 1}조`);
    if (new Set(names).size !== names.length) {
      alert('조 이름이 중복되었습니다. 서로 다른 이름을 입력해주세요.');
      setRandomLoading(false);
      return;
    }

    const desiredGroups = names.map((name, i) => ({
      name,
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      sort_order: i,
    }));

    const shuffled = [...students].sort(() => Math.random() - 0.5);
    const assignments = shuffled.map((student, idx) => ({
      studentId: student.id,
      groupName: desiredGroups[idx % numGroups].name,
    }));

    await regenerateClassGroups(classId, desiredGroups, assignments);

    setRandomLoading(false);
    setRandomOpen(false);
    await load();
    onGroupsChanged?.();
  };

  const clearAll = async () => {
    if (!confirm('모든 조 배정을 초기화하시겠습니까?')) return;
    await supabase
      .from('class_group_members')
      .delete()
      .in('group_id', groups.map(g => g.id));
    setMemberMap({});
    onGroupsChanged?.();
  };

  const sendGroupNotifications = async () => {
    const assignedCount = Object.keys(memberMap).length;
    if (assignedCount === 0) {
      alert('배정된 학생이 없습니다.');
      return;
    }
    setNotifLoading(true);

    const groupMemberNames: Record<string, string[]> = {};
    groups.forEach(g => {
      const members = students.filter(s => memberMap[s.id] === g.id);
      groupMemberNames[g.id] = members.map(s => s.name);
    });

    const notifications = Object.entries(memberMap).map(([studentId, groupId]) => {
      const group = groups.find(g => g.id === groupId);
      const names = groupMemberNames[groupId] || [];
      return {
        student_id: studentId,
        class_id: classId,
        type: 'group_assignment',
        title: `📋 조 편성 완료 — ${group?.name ?? ''}`,
        content: `조원: ${names.join(', ')}`,
        is_read: false,
      };
    });

    await supabase.from('student_notifications').insert(notifications);
    setNotifLoading(false);
    setNotifSuccess(true);
    setTimeout(() => setNotifSuccess(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const unassigned = students.filter(s => !memberMap[s.id]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">조 편성</h3>
          <p className="text-xs text-on-surface-variant/60 mt-0.5">
            학생을 각 조에 배정하세요. 배정 결과는 실시간으로 저장됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {groups.length > 0 && (
            <>
              <button
                onClick={clearAll}
                className="px-3 py-2 text-xs font-bold text-neutral-500 hover:text-red-500 border border-neutral-200 hover:border-red-200 rounded-xl transition-colors"
              >
                배정 초기화
              </button>
              <button
                onClick={autoAssign}
                disabled={autoLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                {autoLoading ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}
                균등 배분
              </button>
              <button
                onClick={sendGroupNotifications}
                disabled={notifLoading || notifSuccess}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl transition-colors disabled:opacity-60 ${
                  notifSuccess
                    ? 'bg-emerald-500 text-white'
                    : 'bg-indigo-500 hover:bg-indigo-600 text-white'
                }`}
              >
                {notifLoading ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
                {notifSuccess ? '알림 전송 완료!' : '학생에게 알림'}
              </button>
            </>
          )}
          <button
            onClick={() => setRandomOpen(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-violet-500 hover:bg-violet-600 text-white rounded-xl transition-colors"
          >
            <Dices size={13} />
            랜덤 조 뽑기
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} />
            조 추가
          </button>
        </div>
      </div>

      {/* 랜덤 조 뽑기 설정 패널 */}
      <AnimatePresence>
        {randomOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 bg-violet-50 border border-violet-200 rounded-2xl space-y-3 overflow-hidden"
          >
            {students.length < 2 ? (
              <p className="text-xs font-bold text-violet-700">학생이 2명 이상이어야 랜덤 조 뽑기를 사용할 수 있어요.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  {(['groups', 'members'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setRandomSplitMode(mode)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border ${
                        randomSplitMode === mode
                          ? 'bg-violet-500 text-white border-violet-500'
                          : 'bg-white border-violet-200 text-violet-600'
                      }`}
                    >
                      {mode === 'groups' ? '조 개수로 나누기' : '조원 수로 나누기'}
                    </button>
                  ))}
                </div>

                {randomSplitMode === 'groups' ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-violet-700">
                      <span>조 개수</span>
                      <span className="text-base font-black text-violet-600">{randomGroupCount}조</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={Math.max(2, students.length)}
                      value={randomGroupCount}
                      onChange={e => setRandomGroupCount(Number(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <p className="text-[11px] text-violet-600">조당 약 {Math.ceil(students.length / randomGroupCount)}명</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-violet-700">
                      <span>조원 수</span>
                      <span className="text-base font-black text-violet-600">{randomMemberCount}명</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={Math.max(2, students.length)}
                      value={randomMemberCount}
                      onChange={e => setRandomMemberCount(Number(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                    <p className="text-[11px] text-violet-600">총 {Math.max(1, Math.ceil(students.length / randomMemberCount))}개 조 구성</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-violet-700">조 이름 (직접 수정 가능)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {randomGroupNames.map((name, i) => (
                      <input
                        key={i}
                        value={name}
                        onChange={e => setRandomGroupNames(prev => prev.map((n, idx) => idx === i ? e.target.value : n))}
                        className="px-2.5 py-1.5 text-xs font-bold bg-white border border-violet-200 rounded-lg focus:outline-none focus:border-violet-400"
                        placeholder={`${i + 1}조`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={randomPickGroups}
                    disabled={randomLoading}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-violet-500 hover:bg-violet-600 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {randomLoading ? <Loader2 size={13} className="animate-spin" /> : <Shuffle size={13} />}
                    뽑기 실행
                  </button>
                  <button
                    onClick={() => setRandomOpen(false)}
                    className="px-3 py-2 text-xs font-bold text-violet-500 hover:text-violet-700 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 새 조 추가 인라인 폼 */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 p-4 bg-primary/5 border border-primary/20 rounded-2xl"
          >
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="조 이름 (예: 1조, 빨간팀)"
              className="flex-1 px-3 py-2 text-sm font-bold bg-white border border-primary/20 rounded-xl focus:outline-none focus:border-primary"
            />
            <button onClick={addGroup} disabled={addLoading || !newName.trim()} className="px-4 py-2 text-xs font-black bg-primary text-white rounded-xl disabled:opacity-50">
              {addLoading ? <Loader2 size={13} className="animate-spin" /> : '추가'}
            </button>
            <button onClick={() => { setAdding(false); setNewName(''); }} className="p-2 text-neutral-500 hover:text-neutral-700 rounded-xl">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 조가 없을 때 안내 */}
      {groups.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant/65">
          <Users size={36} className="mx-auto mb-3 opacity-50" />
          <p className="font-black text-sm">조가 없습니다</p>
          <p className="text-xs mt-1">위의 "조 추가" 버튼으로 첫 번째 조를 만들어보세요</p>
        </div>
      )}

      {/* 좌우 분할 레이아웃 */}
      {groups.length > 0 && students.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* 왼쪽: 조 카드 그리드 */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {groups.map(group => {
                const members = students.filter(s => memberMap[s.id] === group.id);
                return (
                  <motion.div
                    key={group.id}
                    layout
                    className="bg-white border-2 rounded-2xl overflow-hidden shadow-sm"
                    style={{ borderColor: group.color + '40' }}
                  >
                    {/* 조 헤더 */}
                    <div
                      className="flex items-center justify-between px-4 py-3"
                      style={{ backgroundColor: group.color + '18' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                        {renamingGroupId === group.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={submitRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter') submitRename();
                              if (e.key === 'Escape') setRenamingGroupId(null);
                            }}
                            disabled={renameLoading}
                            className="font-black text-sm bg-white border border-primary/30 rounded-lg px-1.5 py-0.5 min-w-0 w-24 focus:outline-none focus:border-primary"
                          />
                        ) : (
                          <button
                            onClick={() => startRename(group)}
                            className="flex items-center gap-1 font-black text-sm hover:text-primary transition-colors group/name"
                            title="조 이름 수정"
                          >
                            <span className="truncate">{group.name}</span>
                            <Pencil size={11} className="opacity-0 group-hover/name:opacity-60 shrink-0" />
                          </button>
                        )}
                        <span className="text-xs font-bold opacity-50 shrink-0">{members.length}명</span>
                      </div>
                      {deleteTarget === group.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteGroup(group.id)} className="px-2 py-1 text-xs font-black bg-red-500 text-white rounded-lg">삭제</button>
                          <button onClick={() => setDeleteTarget(null)} className="p-1 text-neutral-500 hover:text-neutral-700 rounded-lg"><X size={12} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteTarget(group.id)} className="p-1 text-neutral-500 hover:text-red-500 rounded-lg transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* 멤버 목록 */}
                    <div className="p-3 space-y-1.5 min-h-[56px]">
                      {members.length === 0 && (
                        <p className="text-center text-xs text-neutral-500 py-3">아직 배정된 학생이 없어요</p>
                      )}
                      {members.map(s => (
                        <div key={s.id} className="flex items-center justify-between px-2.5 py-1.5 bg-neutral-50 rounded-xl group">
                          <span className="text-xs font-bold">
                            <span className="text-neutral-500 mr-1.5">{s.number}</span>{s.name}
                          </span>
                          <button
                            onClick={() => assignStudent(s.id, null)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-500 transition-all rounded"
                            title="조에서 제거"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* 오른쪽: 미배정 학생 패널 */}
          <div className="lg:w-64 xl:w-72 shrink-0">
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl overflow-hidden">
              {/* 패널 헤더 */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 bg-white">
                <UserPlus size={14} className="text-neutral-500" />
                <span className="text-sm font-black text-neutral-600">미배정</span>
                <span className="text-xs font-bold text-neutral-500">{unassigned.length}명</span>
              </div>

              {/* 미배정 학생 목록 */}
              <div className="p-2 space-y-1.5 max-h-[480px] overflow-y-auto">
                {unassigned.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold px-3 py-4">
                    <Check size={15} />
                    모두 배정 완료
                  </div>
                ) : (
                  unassigned.map(s => (
                    <motion.div
                      key={s.id}
                      layout
                      className="bg-white border border-neutral-100 rounded-xl px-3 py-2.5"
                    >
                      {/* 학생 이름 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {saving === s.id
                            ? <Loader2 size={11} className="animate-spin text-primary shrink-0" />
                            : <span className="text-xs text-neutral-500 shrink-0">{s.number}</span>
                          }
                          <span className="text-xs font-black truncate">{s.name}</span>
                        </div>
                      </div>
                      {/* 조 선택 버튼들 */}
                      <div className="flex flex-wrap gap-1">
                        {groups.map(g => (
                          <button
                            key={g.id}
                            onClick={() => assignStudent(s.id, g.id)}
                            disabled={saving === s.id}
                            className="px-2 py-0.5 text-xs font-bold rounded-full text-white transition-opacity hover:opacity-75 disabled:opacity-40"
                            style={{ backgroundColor: g.color }}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 조는 있지만 학생이 없는 경우 */}
      {groups.length > 0 && students.length === 0 && (
        <p className="text-center text-sm text-neutral-500 py-8">등록된 학생이 없습니다.</p>
      )}
    </div>
  );
};

export default GroupTab;
