import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, School, Sparkles, Users, BookOpen, ClipboardList,
  FileText, Star, CheckCircle, X, Loader2, GraduationCap,
  MessageSquare, Phone, Building2, ChevronRight,
} from 'lucide-react';

const FEATURES = [
  {
    icon: <Building2 size={22} className="text-violet-600" />,
    title: '기관 그룹 관리',
    desc: '교장·원장이 기관 그룹을 개설하고 교사·강사를 초대해 학교·학원 단위로 함께 사용합니다.',
  },
  {
    icon: <Users size={22} className="text-indigo-600" />,
    title: '역할 & 권한 분리',
    desc: '관리자·멘토·일반 교사·강사 역할을 구분하여 기관 내 권한을 체계적으로 운영합니다.',
  },
  {
    icon: <BookOpen size={22} className="text-emerald-600" />,
    title: '학부모 공유 URL',
    desc: '각 학급·반의 수업·평가 기록을 전용 URL로 공유해 학부모·학생 모두 실시간 열람 가능합니다.',
  },
  {
    icon: <ClipboardList size={22} className="text-amber-600" />,
    title: '나이스 제출 자동화 (학교)',
    desc: 'AI가 학급 전체 세특 초안을 일괄 생성하고, 나이스 제출용 엑셀로 한 번에 다운로드합니다. 학교 전용 기능입니다.',
  },
  {
    icon: <FileText size={22} className="text-rose-500" />,
    title: 'AI 학습 리포트',
    desc: 'AI가 수업·활동 기록을 분석해 학생별 맞춤 리포트를 자동 생성합니다. 학교 세특·학원 학습 현황 모두 지원합니다.',
  },
  {
    icon: <Sparkles size={22} className="text-sky-500" />,
    title: '공동 수업 기록',
    desc: '기관 내 교사·강사 전체가 프로젝트·수업 내용을 함께 기록하고 성과를 한 화면에서 확인합니다.',
  },
];

const STEPS = [
  { num: '01', label: '도입 문의 접수', desc: '기관명·유형·교사(강사) 수를 적어 문의를 보내주세요.' },
  { num: '02', label: '전용 그룹 개설', desc: '아크 AI 랩스가 학교·학원 전용 그룹을 설정합니다.' },
  { num: '03', label: '교사·강사 초대', desc: '초대 링크로 소속 선생님이 바로 합류합니다.' },
  { num: '04', label: 'AI 기록 시작', desc: '오늘부터 기관 전체 수업 기록을 AI로 관리하세요.' },
];

const TIERS = [
  { range: '~ 5명', price: '월 75,000원', annual: '연 750,000원', saving: 'Pro 대비 24% 절감' },
  { range: '~ 15명', price: '월 195,000원', annual: '연 1,950,000원', saving: 'Pro 대비 34% 절감' },
  { range: '~ 35명', price: '월 420,000원', annual: '연 4,200,000원', saving: 'Pro 대비 39% 절감' },
  { range: '35명~', price: '별도 문의', annual: '', saving: '맞춤 견적 제공' },
];

const INCLUDES_COMMON = [
  '기관 그룹 개설 및 교사·강사 무제한 초대',
  '관리자·멘토·일반 역할 구분 및 권한 관리',
  '학부모·학생 공유 URL (수업·평가 기록 열람)',
  'AI 학습 리포트 자동 생성 (구성원 수 × 월 200회)',
  '퀴즈·화이트보드·설문 무제한 생성',
  '수업 녹음 AI 전사 기능',
  '공동 프로젝트 수업 기록 및 협업',
  '전용 도입 지원 및 온보딩 자료 제공',
];

const INCLUDES_SCHOOL = [
  '나이스 제출용 세특 엑셀 일괄 내보내기',
  'AI 세특 초안 일괄 생성',
];

const INCLUDES_ACADEMY = [
  '수강생별 학습 성취도 추적',
  '학원 커리큘럼 진도 관리',
];

