import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Video, Plus, ExternalLink, StopCircle, Trash2, ChevronDown, Radio, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { filterMyTeachingClasses } from '../../lib/projectClassFilter';
import { useAuth } from '../../lib/auth';

type Platform = 'google_meet' | 'zoom' | 'etc';

interface ClassMeeting {
  id: string;
  class_id: string;
  title: string;
  platform: Platform;
  meeting_url: string;
  scheduled_at: string | null;
  is_active: boolean;
  created_at: string;
}

const PLATFORM_META: Record<Platform, { label: string; color: string; createUrl?: string; guideSteps?: string[] }> = {
  google_meet: {
    label: 'Google Meet',
    color: '#22C55E',
    createUrl: 'https://meet.google.com/new',
    guideSteps: [
      '위 "Google Meet에서 새 회의 만들기" 버튼 클릭',
      '구글 계정으로 로그인 (이미 로그인되어 있으면 바로 새 회의가 생성돼요)',
      '생성된 회의 링크(meet.google.com/xxx-xxxx-xxx)를 복사',
      '아래 "회의 링크 붙여넣기" 입력창에 붙여넣기',
    ],
  },
  zoom: {
    label: 'Zoom',
    color: '#3B82F6',
    createUrl: 'https://zoom.us/start/videomeeting',
    guideSteps: [
      '위 "Zoom에서 새 회의 만들기" 버튼 클릭',
      'Zoom 계정으로 로그인',
      '"새 회의" 또는 "지금 시작"을 눌러 회의 시작',
      '회의 화면에서 초대 링크를 복사해 아래 입력창에 붙여넣기',
    ],
  },
  etc: { label: '기타', color: '#6B7280' },
};

