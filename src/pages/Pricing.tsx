import { Link } from 'react-router-dom';
import { Check, X, Crown, Mail, School, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useAuth, checkIsPro, checkIsBasicOrAbove } from '../lib/auth';

// 유료 고객 확보 전까지 선결제 할인 노출을 잠시 끔 — 켤 때는 true로.
const SHOW_PREPAY_DISCOUNT = false;

type FeatureValue = boolean | string;

interface PricePeriod {
  label: string;
  total: string;
  perMonth: string;
  note: string;
}

interface Plan {
  key: string;
  name: string;
  price: string;
  priceAnnual: string;
  periods?: PricePeriod[];
  highlight: boolean;
  badge: string | null;
  colorClass: string;
  badgeClass: string;
  ctaLabel: string;
  features: Record<string, FeatureValue>;
}

export const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    price: '무료',
    priceAnnual: '',
    highlight: false,
    badge: null,
    colorClass: 'border-gray-200 bg-white',
    badgeClass: '',
    ctaLabel: '현재 이용 중',
    features: {
      classes: '클래스 1개',
      students: '학생 20명/반',
      ai: '월 20회',
      editor: 'BYOK',
      quiz: '최대 5문항',
      survey: 'BYOK',
      whiteboard: false,
      transcription: 'BYOK',
      bulkAi: false,
      naiss: false,
      teacherInvite: false,
      schoolProject: false,
    },
  },
  {
    key: 'basic',
    name: 'Basic',
    price: '9,900원',
    priceAnnual: '연 107,000원 (2개월 무료)',
    periods: [
      { label: '3개월', total: '28,200원', perMonth: '월 9,400원', note: '5%↓' },
      { label: '6개월', total: '53,400원', perMonth: '월 8,900원', note: '10%↓' },
      { label: '12개월', total: '107,000원', perMonth: '월 8,917원', note: '2개월 무료' },
    ],
    highlight: false,
    badge: null,
    colorClass: 'border-blue-200 bg-white',
    badgeClass: '',
    ctaLabel: 'Basic 시작하기',
    features: {
      classes: '클래스 5개',
      students: '학생 35명/반',
      ai: '넉넉하게',
      editor: true,
      quiz: '무제한',
      survey: '무제한',
      whiteboard: '최대 3개',
      transcription: true,
      bulkAi: false,
      naiss: false,
      teacherInvite: false,
      schoolProject: '참여만 가능',
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    price: '19,900원',
    priceAnnual: '연 215,000원 (2개월 무료)',
    periods: [
      { label: '3개월', total: '56,700원', perMonth: '월 18,900원', note: '5%↓' },
      { label: '6개월', total: '107,400원', perMonth: '월 17,900원', note: '10%↓' },
      { label: '12개월', total: '215,000원', perMonth: '월 17,917원', note: '2개월 무료' },
    ],
    highlight: true,
    badge: '추천',
    colorClass: 'border-amber-300 bg-amber-50/40',
    badgeClass: 'bg-amber-500 text-white',
    ctaLabel: 'Pro 시작하기',
    features: {
      classes: '클래스 10개',
      students: '학생 35명/반',
      ai: '가장 넉넉하게',
      editor: true,
      quiz: '무제한',
      survey: '무제한',
      whiteboard: '무제한',
      transcription: true,
      bulkAi: true,
      naiss: true,
      teacherInvite: true,
      schoolProject: '생성 · 관리',
    },
  },
];

export const FEATURE_ROWS: { label: string; key: string }[] = [
  { label: '클래스 생성', key: 'classes' },
  { label: '반당 학생 수', key: 'students' },
  { label: '퀴즈', key: 'quiz' },
  { label: '설문', key: 'survey' },
  { label: '화이트보드', key: 'whiteboard' },
  { label: '일괄 AI 생성', key: 'bulkAi' },
  { label: 'NAISS 내보내기', key: 'naiss' },
  { label: '교사 초대 연동', key: 'teacherInvite' },
  { label: '학교 프로젝트', key: 'schoolProject' },
  { label: '수업 자료 에디터', key: 'editor' },
  { label: '수업 전사', key: 'transcription' },
  { label: 'AI 사용량 (월)', key: 'ai' },
];

