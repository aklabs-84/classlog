import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, CheckCircle2, MessageCircle, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const KAKAO_OPEN_CHAT_URL = 'https://open.kakao.com/o/p7ZWBlKi';

const METHOD_OPTIONS = [
  { value: 'video_call', label: '화상통화로 안내받기' },
  { value: 'visit', label: '학교(현장) 방문 안내' },
  { value: 'kakao', label: '카카오톡으로 편하게 문의' },
  { value: 'material_only', label: '사용법 자료만 받아보기' },
];

const TrainingRequest = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const source = searchParams.get('source') || 'training_request_page';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [groupSize, setGroupSize] = useState('');
  const [preferredMethod, setPreferredMethod] = useState('video_call');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isVisit = preferredMethod === 'visit';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase.from('training_requests').insert({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      preferred_method: preferredMethod,
      organization: isVisit ? organization.trim() || null : null,
      group_size: isVisit && groupSize ? Number(groupSize) : null,
      memo: memo.trim() || null,
      teacher_id: user?.id ?? null,
      source,
    });

    setSubmitting(false);

    if (error) {
      setErrorMsg('신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setSubmitted(true);

    fetch('/api/slack?type=training-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        preferred_method: preferredMethod,
        organization: isVisit ? organization.trim() || null : null,
        group_size: isVisit && groupSize ? Number(groupSize) : null,
        memo: memo.trim() || null,
        source,
      }),
    }).catch((err) => console.error('[TrainingRequest] slack/push notify failed:', err));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-lg mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-indigo-700 hover:text-indigo-900 font-bold mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> 뒤로가기
        </button>

        {submitted ? (
          <div className="bg-white rounded-3xl border border-indigo-200 shadow-sm p-8 text-center">
            <CheckCircle2 size={40} className="text-indigo-500 mx-auto mb-4" />
            <h1 className="text-xl font-black text-gray-900 mb-2">신청 완료했습니다!</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              남겨주신 이메일·연락처로 <strong>빠른 시일 내</strong> 연락드려서
              <br />
              사용법을 편하게 안내해 드릴게요.
              {preferredMethod === 'material_only' && (
                <>
                  <br />
                  자료만 원하셨다면 아래 가이드를 바로 보실 수 있어요.
                </>
              )}
            </p>
            <a
              href="/quickstart.html"
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl font-black transition-all active:scale-95 ${
                preferredMethod === 'material_only'
                  ? 'py-3.5 text-sm text-white bg-indigo-600 hover:bg-indigo-700'
                  : 'py-3 text-sm text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
              }`}
            >
              <BookOpen size={16} /> 처음 30분 시작 가이드 보기
            </a>
            <a
              href={KAKAO_OPEN_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-[#3c1e1e] bg-[#fee500] hover:brightness-95 transition-all active:scale-95"
            >
              <MessageCircle size={16} /> 카카오톡 커뮤니티로 바로 물어보기
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-indigo-200 shadow-sm p-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-100 rounded-full mb-4">
              <GraduationCap size={14} className="text-indigo-600" />
              <span className="text-xs font-black text-indigo-700">사용법 교육 신청</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">
              앱 사용법, 편하게 안내받으세요
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              처음이라 막막하셨다면 신청해 주세요. 원하시는 방식으로 사용법을 직접 안내해 드립니다.
            </p>

            <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#fee500]/20 border border-[#fee500] mb-6">
              <MessageCircle size={20} className="text-[#3c1e1e] shrink-0" />
              <p className="text-xs text-gray-700 leading-relaxed">
                더 빠른 답변을 원하시면{' '}
                <a
                  href={KAKAO_OPEN_CHAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black text-[#3c1e1e] underline underline-offset-2"
                >
                  카카오톡 커뮤니티
                </a>
                로 편하게 물어보셔도 좋아요.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">이름 *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">휴대폰 번호 *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">이메일 *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">희망하는 안내 방식</label>
                <select
                  value={preferredMethod}
                  onChange={(e) => setPreferredMethod(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {isVisit && (
                <div className="space-y-4 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-900 leading-relaxed">
                    <strong>현장 방문 교육은 5명 이상 모였을 때 진행할 수 있어요.</strong> 양해 부탁드려요.
                    같은 학교나 지역 선생님들과 함께 신청해 주시면 좋고, 혼자 신청하셔도 인원이 모이면 연락드릴게요.
                    그전에는 화상통화로 먼저 안내해 드릴 수도 있어요.
                  </p>
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1.5">학교 / 소속 *</label>
                    <input
                      type="text"
                      required
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="예: ○○초등학교 / ○○교육지원청"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-700 mb-1.5">함께 들을 인원 (본인 포함, 대략) *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={500}
                      value={groupSize}
                      onChange={(e) => setGroupSize(e.target.value)}
                      placeholder="예: 5"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">하고 싶은 말 (선택)</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  placeholder="궁금한 점이나 편한 시간대를 남겨주세요"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              {errorMsg && <p className="text-xs text-red-600 font-bold">{errorMsg}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? '신청 중...' : '교육 신청하기'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingRequest;
