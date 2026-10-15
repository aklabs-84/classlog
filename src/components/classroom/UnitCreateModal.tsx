import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { motion } from 'framer-motion';
import { X, BookOpen, Lightbulb, Check } from 'lucide-react';

interface FormConfig {
  self_eval: boolean;
  inquiry_reflection: boolean;
  performance_record: boolean;
  reading_record: boolean;
}

interface FormGuides {
  self_eval?: string;
  inquiry_reflection?: string;
  performance_record?: string;
  reading_record?: string;
}

interface Props {
  classId: string;
  teacherId: string;
  onClose: () => void;
  onCreated: () => void;
  editUnit?: any;
}

const FORM_ITEMS = [
  {
    key: 'self_eval' as keyof FormConfig,
    label: '자기평가서',
    desc: '내가 이번 단원에서 잘한 점, 아쉬운 점, 앞으로 개선할 점을 솔직하게 씁니다',
    defaultGuide: '이번 단원에서 본인이 가장 잘 수행한 부분과 부족했던 점을 솔직하게 작성하고, 다음에 개선하고 싶은 점을 구체적으로 서술하세요. (50자 이상)'
  },
  {
    key: 'inquiry_reflection' as keyof FormConfig,
    label: '탐구소감문',
    desc: '탐구·실험을 하면서 발견한 것, 어려웠던 것, 새롭게 알게 된 것을 씁니다 (300자)',
    defaultGuide: '탐구 과정에서 발견한 점, 어려움과 해결 과정, 새롭게 알게 된 내용을 구체적인 근거와 함께 100자 이상 300자 이내로 작성하세요.'
  },
  {
    key: 'performance_record' as keyof FormConfig,
    label: '수행평가 활동 기술',
    desc: '내가 맡은 역할과 활동 과정을 구체적으로 씁니다. 선생님의 생활기록부 작성에 활용됩니다 (500자)',
    defaultGuide: '수행평가 활동에서 본인이 담당한 역할, 활동 과정, 결과물의 특징을 구체적으로 기술하세요. 선생님이 생활기록부(세특) 작성 시 활용합니다. (150자 이상 500자 이내)'
  },
  {
    key: 'reading_record' as keyof FormConfig,
    label: '독서기록',
    desc: '이번 단원과 관련해 읽은 책의 제목·저자·느낀 점을 씁니다',
    defaultGuide: '이번 단원과 연계하여 읽은 책의 제목, 저자, 가장 인상 깊은 내용과 이를 통해 확장한 탐구 방향을 50자 이상 작성하세요.'
  }
];

const UnitCreateModal = ({ classId, teacherId, onClose, onCreated, editUnit }: Props) => {
  const [title, setTitle] = useState(editUnit?.title || '');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const [description, setDescription] = useState(editUnit?.description || '');
  const [formConfig, setFormConfig] = useState<FormConfig>(
    editUnit?.form_config || {
      self_eval: false,
      inquiry_reflection: false,
      performance_record: true,
      reading_record: false
    }
  );
  const [formGuides, setFormGuides] = useState<FormGuides>(editUnit?.form_guides || {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('단원 제목을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      if (editUnit) {
        const { error } = await supabase
          .from('units')
          .update({ title, description, form_config: formConfig, form_guides: formGuides })
          .eq('id', editUnit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('units')
          .insert({
            class_id: classId,
            teacher_id: teacherId,
            title,
            description,
            form_config: formConfig,
            form_guides: formGuides,
            status: 'active'
          });
        if (error) throw error;
      }
      onCreated();
      onClose();
    } catch (err: any) {
      alert('저장 중 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-8 border-b border-surface-container flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold">{editUnit ? '단원 수정' : '새 단원 만들기'}</h2>
              <p className="text-[14px] font-bold text-on-surface-variant mt-0.5">
                학생들이 단원 마무리 시 제출할 서식을 설정하세요.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-2xl bg-surface-container hover:bg-surface-container-high flex items-center justify-center transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-8 space-y-8">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[14px] font-bold text-primary  ml-1">
                단원 제목 *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="예: 1단원 — 현대시의 이해와 감상"
                className="w-full px-6 py-4 bg-surface-container rounded-2xl font-bold text-base focus:outline-none focus:ring-4 focus:ring-primary/10 border-2 border-transparent focus:border-primary/20 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[14px] font-bold text-on-surface-variant  ml-1">
                단원 설명 (선택)
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="이 단원의 학습 목표나 핵심 내용을 간략히 설명하세요."
                rows={2}
                className="w-full px-6 py-4 bg-surface-container rounded-2xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 border-2 border-transparent focus:border-primary/20 resize-none transition-all"
              />
            </div>
          </div>

          {/* Form Config */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-on-surface ">마무리 서식 선택</h3>
              <p className="text-[14px] font-bold text-on-surface-variant">체크된 항목만 학생에게 표시됩니다</p>
            </div>
            <div className="space-y-3">
              {FORM_ITEMS.map(item => (
                <div
                  key={item.key}
                  className={`rounded-2xl border-2 transition-all ${
                    formConfig[item.key]
                      ? 'border-primary/20 bg-primary/[0.03]'
                      : 'border-surface-container bg-surface-container-low'
                  }`}
                >
                  <div
                    className="flex items-center gap-4 p-5 cursor-pointer"
                    onClick={() => setFormConfig(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  >
                    <div
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                        formConfig[item.key]
                          ? 'bg-primary border-primary text-white'
                          : 'border-neutral-300 bg-white'
                      }`}
                    >
                      {formConfig[item.key] && <Check size={14} />}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{item.label}</p>
                      <p className="text-[14px] text-on-surface-variant font-bold mt-0.5">{item.desc}</p>
                    </div>
                  </div>

                  {formConfig[item.key] && (
                    <div className="px-5 pb-5">
                      <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-primary/10">
                        <Lightbulb size={16} className="text-primary mt-1 shrink-0" />
                        <div className="flex-1">
                          <p className="text-[14px] font-bold text-primary  mb-2">
                            학생 입력 가이드 (비워두면 기본 안내문 사용)
                          </p>
                          <textarea
                            value={formGuides[item.key] || ''}
                            onChange={e =>
                              setFormGuides(prev => ({ ...prev, [item.key]: e.target.value }))
                            }
                            placeholder={item.defaultGuide}
                            rows={2}
                            onClick={e => e.stopPropagation()}
                            className="w-full text-[14px] font-bold text-on-surface bg-transparent resize-none focus:outline-none placeholder:text-on-surface-variant leading-relaxed"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-surface-container flex gap-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-surface-container rounded-2xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex-[2] py-4 btn-gradient rounded-2xl font-bold text-base shadow-lg shadow-primary/20 disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-95"
          >
            {saving ? '저장 중...' : editUnit ? '수정 완료' : '단원 만들기'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default UnitCreateModal;
