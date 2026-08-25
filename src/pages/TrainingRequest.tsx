import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, CheckCircle2, MessageCircle } from 'lucide-react';
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
  const [preferredMethod, setPreferredMethod] = useState('video_call');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase.from('training_requests').insert({
      name: name.trim(),
      phone: phone.trim(),
      preferred_method: preferredMethod,
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
        preferred_method: preferredMethod,
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
              남겨주신 연락처로 <strong>빠른 시일 내</strong> 연락드려서
              <br />
              사용법을 편하게 안내해 드릴게요.
            </p>
            <a
              href={KAKAO_OPEN_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-black text-[#3c1e1e] bg-[#fee500] hover:brightness-95 transition-all active:scale-95"
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