// ── 도입 문의 모달 ─────────────────────────────────────────────────────────────

interface InquiryForm {
  org_type: '학교' | '학원' | '';
  org_name: string;
  contact_name: string;
  email: string;
  phone: string;
  member_count: string;
  message: string;
}

function InquiryModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<InquiryForm>({
    org_type: '',
    org_name: '',
    contact_name: '',
    email: '',
    phone: '',
    member_count: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof InquiryForm, val: string) =>
    setForm(p => ({ ...p, [key]: val }));

  const canSubmit =
    form.org_type && form.org_name.trim() && form.contact_name.trim() &&
    form.email.trim() && form.member_count.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/slack?type=school-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('전송 실패');
      setDone(true);
    } catch {
      setError('전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-white rounded-t-3xl px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-black text-gray-900">도입 문의하기</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              문의 접수 후 1~2 영업일 내에 연락드립니다
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-4"
          >
            <X size={18} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            /* 성공 화면 */
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-6 py-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-emerald-500" />
              </div>
              <h3 className="text-lg font-black text-gray-900 mb-1">문의가 접수되었습니다!</h3>
              <p className="text-sm text-gray-500 mb-8">
                담당자가 확인 후 <strong>{form.email}</strong>로<br />1~2 영업일 내에 연락드립니다.
              </p>

              {/* 다음 단계 가이드 */}
              <div className="bg-violet-50 rounded-2xl p-5 text-left space-y-3 mb-6">
                <p className="text-xs font-black text-violet-700 uppercase tracking-wider mb-3">
                  다음 단계 안내
                </p>
                {[
                  { step: '01', title: '이메일 확인', desc: '담당자 확인 이메일을 보내드립니다.' },
                  { step: '02', title: '상담 진행', desc: '기관 규모·필요 기능에 맞춰 안내해드립니다.' },
                  { step: '03', title: '그룹 개설', desc: '1~2 영업일 내 전용 그룹이 설정됩니다.' },
                  { step: '04', title: '무료 체험', desc: '기다리는 동안 개인 계정으로 먼저 체험해 보세요.' },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-3">
                    <span className="text-xs font-black text-violet-400 w-5 shrink-0 pt-0.5">{item.step}</span>
                    <div>
                      <p className="text-xs font-black text-violet-800">{item.title}</p>
                      <p className="text-xs text-violet-600/80 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <a
                  href="/"
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-black rounded-2xl transition-colors text-center flex items-center justify-center gap-2"
                >
                  <GraduationCap size={15} />
                  무료 체험 시작하기
                </a>
                <button
                  onClick={onClose}
                  className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          ) : (
            /* 입력 폼 */
            <motion.div key="form" className="px-6 py-5 space-y-4">
              {/* 기관 유형 */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-2">
                  기관 유형 <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['학교', '학원'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => set('org_type', type)}
                      className={`py-3 rounded-2xl text-sm font-black border-2 transition-all ${
                        form.org_type === type
                          ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-100'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
                      }`}
                    >
                      {type === '학교' ? '🏫 학교' : '🎓 학원'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 기관명 */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">
                  {form.org_type === '학원' ? '학원명' : '학교명'} <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    value={form.org_name}
                    onChange={e => set('org_name', e.target.value)}
                    placeholder={form.org_type === '학원' ? '○○학원' : '○○고등학교'}
                    className="w-full pl-9 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 담당자 & 이메일 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1.5">
                    담당자 이름 <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={form.contact_name}
                    onChange={e => set('contact_name', e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-700 mb-1.5">
                    교사·강사 수 <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Users size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                    <input
                      type="number"
                      min={1}
                      value={form.member_count}
                      onChange={e => set('member_count', e.target.value)}
                      placeholder="예) 20"
                      className="w-full pl-9 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* 이메일 */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">
                  이메일 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="example@school.kr"
                    className="w-full pl-9 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 연락처 */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">
                  연락처 <span className="text-xs font-normal text-gray-400">(선택)</span>
                </label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full pl-9 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                  />
                </div>
              </div>

              {/* 문의 내용 */}
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">
                  문의 내용 <span className="text-xs font-normal text-gray-400">(선택)</span>
                </label>
                <div className="relative">
                  <MessageSquare size={15} className="absolute left-3.5 top-3.5 text-gray-300" />
                  <textarea
                    value={form.message}
                    onChange={e => set('message', e.target.value)}
                    placeholder="궁금한 점이나 요청 사항을 자유롭게 적어주세요."
                    rows={3}
                    className="w-full pl-9 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent resize-none"
                  />
                </div>
              </div>

              {/* 에러 */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 font-medium">
                  <X size={13} className="shrink-0" /> {error}
                </div>
              )}

              {/* 제출 버튼 */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-2xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-lg shadow-violet-100"
              >
                {submitting ? (
                  <><Loader2 size={16} className="animate-spin" /> 전송 중...</>
                ) : (
                  <><ChevronRight size={16} /> 도입 문의 보내기</>
                )}
              </button>

              <p className="text-center text-[11px] text-gray-400">
                문의 접수 후 1~2 영업일 내 이메일로 연락드립니다
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function SchoolIntroPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-indigo-50 font-manrope">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-violet-100">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <span className="font-black text-indigo-900 text-sm">클래스로그 AI</span>
          </a>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-black rounded-xl transition-all active:scale-95"
          >
            <Mail size={13} />
            도입 문의
          </button>
        </div>
      </header>

      {/* 히어로 */}
      <section className="max-w-5xl mx-auto px-4 pt-16 pb-14 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 text-xs font-black rounded-full mb-5">
          <Sparkles size={12} /> School 플랜 · 학교 &amp; 학원
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight mb-4">
          우리 학교·학원에<br className="hidden sm:block" /> 클래스로그 AI를 도입해보세요
        </h1>
        <p className="text-base text-gray-500 leading-relaxed max-w-xl mx-auto mb-8">
          수업 기록·AI 리포트·학부모 공유까지,<br />
          기관 단위로 함께 쓰면 개인 Pro 플랜보다 최대 <strong className="text-violet-700">39%</strong> 저렴합니다.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg shadow-violet-200 text-sm"
          >
            <Mail size={16} />
            학교·학원 도입 문의하기
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white hover:bg-violet-50 text-violet-700 font-black rounded-2xl border border-violet-200 transition-all text-sm"
          >
            무료 체험 먼저 해보기
          </a>
        </div>
      </section>

      {/* 주요 기능 */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-black text-gray-800 text-center mb-8">School 플랜 주요 기능</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mb-3">
                {f.icon}
              </div>
              <p className="font-black text-sm text-gray-900 mb-1">{f.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 학교 vs 학원 비교 */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-black text-gray-800 text-center mb-8">학교·학원별 활용 방식</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-violet-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <School size={20} className="text-violet-600" />
              <p className="font-black text-sm text-violet-700">학교에서는</p>
            </div>
            <ul className="space-y-2.5">
              {[
                'AI 세특 일괄 생성 → 나이스 엑셀 제출',
                '학급별 수업 기록 & 생활기록부 관리',
                '전교 프로젝트 공동 기록',
                '학생 활동 포트폴리오 자동 축적',
              ].map(t => (
                <li key={t} className="flex items-start gap-2 text-xs text-gray-600">
                  <CheckCircle size={13} className="text-violet-400 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-indigo-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <GraduationCap size={20} className="text-indigo-600" />
              <p className="font-black text-sm text-indigo-700">학원에서는</p>
            </div>
            <ul className="space-y-2.5">
              {[
                '강사별 수업 기록 통합 관리',
                '수강생 성취도 AI 분석 & 학부모 공유',
                '반별 커리큘럼 진도 추적',
                '퀴즈·화이트보드로 참여형 수업',
              ].map(t => (
                <li key={t} className="flex items-start gap-2 text-xs text-gray-600">
                  <CheckCircle size={13} className="text-indigo-400 shrink-0 mt-0.5" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 도입 단계 */}
      <section className="bg-gradient-to-r from-violet-600 to-indigo-600 py-14">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-xl font-black text-white text-center mb-10">도입 절차</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div key={s.num} className="bg-white/10 backdrop-blur rounded-2xl p-5 text-center">
                <p className="text-2xl font-black text-white/40 mb-2">{s.num}</p>
                <p className="font-black text-white text-sm mb-1">{s.label}</p>
                <p className="text-xs text-white/70 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 요금 */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-xl font-black text-gray-800 text-center mb-2">School 플랜 요금</h2>
        <p className="text-center text-sm text-gray-400 mb-8">교사·강사 수 기준 티어제 · 기관 전체 무제한 기능 제공</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {TIERS.map((t) => (
            <div key={t.range} className="bg-white rounded-2xl p-5 border border-violet-100 shadow-sm text-center">
              <p className="text-xs font-bold text-violet-500 mb-1">{t.range}</p>
              <p className="text-lg font-black text-gray-900 mb-0.5">{t.price}</p>
              {t.annual && <p className="text-[11px] text-gray-400 mb-1">{t.annual}</p>}
              <p className="text-xs font-bold text-emerald-600">{t.saving}</p>
            </div>
          ))}
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
          <Star size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            School 플랜은 문의 접수 후 관리자가 직접 설정해드립니다.<br />
            온라인 결제 기능은 곧 추가될 예정입니다.
          </p>
        </div>
      </section>

      {/* 포함 기능 목록 */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <h2 className="text-xl font-black text-gray-800 text-center mb-8">School 플랜에 포함된 모든 것</h2>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          {INCLUDES_COMMON.map((item) => (
            <div key={item} className="flex items-center gap-3 px-5 py-4 border-b border-gray-50">
              <CheckCircle size={16} className="text-emerald-500 shrink-0" />
              <span className="text-sm text-gray-700">{item}</span>
            </div>
          ))}
          <div className="px-5 py-3 bg-violet-50 border-b border-violet-100">
            <p className="text-[10px] font-black text-violet-500 uppercase tracking-wider">학교 전용</p>
          </div>
          {INCLUDES_SCHOOL.map((item) => (
            <div key={item} className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-violet-50/40">
              <CheckCircle size={16} className="text-violet-400 shrink-0" />
              <span className="text-sm text-gray-700">{item}</span>
            </div>
          ))}
          <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">학원 전용</p>
          </div>
          {INCLUDES_ACADEMY.map((item) => (
            <div key={item} className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-indigo-50/40">
              <CheckCircle size={16} className="text-indigo-400 shrink-0" />
              <span className="text-sm text-gray-700">{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA 배너 */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-3xl p-8 sm:p-10 text-center">
          <p className="text-2xl font-black text-white mb-2">지금 바로 도입 문의하세요</p>
          <p className="text-sm text-white/80 mb-6">학교·학원 규모에 맞는 플랜을 1~2 영업일 내에 설정해드립니다.</p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-violet-700 font-black rounded-2xl hover:bg-violet-50 transition-all active:scale-95 text-sm shadow-lg"
          >
            <Mail size={16} />
            학교·학원 도입 문의하기 →
          </button>
          <p className="mt-4 text-xs text-white/60">aklabs84@naver.com · 평일 오전 9시 ~ 오후 6시</p>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="border-t border-gray-100 py-8 text-center">
        <p className="text-xs text-gray-400">클래스로그 AI — 아크 AI 랩스 · aklabs84@naver.com</p>
        <div className="flex justify-center gap-4 mt-3">
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">홈으로</a>
          <a href="/privacy" className="text-xs text-gray-400 hover:text-gray-600">개인정보처리방침</a>
        </div>
      </footer>

      {/* 도입 문의 모달 */}
      <AnimatePresence>
        {modalOpen && <InquiryModal onClose={() => setModalOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
