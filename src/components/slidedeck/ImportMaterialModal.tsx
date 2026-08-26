import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, ChevronRight, Library, Loader2, Sparkles, X as XIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export interface AiVersion {
  id: string;
  mode: 'guide' | 'presentation';
  label: string;
  content: string;
  created_at: string;
}

export interface ImportableMaterial {
  id: string;
  class_id: string | null;
  title: string;
  content: string;
  week_number?: number;
  ai_versions?: AiVersion[];
}

interface Props {
  userId: string;
  onSelect: (material: ImportableMaterial) => void;
  onClose: () => void;
}

// class_materials.ai_versions 중 mode:'presentation' 최신본이 있으면 그걸, 없으면 원문(content)을 사용
export const resolveSourceContent = (material: ImportableMaterial): string => {
  const presentationVersions = (material.ai_versions ?? []).filter(v => v.mode === 'presentation');
  if (presentationVersions.length > 0) {
    const latest = [...presentationVersions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return latest.content;
  }
  return material.content ?? '';
};

// MaterialEditor.tsx의 ImportFromClassModal과 같은 클래스 → 자료 2단계 선택 패턴.
// 내용을 그 자리에서 복사하는 대신 선택한 자료 전체를 onSelect로 넘겨 AI 초안 생성에 사용한다.
export default function ImportMaterialModal({ userId, onSelect, onClose }: Props) {
  const [step, setStep] = useState<'class' | 'material'>('class');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState<{ id: string; name: string } | null>(null);
  const [isLibrary, setIsLibrary] = useState(false);
  const [materials, setMaterials] = useState<ImportableMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('classes')
      .select('id, name')
      .eq('teacher_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setClasses(data || []); setLoading(false); });
  }, [userId]);

  const handleSelectClass = async (cls: { id: string; name: string }) => {
    setSelectedClass(cls);
    setIsLibrary(false);
    setLoading(true);
    const { data, error } = await supabase
      .from('class_materials')
      .select('id, class_id, title, content, week_number, ai_versions')
      .eq('class_id', cls.id)
      .order('week_number', { ascending: true });
    if (error) console.error('[ImportMaterialModal] class_materials fetch error:', error);
    setMaterials((data || []) as ImportableMaterial[]);
    setLoading(false);
    setStep('material');
  };

  const handleSelectLibrary = async () => {
    setSelectedClass(null);
    setIsLibrary(true);
    setLoading(true);
    const { data, error } = await supabase
      .from('class_materials')
      .select('id, class_id, title, content, week_number, ai_versions')
      .is('class_id', null)
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false });
    if (error) console.error('[ImportMaterialModal] library materials fetch error:', error);
    setMaterials((data || []) as ImportableMaterial[]);
    setLoading(false);
    setStep('material');
  };

  const handleSelectMaterial = (material: ImportableMaterial) => {
    onSelect(material);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          {step === 'material' && (
            <button
              onClick={() => { setStep('class'); setSelectedClass(null); setIsLibrary(false); setMaterials([]); }}
              className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">
              {step === 'class' ? 'AI로 자료 가져오기' : isLibrary ? '공통 자료함' : selectedClass?.name}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {step === 'class' ? '초안을 만들 자료가 있는 클래스를 선택하세요' : '초안의 원본이 될 자료를 선택하세요'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0">
            <XIcon size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : step === 'class' ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={handleSelectLibrary}
                className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-container-low transition-colors group"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Library size={15} />
                </div>
                <span className="font-bold text-sm flex-1 text-on-surface">공통 자료함</span>
                <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
              </button>
              {classes.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3 opacity-40">
                  <BookOpen size={36} />
                  <p className="font-black text-sm">클래스가 없습니다</p>
                </div>
              ) : (
                classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleSelectClass(cls)}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-container-low transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <BookOpen size={15} />
                    </div>
                    <span className="font-bold text-sm flex-1 text-on-surface">{cls.name}</span>
                    <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
                  </button>
                ))
              )}
            </div>
          ) : (
            materials.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-3 opacity-40">
                <BookOpen size={36} />
                <p className="font-black text-sm">{isLibrary ? '공통 자료함에 자료가 없습니다' : '이 클래스에 자료가 없습니다'}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {materials.map(m => {
                  const hasPresentationVersion = (m.ai_versions ?? []).some(v => v.mode === 'presentation');
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleSelectMaterial(m)}
                      className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0">
                        <BookOpen size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-on-surface truncate">{m.title}</p>
                        {m.content && (
                          <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1 opacity-60">
                            {m.content.slice(0, 60)}…
                          </p>
                        )}
                      </div>
                      {hasPresentationVersion && (
                        <span
                          title="AI로 정리한 발표자료 버전이 있어 이걸 기반으로 초안을 만듭니다"
                          className="flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-1 shrink-0"
                        >
                          <Sparkles size={11} /> 발표자료
                        </span>
                      )}
                      <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors shrink-0" />
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
