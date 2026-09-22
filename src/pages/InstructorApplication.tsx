import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users, CheckCircle2, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const KAKAO_OPEN_CHAT_URL = 'https://open.kakao.com/o/p7ZWBlKi';

const InstructorApplication = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const source = searchParams.get('source') || 'instructor_application_page';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [experience, setExperience] = useState('');
  const [motivation, setMotivation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase.from('instructor_applications').insert({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      region: region.trim() || null,
      experience: experience.trim() || null,
      motivation: motivation.trim() || null,
      source,
      teacher_id: user?.id ?? null,
    });

    setSubmitting(false);

    if (error) {
      setErrorMsg('신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
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
            <h1 className="text-xl font-black text-gray-900 mb-2">지원서 접수 완료했습니다!</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              남겨주신 연락처로 <strong>검토 후</strong> 연락드릴게요.
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
          <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-full mb-4">
              <Users size={14} className="text-amber-600" />
              <span className="text-xs font-black text-amber-700">강사 지원</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">
              강사로 지원해 주세요
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed mb-6">
              간단한 정보만 남겨주시면 검토 후 연락드립니다.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">이름 *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">이메일 (선택)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">희망 활동 지역 / 학교급</label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="예: 인천 남동구, 초등 고학년"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">교육 경력 / 자격증 (선택)</label>
                <textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  rows={5}
                  placeholder="관련 경력이나 자격증을 자유롭게 적어주세요"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-gray-700 mb-1.5">자기소개 / 지원 동기 (선택)</label>
                <textarea
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  rows={5}
                  placeholder="지원하시는 이유나 하고 싶은 말을 남겨주세요"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {errorMsg && <p className="text-xs text-red-600 font-bold">{errorMsg}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-amber-600 hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? '제출 중...' : '지원서 제출하기'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default InstructorApplication;
