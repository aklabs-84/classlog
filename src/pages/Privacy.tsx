import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-amber-700 hover:text-amber-900 font-bold mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> 뒤로가기
        </button>

        <h1 className="text-3xl font-black text-gray-900 mb-2">개인정보 처리방침</h1>
        <p className="text-sm text-gray-500 mb-10">최종 수정일: 2026년 6월 9일</p>

        <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">1. 수집하는 개인정보 항목</h2>
            <p>클래스로그(ClassLog)는 서비스 제공을 위해 다음 정보를 수집합니다.</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>교사 회원: 이메일 주소, 이름, 소속 학교명</li>
              <li>학생 정보: 이름, 학번(선생님이 직접 입력·관리)</li>
              <li>수업 활동 기록: 활동명, 관찰 내용</li>
              <li>서비스 이용 기록: 접속 일시, IP 주소, 기기 정보</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">2. 개인정보 수집 및 이용 목적</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>회원 가입 및 본인 확인</li>
              <li>학생 관찰 기록 관리 및 세특/생기부 초안 생성</li>
              <li>수업 도구(퀴즈, 설문 등) 제공</li>
              <li>서비스 운영, 고지사항 전달, 고객 지원</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">3. AI 기능과 데이터 처리</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
              <p className="font-bold text-blue-800">클래스로그의 AI 기능은 다음 원칙에 따라 운영됩니다.</p>
              <ul className="space-y-2 list-disc pl-5 text-blue-700">
                <li>
                  <strong>학생 실명 미전송:</strong> 세특/생기부 초안 생성 시 학생의 실명은 AI 모델에 전달되지 않습니다.
                  관찰 내용(활동명, 기록 내용)만 익명화하여 전송됩니다.
                </li>
                <li>
                  <strong>AI 학습 미사용:</strong> 입력된 관찰 기록 및 생성된 초안은 AI 모델 학습·개선에 사용되지 않습니다.
                </li>
                <li>
                  <strong>서버 프록시 방식:</strong> AI API 키는 서버에서만 관리되며, 브라우저에 노출되지 않습니다.
                </li>
                <li>
                  <strong>Gemini API 사용:</strong> AI 생성 기능은 Google Gemini API를 통해 처리됩니다.
                  Google의 데이터 처리 정책은 <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="underline">Google AI 서비스 약관</a>을 참고해 주세요.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">4. 개인정보 보유 및 이용 기간</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>회원 탈퇴 시 즉시 삭제 (단, 관계 법령에 따라 일정 기간 보관할 수 있음)</li>
              <li>학생 정보 및 관찰 기록: 교사가 직접 삭제하거나 회원 탈퇴 시 삭제</li>
              <li>전자상거래법 등 관계 법령에 의한 정보 보존 의무가 있는 경우 해당 기간 보관</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">5. 개인정보 제3자 제공</h2>
            <p>
              클래스로그는 원칙적으로 수집한 개인정보를 제3자에게 제공하지 않습니다.
              단, 아래의 경우는 예외입니다.
            </p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>이용자의 사전 동의가 있는 경우</li>
              <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">6. 보안 조치</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>모든 데이터는 Supabase를 통해 암호화 저장되며, 행 단위 보안 정책(RLS)이 적용됩니다.</li>
              <li>교사는 본인이 생성한 학급의 데이터에만 접근할 수 있습니다.</li>
              <li>모든 통신은 HTTPS로 암호화됩니다.</li>
              <li>서비스 가입은 관리자 승인 후 활성화됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">7. 이용자의 권리</h2>
            <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>개인정보 열람, 정정, 삭제, 처리 정지 요청</li>
              <li>학생 정보는 서비스 내에서 교사가 직접 관리·삭제 가능</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">8. 개인정보 보호 책임자</h2>
            <div className="bg-gray-50 rounded-2xl p-5">
              <p><strong>운영사:</strong> AK LABS</p>
              <p><strong>이메일:</strong> <a href="mailto:aklabs84@naver.com" className="text-amber-700 underline">aklabs84@naver.com</a></p>
              <p className="mt-2 text-gray-500 text-xs">개인정보 관련 문의사항은 위 이메일로 연락해 주시면 신속하게 처리하겠습니다.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">9. 개인정보 처리방침 변경</h2>
            <p>
              이 개인정보 처리방침은 법령·정책 또는 보안 기술의 변경에 따라 내용이 추가·삭제·수정될 수 있습니다.
              변경 시 서비스 공지사항을 통해 고지합니다.
            </p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-xs text-gray-400">
          © 2026 AK LABS. 선생님을 응원합니다.
        </div>
      </div>
    </div>
  );
};

export default Privacy;
