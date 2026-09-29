import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  schoolId: string;
  initialName: string;
  initialRegion: string | null;
  onClose: () => void;
  onSaved: (name: string, region: string | null) => void;
}

const SchoolInfoEditModal = ({ schoolId, initialName, initialRegion, onClose, onSaved }: Props) => {
  const [name, setName] = useState(initialName);
  const [region, setRegion] = useState(initialRegion || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const nextName = name.trim();
    const nextRegion = region.trim() || null;
    if (!nextName) return;
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('school_projects')
        .update({ name: nextName, school_name: nextName, region: nextRegion })
        .eq('id', schoolId);
      if (updateError) throw updateError;
      // 학교 대표 반 이름("○○학교 (전체)")도 함께 변경
      await supabase
        .from('classes')
        .update({ name: `${nextName} (전체)` })
        .eq('school_project_id', schoolId)
        .is('parent_class_id', null);
      onSaved(nextName, nextRegion);
      onClose();
    } catch (err) {
      console.error('school info update error:', err);
      setError('수정에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && onClose()}>
      <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-lg">학교 정보 수정</h2>
          <button onClick={onClose} disabled={saving} className="p-1 rounded-lg hover:bg-surface-container-high text-on-surface-variant">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-on-surface-variant">학교명</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: OO중학교"
              className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-on-surface-variant">지역 (선택)</label>
            <input
              type="text"
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="예: 서울"
              className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-container hover:bg-surface-container-high transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SchoolInfoEditModal;
