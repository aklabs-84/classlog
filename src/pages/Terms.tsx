import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Terms = () => {
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

        <h1 className="text-3xl font-black text-gray-900 mb-2">이용약관</h1>
        <p className="text-sm text-gray-500 mb-10">최종 수정일: 2026년 7월 20일</p>

        <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제1조 (목적)</h2>
            <p>
              이 약관은 아크랩스(AKLABS, 이하 "회사")가 제공하는 클래스로그(ClassLog, 이하 "서비스")의 이용과 관련하여
              회사와 이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제2조 (용어의 정의)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li><strong>서비스:</strong> 회사가 제공하는 클래스로그 웹 애플리케이션 및 이에 부수하는 모든 기능</li>
              <li><strong>이용자:</strong> 이 약관에 따라 회사와 이용계약을 체결하고 서비스를 이용하는 교사·학원 강사 등 회원</li>
              <li><strong>플랜:</strong> 무료(Free)·Pro·School 등 서비스 이용 범위에 따라 구분된 요금제</li>
              <li><strong>학생:</strong> 이용자가 서비스 내에서 관리하는 학급의 구성원으로, 별도 회원가입 없이 이용자가 발급한 코드로 접속하는 자</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제3조 (약관의 게시와 개정)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>회사는 이 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 초기 화면 또는 연결화면에 게시합니다.</li>
              <li>회사는 관계 법령을 위배하지 않는 범위에서 이 약관을 개정할 수 있으며, 개정 시 적용일자 및 개정사유를 명시하여 적용일자 7일 전부터 서비스 내 공지사항을 통해 고지합니다. 이용자에게 불리한 변경의 경우 30일 전에 고지합니다.</li>
              <li>이용자가 개정약관의 적용에 동의하지 않는 경우 이용계약을 해지할 수 있으며, 고지 후에도 이용자가 명시적으로 거부의사를 표시하지 않고 서비스를 계속 이용하는 경우 개정약관에 동의한 것으로 봅니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제4조 (서비스의 제공 및 변경)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>회사는 학생 활동 기록 관리, AI 기반 세특·생기부 초안 생성, 수업 도구(퀴즈·설문·화이트보드 등), 나이스 내보내기 등의 기능을 서비스로 제공합니다.</li>
              <li>회사는 서비스의 내용, 운영상·기술상 필요에 따라 제공하는 서비스의 전부 또는 일부를 변경할 수 있으며, 변경 시 사전에 서비스 내 공지사항을 통해 고지합니다.</li>
              <li>회사는 서버 점검, 설비 장애, 통신 두절 등 부득이한 사유가 있는 경우 서비스 제공을 일시적으로 중단할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제5조 (이용계약의 체결)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>이용계약은 이용자가 Google 계정을 통해 회원가입을 신청하고 회사가 이를 승낙함으로써 체결됩니다. 무료 플랜은 가입 즉시 승낙된 것으로 봅니다.</li>
              <li>회사는 다음 각 호에 해당하는 신청에 대해서는 승낙을 거부하거나 사후에 이용계약을 해지할 수 있습니다.
                <ul className="mt-1 space-y-1 list-disc pl-5">
                  <li>실명이 아니거나 타인의 정보를 이용한 경우</li>
                  <li>허위 정보를 기재하거나 회사가 요구하는 정보를 제공하지 않은 경우</li>
                  <li>서비스 운영을 고의로 방해한 이력이 있는 경우</li>
                </ul>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제6조 (이용요금 및 결제 방법)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>무료 플랜은 별도 비용 없이 이용할 수 있으며, Pro·School 플랜은 유료로 제공됩니다.</li>
              <li>유료 플랜 이용요금은 서비스 내 가격 안내 페이지에 게시된 금액에 따르며, 회사는 이용요금을 변경할 경우 최소 7일 전에 공지합니다. 단, 이미 결제가 완료된 이용 기간에는 변경된 요금이 소급 적용되지 않습니다.</li>
              <li>현재 서비스는 온라인 자동결제(PG)를 지원하지 않으며, 이용자가 계좌이체 등으로 결제한 내역을 회사가 확인한 후 관리자가 수동으로 플랜을 활성화하는 방식으로 운영됩니다.</li>
              <li>이용요금은 1개월 단위가 기본이며, 3개월·6개월·12개월 단위로 선결제하는 경우 서비스 내 가격 안내 페이지에 명시된 할인(3개월 5% 할인, 6개월 10% 할인, 12개월 결제 시 2개월 무료 상당)이 적용됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제7조 (계약 해지 및 환불)</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-2">
              <ul className="space-y-2 list-disc pl-5 text-blue-800">
                <li>이용자는 언제든지 서비스 내 설정 또는 이메일(aklabs84@naver.com)을 통해 이용계약 해지(환불) 요청을 할 수 있습니다.</li>
                <li><strong>결제일로부터 7일 이내</strong>에 해지를 요청하는 경우, 서비스 이용 여부와 관계없이 결제 금액 전액을 환불합니다.</li>
                <li>결제일로부터 7일이 경과한 후 해지를 요청하는 경우, 다음 계산식에 따라 잔여 이용 기간에 해당하는 금액을 일할 계산하여 환불합니다.
                  <p className="mt-1 font-mono text-xs bg-white/60 rounded-lg px-3 py-2">환불액 = 결제금액 × (잔여일수 ÷ 총 결제기간 일수)</p>
                </li>
                <li>무료 플랜은 환불 대상에서 제외됩니다.</li>
                <li>환불은 요청 확인 후 영업일 기준 7일 이내에 결제 시 사용한 수단(계좌이체 등)으로 처리합니다.</li>
                <li>이용자가 다음 각 호의 사유로 서비스 이용에 심각한 지장을 받은 경우, 회사의 귀책이 인정되는 범위에서 잔여 기간에 대해 별도로 환불하거나 이용 기간을 연장할 수 있습니다.
                  <ul className="mt-1 space-y-1 list-disc pl-5">
                    <li>회사의 귀책사유로 7일 이상 서비스 제공이 중단된 경우</li>
                    <li>회사가 서비스 제공을 종료하는 경우</li>
                  </ul>
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제8조 (회사의 의무)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>회사는 관계 법령과 이 약관이 금지하는 행위를 하지 않으며, 계속적이고 안정적인 서비스 제공을 위해 노력합니다.</li>
              <li>회사는 이용자의 개인정보를 보호하기 위해 개인정보 처리방침을 수립·공개하고 이를 준수합니다.</li>
              <li>회사는 서비스 이용과 관련한 이용자의 불만사항이 접수되는 경우 이를 처리하기 위해 노력합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제9조 (이용자의 의무)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>이용자는 관계 법령, 이 약관의 규정, 이용안내 및 서비스와 관련하여 회사가 공지한 사항을 준수해야 합니다.</li>
              <li>이용자는 학생 정보 등 타인의 개인정보를 서비스에 등록할 경우, 해당 정보 수집·이용에 필요한 법적 근거(학교·학원 내부 규정에 따른 정당한 권한 등)를 확보해야 하며, 이와 관련한 책임은 이용자에게 있습니다.</li>
              <li>이용자는 계정 정보를 제3자에게 양도, 대여하거나 공유해서는 안 되며, 계정 도용 등 비정상적인 이용을 인지한 경우 즉시 회사에 통지해야 합니다.</li>
              <li>이용자는 서비스를 이용하여 얻은 정보를 회사의 사전 승낙 없이 복제, 유통하거나 영리 목적으로 이용할 수 없습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제10조 (서비스 이용제한 및 중단)</h2>
            <p>
              회사는 이용자가 이 약관의 의무를 위반하거나 서비스의 정상적인 운영을 방해한 경우,
              경고, 일시정지, 이용계약 해지 등으로 서비스 이용을 단계적으로 제한할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제11조 (면책조항)</h2>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중지 등 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</li>
              <li>회사는 이용자의 귀책사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.</li>
              <li>AI 기능(세특·생기부 초안, 자동 요약 등)이 생성한 결과물은 초안 참고용이며, 최종 검토 및 제출 책임은 이용자에게 있습니다. 회사는 AI 생성 결과물의 내용상 오류로 발생한 손해에 대해 고의 또는 중대한 과실이 없는 한 책임을 지지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">제12조 (분쟁해결 및 관할법원)</h2>
            <p>
              이 약관과 관련하여 회사와 이용자 사이에 분쟁이 발생한 경우 상호 협의하여 원만히 해결하도록 노력하며,
              협의가 이루어지지 않을 경우 민사소송법상의 관할 법원에 소를 제기할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">사업자 정보</h2>
            <div className="bg-gray-50 rounded-2xl p-5 space-y-1">
              <p><strong>상호:</strong> 아크랩스(AKLABS)</p>
              <p><strong>대표자:</strong> 변모세</p>
              <p><strong>사업자등록번호:</strong> 568-14-02059</p>
              <p><strong>사업장 소재지:</strong> 인천광역시 미추홀구 석정로 229, 5층 501호</p>
              <p><strong>이메일:</strong> <a href="mailto:aklabs84@naver.com" className="text-amber-700 underline">aklabs84@naver.com</a></p>
              <p className="mt-2 text-gray-500 text-xs">서비스 이용 및 결제·환불 관련 문의는 위 이메일로 연락해 주시면 신속하게 처리하겠습니다.</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 mb-3">부칙</h2>
            <p>이 약관은 2026년 7월 20일부터 시행합니다.</p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-gray-200 text-center text-xs text-gray-400">
          © 2026 AK LABS. 선생님을 응원합니다.
        </div>
      </div>
    </div>
  );
};

export default Terms;
