import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lightbulb, Sparkles, FileText, Presentation, MessageCircleQuestion, ArrowRight, PenLine } from 'lucide-react';

const SAMPLE_IDEA = '3단원 광합성 수업, 실험 위주로 하고 싶은데 어떻게 구성하면 좋을지 모르겠어요. 학생들이 직접 관찰하고 기록하는 활동이 있었으면 좋겠어요.';

type ActionKey = 'simple' | 'detailed' | 'slide' | 'wizard';

const ACTIONS: { key: ActionKey; icon: typeof Sparkles; label: string; desc: string; sample: string }[] = [
  {
    key: 'simple',
    icon: Sparkles,
    label: '간단히',
    desc: '적어둔 내용을 바탕으로 500~800자 분량의 수업 계획안 초안을 즉시 만들어요.',
    sample: '## 수업 목표\n광합성 과정을 실험 관찰을 통해 이해한다.\n\n## 도입 (5분)\n식물이 없는 세상을 상상해보는 질문으로 시작...\n\n## 전개 (30분)\n모둠별 엽록소 추출 실험 진행, 관찰 기록지 작성...\n\n## 정리 (10분)\n모둠별 관찰 결과 공유 및 정리',
  },
  {
    key: 'detailed',
    icon: FileText,
    label: '자세히',
    desc: '같은 초안을 1500자 이상 분량으로, 준비물·유의사항까지 포함해 더 촘촘하게 만들어요.',
    sample: '## 수업 목표\n광합성 과정을 실험 관찰을 통해 이해하고, 관찰 결과를 과학적으로 기록한다.\n\n## 도입 (7분)\n"식물이 없다면?" 질문으로 흥미 유발 후 학습 목표 안내...\n\n## 전개 (35분)\n1) 모둠 구성 및 실험 안내 (5분)\n2) 엽록소 추출 실험 진행 (15분)\n3) 관찰 기록지 작성 (15분)...\n\n## 준비물 및 유의사항\n에탄올 사용 시 화기 주의, 모둠당 시금치 잎 5장...',
  },
  {
    key: 'slide',
    icon: Presentation,
    label: '슬라이드로 만들기',
    desc: '적어둔 내용을 AI가 발표용 슬라이드 구조로 재구성해요. 템플릿을 고르면 바로 슬라이드 덱이 만들어져요.',
    sample: '1. 표지 — 광합성 실험 수업\n2. 도입 — "식물이 없다면?"\n3. 학습 목표\n4. 실험 안내 — 준비물 · 절차\n5. 관찰 포인트 정리\n6. 모둠 활동 안내\n7. 마무리 — 관찰 결과 공유',
  },
  {
    key: 'wizard',
    icon: MessageCircleQuestion,
    label: 'AI와 질문하며 구체화하기',
    desc: 'AI가 인원·기간·이해도·참여성향 등을 몇 단계 질문으로 물어보고, 답변을 종합해 더 맞춤화된 수업 기획서(PRD)를 만들어요. 확정 전 반려하고 다시 다듬을 수도 있어요.',
    sample: 'Q1. 이 수업은 몇 명 정도의 학생과 함께하나요?\n → 25~30명\nQ2. 수업 기간은 어느 정도인가요?\n → 1차시(45분)\nQ3. 학생들의 참여 성향은 어떤가요?\n → 실습 활동을 좋아하는 편\n...\n\n→ 답변을 종합해 "실험 중심 1차시 수업 기획서" 생성 → 검토 후 승인하면 계획서/슬라이드로 완성',
  },
];

export default function IdeaRecordGuideModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<ActionKey>('simple');
  const active = ACTIONS.find(a => a.key === selected)!;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-3xl shadow-elevated w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative overflow-hidden p-6 pb-5">
          <div className="absolute -top-16 -right-10 -z-10 w-64 h-64 rounded-full bg-gradient-to-br from-primary to-secondary opacity-[0.12] blur-[60px] pointer-events-none" />
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-1.5 text-[11px] font-black tracking-wide text-primary mb-2">
            <Lightbulb size={13} /> 아이디어 기록, 이렇게 써보세요
          </div>
          <h2 className="text-xl font-black text-on-surface tracking-tightest leading-tight">
            떠오른 생각을 적으면, <span className="gradient-text">AI가 수업으로 발전</span>시켜드려요
          </h2>
          <p className="text-sm text-on-surface-variant mt-2">
            기록 → AI로 발전 → 수업 자료실에서 완성, 3단계로 이어져요.
          </p>
        </div>

        <div className="px-6 pb-3">
          <div className="rounded-2xl border border-primary/10 bg-primary/[0.03] p-4">
            <div className="flex items-center gap-1.5 text-[11px] font-black text-on-surface-variant/50 mb-2">
              <PenLine size={12} /> 예시로 이렇게 적어보세요
            </div>
            <p className="text-sm font-medium text-on-surface leading-relaxed">{SAMPLE_IDEA}</p>
          </div>
        </div>

        <div className="px-6 pb-2">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-on-surface-variant/50 mb-2 mt-3">
            <ArrowRight size={12} /> 이 내용을 적고 버튼을 누르면
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {ACTIONS.map(a => (
              <button
                key={a.key}
                onClick={() => setSelected(a.key)}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[11px] font-black transition-all ${
                  selected === a.key ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <a.icon size={15} />
                <span className="text-center leading-tight">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 pt-2">
          <div className="rounded-2xl border border-on-surface/[0.06] bg-surface-container-low p-4 space-y-3">
            <p className="text-xs font-bold text-on-surface-variant/70">{active.desc}</p>
            <div className="rounded-xl bg-surface-container-lowest border border-on-surface/[0.06] p-3.5">
              <pre className="text-[11px] font-medium text-on-surface/70 whitespace-pre-wrap leading-relaxed font-sans">{active.sample}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
