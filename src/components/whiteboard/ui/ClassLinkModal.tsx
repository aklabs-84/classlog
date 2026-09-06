import { useState, useEffect } from 'react';
import { X, Users, Link2, Copy, Check, Unlink } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { useBackdropClose } from '../../../hooks/useBackdropClose';

interface Class {
  id: string;
  name: string;
  subject?: string;
  class_type?: string;
}

interface Props {
  boardId: string;
  currentClassId?: string;
  onClose: () => void;
  onLinked: (classId: string | null, className: string | null) => void;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  return Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
}

export default function ClassLinkModal({ boardId, currentClassId, onClose, onLinked }: Props) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(currentClassId ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('classes')
        .select('id, name, subject, class_type')
        .eq('teacher_id', user.id)
        .order('name');
      setClasses(data || []);
      setLoading(false);
    })();
  }, [user]);

  const ensureClassSession = async (classId: string, className: string) => {
    // 기존 세션(active/ended) 중 가장 최근 것을 우선 재활성화, 없으면 신규 생성
    const { data: existing } = await supabase
      .from('class_board_sessions')
      .select('id, status')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'ended') {
        await supabase.from('class_board_sessions')
          .update({
            status: 'active',
            expires_at: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
          })
          .eq('id', existing.id);
      }
      // active면 그대로 유지
    } else if (user) {
      await supabase.from('class_board_sessions').insert({
        class_id: classId,
        class_name: className,
        session_code: genCode(),
        created_by: user.id,
        group_count: 1,
        group_size: 30,
        expires_at: new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString(),
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const newClassId = selectedClassId || null;
    const updates: Record<string, unknown> = { class_id: newClassId };

    if (newClassId) {
      // 클래스 연결: is_public=true + 세션 확보
      updates.is_public = true;
      const linked = classes.find(c => c.id === newClassId);
      if (linked) await ensureClassSession(newClassId, linked.name);
    } else {
      // 클래스 없음: is_public=false
      updates.is_public = false;
    }

    const { error } = await supabase.from('whiteboards').update(updates).eq('id', boardId);

    if (!error) {
      const linked = classes.find(c => c.id === newClassId);
      onLinked(newClassId, linked?.name ?? null);
    }
    setSaving(false);
    if (!selectedClassId) {
      onClose();
    }
  };

  const handleUnlink = async () => {
    setSaving(true);
    // 클래스 연결 해제: class_id=null + is_public=false
    await supabase.from('whiteboards').update({ class_id: null, is_public: false }).eq('id', boardId);
    onLinked(null, null);
    setSaving(false);
    onClose();
  };

  const studentViewUrl = `${window.location.origin}/sb/${boardId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(studentViewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const backdropHandlers = useBackdropClose(onClose);

  return (
    <div
      {...backdropHandlers}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div style={{
        background: '#1e1e1e', borderRadius: 16, width: 480, maxWidth: '90vw',
        padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        border: '1px solid #333',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={20} color="#3B82F6" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>클래스 연결</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>불러오는 중...</p>
        ) : (
          <>
            <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 10 }}>
              이 보드를 연결할 클래스를 선택하세요.<br />
              연결하면 학생들이 클래스 입장 코드로 이 보드에 참여할 수 있습니다.
            </p>

            {classes.length === 0 ? (
              <p style={{ color: '#6B7280', fontSize: 13, background: '#2a2a2a', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                등록된 클래스가 없습니다. 수업 관리에서 클래스를 먼저 만들어주세요.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
                {classes.map(cls => {
                  const isSelected = selectedClassId === cls.id;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => setSelectedClassId(isSelected ? '' : cls.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        background: isSelected ? '#1D4ED8' : '#2a2a2a',
                        border: `1px solid ${isSelected ? '#3B82F6' : '#333'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div>
                        <span style={{ color: '#fff', fontSize: 14, fontWeight: isSelected ? 600 : 400 }}>{cls.name}</span>
                        {cls.subject && (
                          <span style={{ color: '#93C5FD', fontSize: 11, marginLeft: 8 }}>{cls.subject}</span>
                        )}
                      </div>
                      {isSelected && <Check size={16} color="#93C5FD" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 보드 뷰어 링크 (항상 표시) */}
            <div style={{ background: '#0F172A', border: '1px solid #1E3A5F', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Link2 size={13} color="#60A5FA" />
                <span style={{ color: '#60A5FA', fontSize: 12, fontWeight: 600 }}>보드 뷰어 링크 (공유)</span>
              </div>
              <p style={{ color: '#6B7280', fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
                이 링크로 누구나 보드를 볼 수 있습니다 (보기 전용).
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{
                  flex: 1, background: '#1e293b', borderRadius: 6, padding: '7px 10px',
                  fontSize: 11, color: '#94A3B8', fontFamily: 'monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {studentViewUrl}
                </div>
                <button
                  onClick={handleCopy}
                  style={{
                    background: copied ? '#059669' : '#374151', border: 'none',
                    borderRadius: 6, padding: '7px 12px', cursor: 'pointer',
                    color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'background 0.15s', flexShrink: 0,
                  }}
                >
                  {copied ? <><Check size={12} /> 복사됨</> : <><Copy size={12} /> 복사</>}
                </button>
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {currentClassId && (
                <button
                  onClick={handleUnlink}
                  disabled={saving}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '1px solid #374151',
                    background: 'transparent', color: '#EF4444', cursor: 'pointer',
                    fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Unlink size={13} /> 연결 해제
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #374151',
                  background: 'transparent', color: '#9CA3AF', cursor: 'pointer', fontSize: 13,
                }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selectedClassId}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: selectedClassId ? '#3B82F6' : '#374151',
                  color: '#fff', cursor: selectedClassId ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? '저장 중...' : selectedClass ? `"${selectedClass.name}" 연결하기` : '클래스 선택'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
