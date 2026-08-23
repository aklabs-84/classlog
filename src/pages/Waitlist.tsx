import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PLAN_OPTIONS = [
  { value: 'basic', label: 'Basic (9,900원/월 예정)' },
  { value: 'pro', label: 'Pro (19,900원/월 예정)' },
  { value: 'school', label: 'School (학교·학원 단위)' },
  { value: 'unsure', label: '아직 잘 모르겠어요' },
];

const Waitlist = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get('plan');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [planInterest, setPlanInterest] = useState(
    PLAN_OPTIONS.some((p) => p.value === initialPlan) ? (initialPlan as string) : 'basic'
  );
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase.from('payment_waitlist').insert({
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      phone: phone.trim() || null,
      plan_interest: planInterest,
      memo: memo.trim() || null,
      source: 'waitlist_page',
    });

    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        setErrorMsg('이미 신청된 이메일입니다. 유료 플랜 오픈 시 순서대로 안내드릴게요!');
        return;
      }
      setErrorMsg('신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    // 슬랙 알림 (실패해도 신청은 이미 저장됐으므로 무시)
    try {
      await fetch('/api/slack?type=waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          phone: phone.trim() || null,
          plan_interest: planInterest,
          memo: memo.trim() || null,
        }),
      });
    } catch {
      // 무시
    }

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      <div className="max-w-lg mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 font-bold mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> 뒤로가기
        </button>

        {submitted ? (
          <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8 text-center">
            <CheckCircle2 size={40} className="text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-black text-gray-900 mb-2">신청 완료했습니다!</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              유료 플랜 결제가 열리면 <strong>가장 먼저</strong> 이메일로 안내드리고,
              <br />
              신청해 주신 분께는 <strong className="text-amber-600">첫 달 50% 할인</strong>을 드립니다.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-full mb-4">
              <Sparkles size={14} className="text-amber-600" />
              <span className="text-xs font-black text-amber-700">얼리버드 웨이팅리스트</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">
              유료 플랜, 곧 오픈합니다
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              결제 시스템을 준비 중입니다. 지금 미리 신청해 주시면 오픈 즉시 안내드리고,
              <strong className="text-amber-700"> 첫 달 이용료를 50% 할인</strong>해 드립니다.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">이메일 *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">이름 (선택)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">휴대폰 번호 (선택)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">관심 있는 플랜</label>
                <select
                  value={planInterest}
                  onChange={(e) => setPlanInterest(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">하고 싶은 말 (선택)</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  placeholder="원하는 기능이나 궁금한 점을 남겨주세요"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {errorMsg && <p className="text-xs text-red-600 font-bold">{errorMsg}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-amber-500 hover:bg-amber-600 transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? '신청 중...' : '얼리버드 신청하기'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Waitlist;
