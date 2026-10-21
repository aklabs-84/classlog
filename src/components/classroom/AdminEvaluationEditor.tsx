import { useState } from 'react';
import { Loader2, Sparkles, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { generateSeatukDraft } from '../../lib/gemini';
import { appToast, appConfirm } from '../../lib/appDialog';

interface Props {
  studentId: string;
  classId: string;
  /** 담당 선생님 id — 새 글의 주인은 담당 선생님으로 두어 선생님도 계속 볼 수 있게 한다 */
  assignedTeacherId: string | null;
  initialContent: string;
  hasExisting: boolean;
  onSaved: (content: string) => void;
}

// 프로젝트 관리자가 담당 선생님 대신 세특 글을 쓰는 칸 (직접 입력 또는 AI 초안)
export default function AdminEvaluationEditor({ studentId, classId, assignedTeacherId, initialContent, hasExisting, onSaved }: Props) {
  const { user } = useAuth();
  const [text, setText] = useState(initialContent);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (text.trim() && !(await appConfirm('지금 적힌 글이 AI 초안으로 바뀝니다. 계속할까요?'))) return;
    setGenerating(true);
    try {
      const { data: obs, error } = await supabase
        .from('observations')
        .select('activity_name, content')
        .eq('student_id', studentId)
        .eq('is_student_record', true)
        .neq('status', 'rejected');
      if (error) throw error;
      const rows = (obs || []).filter(o => (o.content || '').trim()).map(o => ({ activity_name: o.activity_name || '', content: o.content || '' }));
      if (rows.length === 0) { appToast('이 학생이 제출한 활동 기록이 없어 AI 초안을 만들 수 없어요.', 'info'); return; }
      const draft = await generateSeatukDraft(rows, '교과 세부능력 및 특기사항(세특)', '');
      setText(draft);
    } catch (e: any) {
      appToast(e?.message || 'AI 초안 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    const content = text.trim();
    if (!content) { appToast('내용을 입력해 주세요.', 'info'); return; }
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const now = new Date().toISOString();
      if (hasExisting) {
        const { data, error } = await supabase.from('student_evaluations')
          .update({ setech_content: content, admin_authored: true, updated_at: now })
          .eq('student_id', studentId).eq('class_id', classId).eq('academic_year', year)
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('저장할 글을 찾지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.');
      } else {
        const { error } = await supabase.from('student_evaluations').insert({
          student_id: studentId, class_id: classId, academic_year: year,
          teacher_id: assignedTeacherId || user?.id,
          setech_content: content, status: 'draft', admin_authored: true, updated_at: now,
        });
        if (error) throw error;
      }
      appToast('저장했어요.', 'success');
      onSaved(content);
    } catch (e: any) {
      appToast(e?.message || '저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
        placeholder="담당 선생님이 쓰지 못한 세특을 여기에 직접 쓰거나, AI 초안을 만들어 다듬어 주세요."
        className="w-full text-xs rounded-lg border border-surface-container-high bg-white px-3 py-2 leading-relaxed focus:outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleGenerate} disabled={generating || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border border-primary/30 text-primary bg-white hover:bg-primary/5 disabled:opacity-50 whitespace-nowrap">
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} AI 초안 만들기
        </button>
        <button onClick={handleSave} disabled={saving || generating || !text.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-primary text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 저장
        </button>
        <span className="text-[11px] text-on-surface-variant/60">저장하면 담당 선생님의 AI 초안 화면에도 이 글이 나타나요.</span>
      </div>
    </div>
  );
}