export default function OnlineMeeting() {
  const { user } = useAuth();

  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);

  const [meetings, setMeetings] = useState<ClassMeeting[]>([]);

  const [title, setTitle] = useState('온라인 수업');
  const [platform, setPlatform] = useState<Platform>('google_meet');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => { if (user) fetchClasses(); }, [user?.id]);

  const resolveClassId = (cls: any) => cls?.linked_class_id || cls?.id;

  const fetchClasses = async () => {
    const { data: ownData } = await supabase.from('classes').select('id, name, class_type, linked_class_id, school_project_id, parent_class_id, assigned_teacher_id')
      .eq('teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
    let assignedData: any[] = [];
    try {
      const { data } = await supabase.from('classes').select('id, name, class_type, linked_class_id')
        .eq('assigned_teacher_id', user!.id).eq('is_archived', false).order('created_at', { ascending: false });
      assignedData = data || [];
    } catch (_e) {}
    const seen = new Set<string>();
    const combined = [...filterMyTeachingClasses(ownData, user!.id), ...assignedData].filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    if (combined.length > 0) {
      setClasses(combined);
      setSelectedClass(combined[0]);
      fetchMeetings(resolveClassId(combined[0]));
    }
  };

  const fetchMeetings = async (classId: string) => {
    const { data } = await supabase.from('class_meetings').select('*')
      .eq('class_id', classId).order('created_at', { ascending: false }).limit(20);
    if (data) setMeetings(data as ClassMeeting[]);
  };

  const handleSelectClass = async (cls: any) => {
    setSelectedClass(cls);
    setClassDropdownOpen(false);
    await fetchMeetings(resolveClassId(cls));
  };

  const handleCreateMeeting = async () => {
    if (!selectedClass || !user || !meetingUrl.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('class_meetings').insert({
      class_id: resolveClassId(selectedClass),
      title: title.trim() || '온라인 수업',
      platform,
      meeting_url: meetingUrl.trim(),
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      is_active: false,
      created_by: user.id,
    }).select().single();
    setSaving(false);
    if (error || !data) { alert('등록 중 오류가 발생했습니다.'); return; }
    setMeetings(prev => [data as ClassMeeting, ...prev]);
    setTitle('온라인 수업');
    setMeetingUrl('');
    setScheduledAt('');
  };

  const handleStartMeeting = async (meeting: ClassMeeting) => {
    // 같은 클래스의 다른 활성 미팅은 자동 정지 (한 번에 하나만 LIVE)
    await supabase.from('class_meetings')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('class_id', meeting.class_id).eq('is_active', true).neq('id', meeting.id);
    await supabase.from('class_meetings').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', meeting.id);
    setMeetings(prev => prev.map(m => m.id === meeting.id ? { ...m, is_active: true } : { ...m, is_active: false }));
  };

  const handleEndMeeting = async (meeting: ClassMeeting) => {
    await supabase.from('class_meetings').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', meeting.id);
    setMeetings(prev => prev.map(m => m.id === meeting.id ? { ...m, is_active: false } : m));
  };

  const handleDeleteMeeting = async (meeting: ClassMeeting) => {
    if (!confirm('이 미팅 기록을 삭제할까요?')) return;
    await supabase.from('class_meetings').delete().eq('id', meeting.id);
    setMeetings(prev => prev.filter(m => m.id !== meeting.id));
  };

  return (
    <div className="space-y-6">
      {/* 클래스 선택 */}
      <div className="relative">
        <button
          onClick={() => setClassDropdownOpen(o => !o)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container border border-white/40 text-sm font-bold text-on-surface"
        >
          {selectedClass ? selectedClass.name : '클래스 선택'}
          <ChevronDown size={14} />
        </button>
        {classDropdownOpen && (
          <div className="absolute z-10 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
            {classes.map(cls => (
              <button
                key={cls.id}
                onClick={() => handleSelectClass(cls)}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 text-gray-800"
              >
                {cls.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!selectedClass ? (
        <p className="text-sm text-on-surface-variant">등록된 클래스가 없습니다.</p>
      ) : (
        <>
          {/* 등록 폼 */}
          <div className="glass rounded-2xl p-5 border border-white/40 space-y-4">
            <h3 className="text-sm font-black text-on-surface flex items-center gap-2">
              <Video size={16} className="text-primary" /> 온라인 수업 만들기
            </h3>

            <div className="flex gap-2">
              {(Object.keys(PLATFORM_META) as Platform[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold border transition-colors"
                  style={{
                    borderColor: platform === p ? PLATFORM_META[p].color : '#E5E7EB',
                    background: platform === p ? `${PLATFORM_META[p].color}15` : '#fff',
                    color: platform === p ? PLATFORM_META[p].color : '#6B7280',
                  }}
                >
                  {PLATFORM_META[p].label}
                </button>
              ))}
            </div>

            {PLATFORM_META[platform].createUrl && (
              <div className="space-y-2">
                <a
                  href={PLATFORM_META[platform].createUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-black border-2 transition-colors"
                  style={{ borderColor: PLATFORM_META[platform].color, color: PLATFORM_META[platform].color }}
                >
                  <ExternalLink size={14} />
                  {PLATFORM_META[platform].label}에서 새 회의 만들기
                </a>

                <button
                  type="button"
                  onClick={() => setShowGuide(g => !g)}
                  className="w-full flex items-center justify-between text-[11px] font-bold text-gray-400 px-1"
                >
                  <span>❓ {PLATFORM_META[platform].label} 회의 만드는 법 보기</span>
                  <ChevronDown size={12} className={`transition-transform ${showGuide ? 'rotate-180' : ''}`} />
                </button>

                {showGuide && PLATFORM_META[platform].guideSteps && (
                  <ol className="space-y-1.5 bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {PLATFORM_META[platform].guideSteps!.map((step, i) => (
                      <li key={i} className="text-[11px] text-gray-600 font-bold flex gap-2">
                        <span className="shrink-0 text-gray-400">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="제목 (예: 3교시 온라인 수업)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />

            <input
              value={meetingUrl}
              onChange={e => setMeetingUrl(e.target.value)}
              placeholder="회의 링크 붙여넣기 (예: https://meet.google.com/xxx-xxxx-xxx)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
            />

            <div>
              <p className="text-xs text-gray-400 mb-1">예정 시각 (선택, 비워두면 즉시 시작)</p>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
              />
            </div>

            <button
              onClick={handleCreateMeeting}
              disabled={!meetingUrl.trim() || saving}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Plus size={16} /> 등록하기
            </button>
            <p className="text-[11px] text-gray-400 text-center -mt-2">등록 후 목록에서 "시작"을 눌러야 학생 페이지에 노출돼요.</p>
          </div>

          {/* 최근 미팅 목록 */}
          <div className="space-y-2">
            <h3 className="text-sm font-black text-on-surface">최근 미팅</h3>
            {meetings.length === 0 && (
              <p className="text-sm text-on-surface-variant">등록된 미팅이 없습니다.</p>
            )}
            {meetings.map(m => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-xl p-4 border border-white/40 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {m.is_active ? (
                      <span className="flex items-center gap-1 text-[10px] font-black text-red-500">
                        <Radio size={10} /> LIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-gray-400">대기 중</span>
                    )}
                    <span className="text-sm font-bold text-on-surface truncate">{m.title}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-bold" style={{ color: PLATFORM_META[m.platform].color }}>
                      {PLATFORM_META[m.platform].label}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(m.created_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                </div>
                <a
                  href={m.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-primary hover:bg-primary/10"
                  title="링크 열기"
                >
                  <ExternalLink size={16} />
                </a>
                {m.is_active ? (
                  <button
                    onClick={() => handleEndMeeting(m)}
                    className="p-2 rounded-lg text-amber-500 hover:bg-amber-50"
                    title="정지"
                  >
                    <StopCircle size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => handleStartMeeting(m)}
                    className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-50"
                    title="시작"
                  >
                    <Play size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMeeting(m)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-50"
                  title="삭제"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