const SCHOOL_TIERS = [
  { name: 'School S', teachers: '최대 5명', price: '75,000원/월', annual: '연 750,000원', saving: 'Pro 개인 대비 24% 절감' },
  { name: 'School M', teachers: '최대 15명', price: '195,000원/월', annual: '연 1,950,000원', saving: 'Pro 개인 대비 34% 절감' },
  { name: 'School L', teachers: '최대 35명', price: '420,000원/월', annual: '연 4,200,000원', saving: 'Pro 개인 대비 39% 절감' },
  { name: 'School XL', teachers: '무제한', price: '별도 협의', annual: '', saving: '맞춤 견적 제공' },
];

function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true) return <Check size={16} className="text-green-500 mx-auto" strokeWidth={2.5} />;
  if (value === false) return <X size={16} className="text-gray-300 mx-auto" />;
  if (value === 'BYOK') return <span className="text-xs font-bold text-on-surface">무제한＊</span>;
  return <span className="text-xs font-bold text-on-surface">{value}</span>;
}

export default function Pricing() {
  const { profile } = useAuth();
  const currentPlan = profile?.plan ?? 'free';
  const isPro = checkIsPro(profile);
  const isBasic = checkIsBasicOrAbove(profile) && !isPro;

  function getPlanCtaState(planKey: string) {
    if (planKey === 'free') {
      return { label: '현재 이용 중', disabled: true, href: null };
    }
    if (planKey === 'basic') {
      if (isBasic) return { label: '현재 이용 중', disabled: true, href: null };
      if (isPro) return { label: '다운그레이드', disabled: true, href: null };
      return { label: '얼리버드 신청 (첫 달 50% 할인)', disabled: false, href: '/waitlist?plan=basic' };
    }
    if (planKey === 'pro') {
      if (isPro && currentPlan !== 'school') return { label: '현재 이용 중', disabled: true, href: null };
      return { label: '얼리버드 신청 (첫 달 50% 할인)', disabled: false, href: '/waitlist?plan=pro' };
    }
    return { label: '문의하기', disabled: false, href: 'mailto:aklabs84@naver.com' };
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 pb-20">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-full mb-4">
          <Crown size={14} className="text-amber-500" />
          <span className="text-xs font-black text-amber-700">요금제 안내</span>
        </div>
        <h1 className="text-3xl font-black text-on-surface mb-3">
          선생님께 딱 맞는 플랜을 선택하세요
        </h1>
        <p className="text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
          수업 기록부터 AI 세특까지, 필요한 만큼 유연하게.<br />
          연 결제 시 2개월 무료입니다.
        </p>
        {/* 현재 플랜 표시 */}
        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-xl border border-on-surface/10">
          <Sparkles size={14} className="text-primary" />
          <span className="text-xs font-bold text-on-surface-variant">
            현재 플랜:
          </span>
          <span className="text-xs font-black text-primary capitalize">
            {currentPlan === 'admin' ? 'Admin' : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
          </span>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
        {PLANS.map((plan) => {
          const cta = getPlanCtaState(plan.key);
          const isCurrent =
            (plan.key === 'free' && !isBasic && !isPro) ||
            (plan.key === 'basic' && isBasic) ||
            (plan.key === 'pro' && isPro && currentPlan !== 'school');

          return (
            <div
              key={plan.key}
              className={`relative rounded-3xl border-2 p-6 flex flex-col transition-all ${plan.colorClass} ${
                plan.highlight ? 'shadow-xl shadow-amber-100 scale-[1.02]' : 'shadow-sm'
              }`}
            >
              {plan.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-black shadow-sm ${plan.badgeClass}`}>
                  {plan.badge}
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4 px-3 py-1 rounded-full text-[11px] font-black bg-primary text-white shadow-sm">
                  현재 플랜
                </div>
              )}

              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-black text-on-surface">{plan.name}</h2>
                  {(plan.key === 'basic' || plan.key === 'pro') && !isCurrent && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700">
                      오픈 예정
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-on-surface">{plan.price}</span>
                  {plan.price !== '무료' && (
                    <span className="text-xs text-on-surface-variant font-bold">/ 월</span>
                  )}
                </div>
                {plan.priceAnnual && (
                  <p className="text-[11px] text-on-surface-variant mt-1">{plan.priceAnnual}</p>
                )}
                {SHOW_PREPAY_DISCOUNT && plan.periods && (
                  <div className="mt-3 pt-3 border-t border-on-surface/10 space-y-1.5">
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wide mb-1">
                      선결제 할인
                    </p>
                    {plan.periods.map((p) => (
                      <div key={p.label} className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-on-surface-variant">{p.label}</span>
                        <span className="font-black text-on-surface">
                          {p.total}
                          <span className="font-bold text-on-surface-variant"> ({p.perMonth}, {p.note})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {FEATURE_ROWS.map((row) => {
                  const val = plan.features[row.key];
                  if (val === false) return null;
                  if (val === 'BYOK') {
                    return (
                      <li key={row.key} className="flex items-center gap-2">
                        <Check size={14} className={plan.highlight ? 'text-amber-500' : 'text-green-500'} strokeWidth={2.5} />
                        <span className="text-xs text-on-surface">{row.label} (무제한)＊</span>
                      </li>
                    );
                  }
                  return (
                    <li key={row.key} className="flex items-center gap-2">
                      <Check size={14} className={plan.highlight ? 'text-amber-500' : 'text-green-500'} strokeWidth={2.5} />
                      <span className="text-xs text-on-surface">
                        {val === true ? row.label : `${row.label}: ${val}`}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {cta.href ? (
                cta.href.startsWith('/') ? (
                  <Link
                    to={cta.href}
                    className={`w-full py-3 rounded-2xl text-sm font-black text-center transition-all active:scale-95 flex items-center justify-center gap-2 ${
                      plan.highlight
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                        : 'bg-on-surface/5 hover:bg-on-surface/10 text-on-surface'
                    }`}
                  >
                    <Sparkles size={14} />
                    {cta.label}
                  </Link>
                ) : (
                  <a
                    href={cta.href}
                    className={`w-full py-3 rounded-2xl text-sm font-black text-center transition-all active:scale-95 flex items-center justify-center gap-2 ${
                      plan.highlight
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200'
                        : 'bg-on-surface/5 hover:bg-on-surface/10 text-on-surface'
                    }`}
                  >
                    <Mail size={14} />
                    {cta.label}
                  </a>
                )
              ) : (
                <div
                  className={`w-full py-3 rounded-2xl text-sm font-black text-center ${
                    isCurrent
                      ? 'bg-primary/10 text-primary'
                      : 'bg-on-surface/5 text-on-surface-variant'
                  }`}
                >
                  {cta.label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white rounded-3xl border border-on-surface/10 shadow-sm overflow-hidden mb-12">
        <div className="px-6 py-4 border-b border-on-surface/5">
          <h3 className="text-sm font-black text-on-surface">기능 상세 비교</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-on-surface/5">
                <th className="text-left px-6 py-3 text-xs font-black text-on-surface-variant w-1/2">기능</th>
                {PLANS.map((p) => (
                  <th key={p.key} className={`px-4 py-3 text-center text-xs font-black ${p.highlight ? 'text-amber-600' : 'text-on-surface-variant'}`}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row, i) => (
                <tr key={row.key} className={`border-b border-on-surface/5 last:border-0 ${i % 2 === 0 ? 'bg-surface/40' : ''}`}>
                  <td className="px-6 py-3 text-xs font-bold text-on-surface">{row.label}</td>
                  {PLANS.map((p) => (
                    <td key={p.key} className="px-4 py-3 text-center">
                      <FeatureCell value={p.features[row.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-5 border-t border-on-surface/5 bg-surface-container-low/60">
          <p className="text-xs font-black text-on-surface mb-3">직접 API 키 등록 vs 결제, 뭐가 다를까요?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-3.5 border border-on-surface/10">
              <p className="text-[11px] font-black text-on-surface-variant mb-1.5">직접 API 키 등록 (무료)</p>
              <ul className="text-[11px] text-on-surface-variant space-y-1 leading-relaxed">
                <li>· Google AI Studio 가입 → 키 발급 → 등록 필요</li>
                <li>· 기기마다 다시 등록해야 함</li>
                <li>· 사용량이 많아지면 Google 요금이 별도로 청구될 수 있음</li>
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-3.5 border border-amber-200">
              <p className="text-[11px] font-black text-amber-700 mb-1.5">Basic/Pro 결제</p>
              <ul className="text-[11px] text-on-surface-variant space-y-1 leading-relaxed">
                <li>· 가입 즉시, 설정 없이 모든 기기에서 바로 사용</li>
                <li>· 사용량 걱정 없이 넉넉하게</li>
                <li>· 학급 관리 · 무제한 콘텐츠 · 학교 기능까지 포함</li>
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-3">
            ＊ 먼저 가볍게 써보고 싶다면, 설정 페이지에서 본인 Gemini 키를 직접 등록해 Free 플랜에서도 AI 기능을 체험할 수 있어요.
          </p>
        </div>
      </div>

      {/* School Plan Section */}
      <div className="rounded-3xl border-2 border-violet-200 bg-violet-50/50 p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-violet-100 rounded-2xl flex items-center justify-center shrink-0">
            <School size={24} className="text-violet-600" />
          </div>
          <div>
            <h3 className="text-lg font-black text-on-surface mb-1">School 플랜 — 학교 단위 도입</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              학교 전체 교사가 함께 사용하는 플랜입니다. 교사 수 기준 티어제로,
              Pro 개인 구매 대비 최대 <span className="font-black text-violet-700">39% 절감</span>됩니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {SCHOOL_TIERS.map((tier) => (
            <div key={tier.name} className="bg-white rounded-2xl p-4 border border-violet-100">
              <p className="text-sm font-black text-violet-700 mb-1">{tier.name}</p>
              <p className="text-xs text-on-surface-variant mb-2">{tier.teachers}</p>
              <p className="text-base font-black text-on-surface">{tier.price}</p>
              {tier.annual && <p className="text-[11px] text-on-surface-variant">{tier.annual}</p>}
              <p className="text-[11px] text-violet-600 font-bold mt-1">{tier.saving}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <a
            href="mailto:aklabs84@naver.com?subject=클래스로그 School 플랜 도입 문의"
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-black rounded-2xl transition-all active:scale-95 shadow-lg shadow-violet-200"
          >
            <Mail size={16} />
            학교 도입 문의하기
          </a>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Zap size={13} className="text-violet-400" />
            School 플랜은 이메일 문의 후 관리자가 직접 설정해 드립니다
          </div>
        </div>
      </div>

      {/* 해지 · 환불 정책 */}
      <div className="mt-8 bg-surface-container-low rounded-3xl border border-on-surface/10 p-6">
        <h3 className="text-sm font-black text-on-surface mb-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" /> 해지 · 환불 정책
        </h3>
        <ul className="space-y-2 text-xs text-on-surface-variant leading-relaxed list-disc pl-4">
          <li>결제 후 7일 이내이고 서비스를 이용하지 않으셨다면 전액 환불해 드립니다.</li>
          <li>7일이 지난 뒤 해지하시는 경우, 실제 이용한 기간을 제외한 잔여 기간을 일할 계산하여 환불해 드립니다.</li>
          <li>환불 요청은 이메일(aklabs84@naver.com)로 접수하며, 영업일 기준 5일 이내 처리됩니다.</li>
          <li>무료(Free) 플랜은 환불 대상이 아닙니다.</li>
        </ul>
        <a href="/terms" className="inline-block mt-3 text-xs text-primary underline underline-offset-2 font-bold">
          이용약관에서 전체 내용 보기
        </a>
      </div>

      {/* 결제 예정 안내 */}
      <p className="text-center text-xs text-on-surface-variant mt-8">
        온라인 결제 기능은 준비 중입니다. 지금 얼리버드로 신청하시면 오픈 시 <strong className="text-amber-600">첫 달 50% 할인</strong>을 받으실 수 있어요.
      </p>
    </div>
  );
}
