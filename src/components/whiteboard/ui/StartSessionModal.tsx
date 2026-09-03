import { useState, useEffect } from 'react';
import { X, Plus, ChevronUp, ChevronDown, Sparkles, RotateCcw, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { v4 as uuidv4 } from 'uuid';

interface ClassItem {
  id: string;
  name: string;
  subject?: string;
}

interface ClassGroup {
  id: string;
  name: string;
  sort_order: number;
  memberCount: number;
}

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

const GROUP_NAMES = [
  '1조', '2조', '3조', '4조', '5조', '6조', '7조', '8조', '9조', '10조',
  '11조', '12조', '13조', '14조', '15조', '16조', '17조', '18조', '19조', '20조',
];

export default function StartSessionModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [groupCount, setGroupCount] = useState(6);
  const [groupSize, setGroupSize] = useState(5);
  const [creating, setCreating] = useState(false);

  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [useClassGroups, setUseClassGroups] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('classes').select('id, name, subject').eq('teacher_id', user.id).eq('is_archived', false).order('name')
      .then(({ data }) => setClasses(data || []));
  }, [user]);

  // 클래스 선택 시 class_groups 자동 조회
  useEffect(() => {
    if (!selectedClassId) {
      setClassGroups([]);
      setUseClassGroups(false);
      return;
    }

    const fetchGroups = async () => {
      setLoadingGroups(true);
      const { data: grps } = await supabase
        .from('class_groups')
        .select('id, name, sort_order')
        .eq('class_id', selectedClassId)
        .eq('is_archived', false)
        .order('sort_order');

      if (!grps || grps.length === 0) {
        setClassGroups([]);
        setUseClassGroups(false);
        setLoadingGroups(false);
        return;
      }

      const { data: members } = await supabase
        .from('class_group_members')
        .select('group_id, student_id')
        .in('group_id', grps.map(g => g.id));

      const countMap: Record<string, number> = {};
      (members || []).forEach(m => {
        countMap[m.group_id] = (countMap[m.group_id] ?? 0) + 1;
      });

      const enriched: ClassGroup[] = grps.map(g => ({
        id: g.id,
        name: g.name,
        sort_order: g.sort_order,
        memberCount: countMap[g.id] ?? 0,
      }));

      setClassGroups(enriched);
      setGroupCount(enriched.length);
      const maxMembers = Math.max(...enriched.map(g => g.memberCount), 2);
      setGroupSize(maxMembers > 0 ? maxMembers : 5);
      setUseClassGroups(true);
      setLoadingGroups(false);
    };

    fetchGroups();
  }, [selectedClassId]);

  const handleCreate = async () => {
    if (!user || !selectedClassId || creating) return;
    setCreating(true);

    const cls = classes.find(c => c.id === selectedClassId);
    if (!cls) { setCreating(false); return; }

    // 클래스당 영구 세션 재사용 또는 신규 생성
    const { data: existingSession } = await supabase
      .from('class_board_sessions')
      .select('id, session_code')
      .eq('class_id', selectedClassId)
      .eq('created_by', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId: string;

    if (existingSession) {
      sessionId = existingSession.id;
    } else {
      const code = genCode();
      const { data: session, error } = await supabase
        .from('class_board_sessions')
        .insert({
          class_id: selectedClassId,
          class_name: cls.name,
          session_code: code,
          created_by: user.id,
          group_count: groupCount,
          group_size: groupSize,
          expires_at: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
        })
        .select('id').single();

      if (error || !session) { setCreating(false); return; }
      sessionId = session.id;
    }

    // 보드 생성 (is_public: false — 목록에서 공유 토글로 제어)
    const boardInserts = Array.from({ length: groupCount }, (_, i) => {
      const groupName = useClassGroups && classGroups[i]
        ? classGroups[i].name
        : (GROUP_NAMES[i] ?? `${i + 1}조`);
      return {
        id: uuidv4(),
        title: groupName,
        template: 'blank',
        group_name: groupName,
        created_by: user.id,
        share_token: uuidv4(),
        is_public: true,
        class_id: selectedClassId,
        session_id: sessionId,
        group_number: i + 1,
      };
    });

    await supabase.from('whiteboards').insert(boardInserts);

    setCreating(false);
    onCreated?.();
    onClose();
  };

  const totalStudents = groupCount * groupSize;

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      }}
    >
      <div style={{
        background: '#111827', borderRadius: 20, width: 480,
        maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        padding: 28, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', border: '1px solid #1F2937',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: '#1D4ED8', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={18} color="#fff" />
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>조별 보드 만들기</p>
              <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>생성 후 목록에서 공유를 켜면 학생이 입장할 수 있어요</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* 클래스 선택 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 6 }}>클래스 선택</label>
          {classes.length === 0 ? (
            <p style={{ color: '#6B7280', fontSize: 13, background: '#1F2937', borderRadius: 8, padding: 14, textAlign: 'center' }}>
              등록된 클래스가 없습니다
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  style={{
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    background: selectedClassId === cls.id ? '#1D4ED8' : '#1F2937',
                    border: `1px solid ${selectedClassId === cls.id ? '#3B82F6' : '#374151'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ color: '#fff', fontSize: 14 }}>{cls.name}</span>
                    {cls.subject && <span style={{ color: '#93C5FD', fontSize: 11, marginLeft: 8 }}>{cls.subject}</span>}
                  </div>
                  {selectedClassId === cls.id && <Check size={15} color="#93C5FD" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 클래스 조 자동 불러오기 배너 */}
        {selectedClassId && (
          <div style={{ marginBottom: 16 }}>
            {loadingGroups ? (
              <div style={{ background: '#1F2937', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ color: '#6B7280', fontSize: 12 }}>조 정보 불러오는 중...</span>
              </div>
            ) : classGroups.length > 0 ? (
              <div style={{ background: useClassGroups ? '#052e16' : '#1F2937', border: `1px solid ${useClassGroups ? '#166534' : '#374151'}`, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} color={useClassGroups ? '#4ADE80' : '#6B7280'} />
                    <span style={{ color: useClassGroups ? '#4ADE80' : '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
                      {useClassGroups
                        ? `클래스 조 자동 적용 (${classGroups.length}개 조)`
                        : `클래스에 저장된 조 ${classGroups.length}개 발견`}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (useClassGroups) {
                        setUseClassGroups(false);
                        setGroupCount(6);
                        setGroupSize(5);
                      } else {
                        setUseClassGroups(true);
                        setGroupCount(classGroups.length);
                        const maxM = Math.max(...classGroups.map(g => g.memberCount), 2);
                        setGroupSize(maxM > 0 ? maxM : 5);
                      }
                    }}
                    style={{
                      background: useClassGroups ? '#374151' : '#166534',
                      border: 'none', borderRadius: 6, padding: '4px 10px',
                      color: '#fff', fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {useClassGroups ? <><RotateCcw size={10} /> 수동으로</> : <><Sparkles size={10} /> 자동 적용</>}
                  </button>
                </div>
                {useClassGroups && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {classGroups.map(g => (
                      <span key={g.id} style={{ background: '#166534', borderRadius: 4, padding: '2px 8px', color: '#86EFAC', fontSize: 11 }}>
                        {g.name}{g.memberCount > 0 ? ` (${g.memberCount}명)` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* 조 설정 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 6 }}>
              조 수 {useClassGroups && <span style={{ color: '#4ADE80' }}>(자동)</span>}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => { setGroupCount(Math.max(1, groupCount - 1)); if (useClassGroups) setUseClassGroups(false); }}
                disabled={useClassGroups}
                style={{ width: 32, height: 32, background: useClassGroups ? '#1F2937' : '#374151', border: 'none', borderRadius: 6, color: useClassGroups ? '#4B5563' : '#fff', cursor: useClassGroups ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronDown size={16} />
              </button>
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{groupCount}</span>
              <button
                onClick={() => { setGroupCount(Math.min(20, groupCount + 1)); if (useClassGroups) setUseClassGroups(false); }}
                disabled={useClassGroups}
                style={{ width: 32, height: 32, background: useClassGroups ? '#1F2937' : '#374151', border: 'none', borderRadius: 6, color: useClassGroups ? '#4B5563' : '#fff', cursor: useClassGroups ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronUp size={16} />
              </button>
              <span style={{ color: '#6B7280', fontSize: 12 }}>조 (최대 20)</span>
            </div>
          </div>
          <div>
            <label style={{ color: '#9CA3AF', fontSize: 12, display: 'block', marginBottom: 6 }}>
              조당 인원 (최대) {useClassGroups && classGroups.some(g => g.memberCount > 0) && <span style={{ color: '#4ADE80' }}>(자동)</span>}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setGroupSize(Math.max(2, groupSize - 1))} style={{ width: 32, height: 32, background: '#374151', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronDown size={16} />
              </button>
              <span style={{ color: '#fff', fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'center' }}>{groupSize}</span>
              <button onClick={() => setGroupSize(Math.min(15, groupSize + 1))} style={{ width: 32, height: 32, background: '#374151', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronUp size={16} />
              </button>
              <span style={{ color: '#6B7280', fontSize: 12 }}>명</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#1F2937', borderRadius: 8, padding: '10px 14px', marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#9CA3AF', fontSize: 13 }}>총 {groupCount}개 보드 생성 예정</span>
          <span style={{ color: '#60A5FA', fontSize: 13, fontWeight: 600 }}>최대 {totalStudents}명</span>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating || !selectedClassId}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none',
            background: selectedClassId ? '#2563EB' : '#374151',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: selectedClassId ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: creating ? 0.7 : 1,
          }}
        >
          <Plus size={16} /> {creating ? '생성 중...' : '보드 생성하기'}
        </button>
      </div>
    </div>
  );
}
