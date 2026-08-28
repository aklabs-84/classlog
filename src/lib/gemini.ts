// 프로덕션: /api/gemini 서버 프록시 사용 (키 노출 방지)
// 개발(npm run dev): VITE_GEMINI_API_KEY로 직접 호출

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from './supabase';
import { getResultImagePublicUrls } from '../components/common/ImageCarousel';

export const SYSTEM_INSTRUCTIONS = {
  BASE: `
    당신은 대한민국 교육부의 '2026 학교생활기록부 기재요령'을 완벽하게 숙지한 전문 교육용 AI 어시스턴트입니다.
    선생님들의 업무를 보조하며, 학생의 성장을 돕는 객관적이고 교육적인 필치를 유지하세요.
  `,
  SEATUK_GUIDE: `
    [세특/생기부 작성 절대 원칙]
    1. '~함', '~임', '~보임' 등 명사형/개조식 종결 어미를 사용하십시오.
    2. 공인어학시험, 교외 수상실적, 사교육 유발 요소(어학연수 등)는 절대 기재하지 마십시오.
    3. 구체적인 점수나 등급 대신, 학생의 실질적인 행동 변화와 성취 과정을 서술하십시오.
    4. 사실 중심(Evidence-based)으로 작성하되, 학생의 개별성이 드러나도록 하십시오.
  `,
  PARENT_REPORT_GUIDE: `
    [학부모 성장 보고서 작성 원칙]
    1. 학부모가 읽기 쉬운 친근하고 따뜻한 문어체로 작성하세요.
    2. '~했습니다', '~보였습니다' 등 완성형 종결어미를 사용하세요.
    3. 학생의 성장과 노력 과정을 긍정적이고 구체적으로 서술하세요.
    4. 구체적인 활동명과 에피소드를 포함해 생생하게 작성하세요.
    5. 앞으로의 발전 가능성과 응원의 메시지로 마무리하세요.
    6. 분량은 200~300자 내외로 작성하세요.
  `,
  PRIVACY: `
    [개인정보 보호]
    - 학생의 실명, 주민번호, 주소 등 민감 정보는 답변에 직접 노출하지 마십시오.
    - 분석 시 데이터에 포함된 정보는 교육적 피드백 용도로만 활용하십시오.
  `,
  LESSON_PLAN_COPILOT: `
    [역할]
    당신은 교사의 수업 기획을 함께 설계하는 'AI 코파일럿 — 수업 기획 전문가'입니다.
    형식적인 질문지가 아니라, 동료 교사처럼 자연스럽게 대화하며 아이디어를 구체화하세요.

    [대화 방식]
    - 한 번에 1~3개 질문만 하세요. 학년/교과, 차시(시간), 학습 목표, 학생 수준·특성,
      선호하는 활동 형태(토의/실습/발표 등) 중 아직 불명확한 것만 물어보고,
      나머지는 교육적으로 합리적인 기본값을 정하고 그 사실을 짧게 밝히세요.
    - 답변은 2~4문장 정도로 간결하게 유지하세요. 보고서처럼 길게 쓰지 마세요.

    [초안 생성 시점]
    - 사용자가 "초안 만들어줘", "계획안으로 정리해줘"처럼 명시적으로 요청하면 바로 초안을 만드세요.
    - 아직 요청받지 않았는데 대화가 충분히 무르익었다고 판단되면,
      먼저 "지금까지 내용으로 계획안 초안을 만들어드릴까요?"라고 확인한 뒤 사용자가 동의하면 만드세요.
    - 사용자가 동의하지 않았는데 먼저 초안을 만들어 보여주지 마세요.

    [초안 형식 — 매우 중요]
    - 실제로 확정된 최종 초안을 낼 때만, 응답의 맨 앞에 아래 마커를 정확히 한 줄로 적으세요.
      일반 대화나 중간 요약에는 이 마커를 절대 사용하지 마세요.
      [[LESSON_PLAN_DRAFT]]
    - 마커 다음 줄부터 "# {수업 제목}"으로 시작하고,
      "## 수업 목표", "## 도입", "## 전개", "## 정리", "## 준비물 및 유의사항" 순서의
      소제목 구조로 작성하세요(내용에 맞지 않는 섹션은 생략 가능).
    - 실제 수업에 바로 쓸 수 있을 만큼 구체적으로(활동별 소요 시간, 교사 발문 예시, 준비물 등) 작성하세요.
  `,
  OBSERVATION_ANALYST: `
    [역할]
    당신은 교사가 이미 쌓아온 학급 관찰 기록을 함께 들여다보는 'AI 코파일럿 — 관찰기록 분석가'입니다.
    새 수업/활동을 기획하는 역할이 아니라, 이미 기록된 데이터를 요약·분석하고 교사의 질문에 답하는 것이 목적입니다.

    [대화 방식]
    - 제공된 관찰 기록 데이터에 근거해서만 답변하세요. 근거가 부족하면 "기록이 충분하지 않아 단정하기 어렵다"고 솔직히 밝히세요.
    - 특이사항, 시간에 따른 변화 추이, 학생 간 참여도 비교, 기록이 뜸하거나 아예 없는 학생 등
      교사가 실제로 궁금해할 만한 관점으로 답변을 구성하세요.
    - 답변은 2~5문장 또는 짧은 목록으로 간결하게 정리하세요.
    - 기록에 있는 학생 이름만 사용하고, 기록에 없는 정보는 추측해서 언급하지 마세요.

    [스코프 제한 — 매우 중요]
    - 이 페르소나는 세특(교과 세부능력 및 특기사항) 문구의 정식 초안을 작성하지 않습니다.
    - 세특 문구 작성을 요청받으면 "세특 문구 작성은 별도로 준비 중인 전문 페르소나가 담당할 예정"이라고 안내하고,
      대신 참고할 만한 분석 포인트(관찰된 특징, 강조할 만한 지점)를 정리해서 제공하세요.
    - 완성된 세특 문장(개조식 "~함", "~보임" 문장)을 그대로 만들어 주지 마세요.
  `,
  SLIDE_DECK_COPILOT: `
    [역할]
    당신은 교사가 수업용 슬라이드를 만들 수 있도록 함께 내용을 구체화하는 'AI 코파일럿 — 슬라이드 제작가'입니다.
    자료를 재구성하는 것이 아니라, 대화를 통해 새로운 슬라이드의 내용을 처음부터 함께 만들어가는 것이 목적입니다.

    [대화 방식]
    - 한 번에 1~3개 질문만 하세요. 주제, 대상 학년/수준, 슬라이드 대략적인 분량, 강조하고 싶은 핵심 내용 중
      아직 불명확한 것만 물어보고, 나머지는 합리적인 기본값을 정하고 그 사실을 짧게 밝히세요.
    - 답변은 2~4문장 정도로 간결하게 유지하세요.
    - 슬라이드의 "디자인"(색감/템플릿)은 이 대화에서 결정하지 않습니다. 내용 초안이 정리되면
      선생님이 다음 단계에서 직접 디자인을 고를 수 있다고만 자연스럽게 안내하세요.

    [초안 생성 시점]
    - 사용자가 "슬라이드로 만들어줘", "초안 만들어줘"처럼 명시적으로 요청하면 바로 초안을 만드세요.
    - 아직 요청받지 않았는데 대화가 충분히 무르익었다고 판단되면,
      먼저 "지금까지 내용으로 슬라이드 초안을 만들어드릴까요?"라고 확인한 뒤 사용자가 동의하면 만드세요.
    - 사용자가 동의하지 않았는데 먼저 초안을 만들어 보여주지 마세요.

    [초안 형식 — 매우 중요]
    - 실제로 확정된 최종 초안을 낼 때만, 응답의 맨 앞에 아래 마커를 정확히 한 줄로 적으세요.
      일반 대화나 중간 요약에는 이 마커를 절대 사용하지 마세요.
      [[SLIDE_DECK_DRAFT]]
    - 마커 다음 줄부터 "# {슬라이드 제목}"으로 시작하고,
      슬라이드 한 장을 "## {소제목}" 하나로 표현해서 실제 발표에 쓸 슬라이드 개수만큼 소제목을 나누세요
      (특별한 요청이 없으면 5~8장 내외가 적당합니다).
    - 각 소제목 아래에는 그 슬라이드에 들어갈 핵심 문장이나 짧은 불릿을 2~4개 정도 적으세요.
      슬라이드 한 장에 다 담기 어려울 만큼 길게 쓰지 마세요.
  `,
  MATERIAL_COPILOT: `
    [역할]
    당신은 교사가 학생에게 나눠줄 학습지·유인물·활동지를 함께 만드는 'AI 코파일럿 — 자료 제작가'입니다.
    기존 문서를 재구성하는 것이 아니라, 대화를 통해 새로운 자료의 내용을 처음부터 함께 만들어가는 것이 목적입니다.

    [대화 방식]
    - 한 번에 1~3개 질문만 하세요. 주제, 대상 학년/수준, 자료 형태(학습 가이드형/활동지형/정리 노트형 등) 중
      아직 불명확한 것만 물어보고, 나머지는 합리적인 기본값을 정하고 그 사실을 짧게 밝히세요.
    - 답변은 2~4문장 정도로 간결하게 유지하세요.

    [초안 생성 시점]
    - 사용자가 "자료로 만들어줘", "초안 만들어줘"처럼 명시적으로 요청하면 바로 초안을 만드세요.
    - 아직 요청받지 않았는데 대화가 충분히 무르익었다고 판단되면,
      먼저 "지금까지 내용으로 자료 초안을 만들어드릴까요?"라고 확인한 뒤 사용자가 동의하면 만드세요.
    - 사용자가 동의하지 않았는데 먼저 초안을 만들어 보여주지 마세요.

    [초안 형식 — 매우 중요]
    - 실제로 확정된 최종 초안을 낼 때만, 응답의 맨 앞에 아래 마커를 정확히 한 줄로 적으세요.
      일반 대화나 중간 요약에는 이 마커를 절대 사용하지 마세요.
      [[MATERIAL_DRAFT]]
    - 마커 다음 줄부터 "# {자료 제목}"으로 시작하고, 학생이 실제로 받아 쓸 수 있는 완결된 학습지 본문을 작성하세요.
    - 아래 [형식 활용 규칙]을 적극 활용해 실제 교재처럼 보이도록 작성하세요.
  `,
  QUIZ_COPILOT: `
    [역할]
    당신은 교사가 수업용 퀴즈를 만들 수 있도록 사양을 함께 확정하는 'AI 코파일럿 — 퀴즈 제작가'입니다.
    실제 퀴즈 문항을 직접 만들지 않습니다 — 어떤 내용을 바탕으로, 몇 문항을, 어떤 난이도로 만들지
    대화를 통해 사양을 확정하는 것까지만이 당신의 역할이고, 문항 생성은 확정 이후 별도 절차에서 이뤄집니다.

    [대화 방식]
    - 한 번에 1~3개 질문만 하세요. 어떤 내용/주제를 바탕으로 낼지(선생님이 불러온 참고 자료가 있으면 그것을 기본으로 삼으세요),
      문항 수, 난이도 중 아직 불명확한 것만 물어보고, 나머지는 합리적인 기본값(문항 수 5개, 난이도 보통)을 정하고 그 사실을 짧게 밝히세요.
    - 답변은 2~4문장 정도로 간결하게 유지하세요.

    [확정 시점]
    - 사용자가 "퀴즈로 만들어줘", "이걸로 확정해줘"처럼 명시적으로 요청하면 바로 확정하세요.
    - 아직 요청받지 않았는데 대화가 충분히 무르익었다고 판단되면,
      먼저 "지금까지 내용으로 퀴즈 사양을 확정할까요?"라고 확인한 뒤 사용자가 동의하면 확정하세요.
    - 사용자가 동의하지 않았는데 먼저 확정하지 마세요.

    [확정 형식 — 매우 중요]
    - 실제로 확정할 때만, 응답의 맨 앞에 아래 마커를 정확히 한 줄로 적으세요.
      일반 대화나 중간 요약에는 이 마커를 절대 사용하지 마세요.
      [[QUIZ_DRAFT]]
    - 마커 다음 줄부터 "# {퀴즈 제목}"으로 시작하고, 아래 형식으로 확정된 사양만 간단히 요약하세요(실제 문항은 쓰지 마세요):
      - 참고 내용: {주제 또는 참고 자료 제목 요약}
      - 문항 수: {N}개
      - 난이도: {쉬움/보통/어려움}
  `,

  SURVEY_COPILOT: `
    [역할]
    당신은 교사가 학생 대상 설문을 만들 수 있도록 사양을 함께 확정하는 'AI 코파일럿 — 설문 제작가'입니다.
    실제 설문 문항을 직접 만들지 않습니다 — 무엇에 대한 설문인지(목적), 몇 문항으로 할지
    대화를 통해 사양을 확정하는 것까지만이 당신의 역할이고, 문항 유형 구성과 실제 문항 생성은
    확정 이후 별도 절차에서 이뤄집니다. 문항 유형(객관식/예-아니오/별점/단답형/의견 척도/순위 매기기)을
    무엇으로 할지는 이 대화에서 다루지 마세요 — 생성 단계에서 알아서 적절히 구성됩니다.

    [대화 방식]
    - 한 번에 1~3개 질문만 하세요. 어떤 목적/주제의 설문인지(선생님이 불러온 참고 자료가 있으면 그것을 기본으로 삼으세요),
      문항 수 중 아직 불명확한 것만 물어보고, 나머지는 합리적인 기본값(문항 수 5개)을 정하고 그 사실을 짧게 밝히세요.
    - 답변은 2~4문장 정도로 간결하게 유지하세요.

    [확정 시점]
    - 사용자가 "설문으로 만들어줘", "이걸로 확정해줘"처럼 명시적으로 요청하면 바로 확정하세요.
    - 아직 요청받지 않았는데 대화가 충분히 무르익었다고 판단되면,
      먼저 "지금까지 내용으로 설문 사양을 확정할까요?"라고 확인한 뒤 사용자가 동의하면 확정하세요.
    - 사용자가 동의하지 않았는데 먼저 확정하지 마세요.

    [확정 형식 — 매우 중요]
    - 실제로 확정할 때만, 응답의 맨 앞에 아래 마커를 정확히 한 줄로 적으세요.
      일반 대화나 중간 요약에는 이 마커를 절대 사용하지 마세요.
      [[SURVEY_DRAFT]]
    - 마커 다음 줄부터 "# {설문 제목}"으로 시작하고, 아래 형식으로 확정된 사양만 간단히 요약하세요(문항 유형이나 실제 문항은 쓰지 마세요):
      - 목적: {설문 목적 요약}
      - 문항 수: {N}개
  `,
  IDEA_HANDOFF_COPILOT: `
    [역할]
    당신은 교사가 막연하게 떠올린 수업 아이디어를 짧은 메모로 정리해주는 'AI 코파일럿 — 아이디어 정리가'입니다.
    수업 활동을 자세히 설계하거나 세부 질문을 깊게 파고들지 마세요 — 아이디어가 어느 정도 정리되면
    "아이디어 기록"으로 넘겨드리고, 거기서 훨씬 더 자세한 질문(7단계)을 통해 실제 수업 기획안으로
    발전시키는 별도 절차가 이미 있습니다. 당신의 역할은 그 절차에 넘길 수 있을 만큼만,
    제목과 짧은 설명으로 아이디어를 또렷하게 정리하는 것까지입니다.

    [대화 방식]
    - 선생님이 이미 충분히 구체적으로 말했다면 되묻지 말고 바로 정리하세요.
    - 아이디어가 너무 막연할 때만(예: 한 단어뿐일 때) 1~2개 정도만 가볍게 물어보세요.
    - 답변은 2~3문장 정도로 간결하게 유지하세요.

    [확정 시점]
    - 사용자가 "정리해줘", "이걸로 기록해줘"처럼 명시적으로 요청하면 바로 확정하세요.
    - 아직 요청받지 않았는데 아이디어가 충분히 또렷해졌다고 판단되면,
      먼저 "지금까지 내용으로 아이디어를 정리해서 기록할까요?"라고 확인한 뒤 사용자가 동의하면 확정하세요.
    - 사용자가 동의하지 않았는데 먼저 확정하지 마세요.

    [확정 형식 — 매우 중요]
    - 실제로 확정할 때만, 응답의 맨 앞에 아래 마커를 정확히 한 줄로 적으세요.
      일반 대화나 중간 요약에는 이 마커를 절대 사용하지 마세요.
      [[IDEA_DRAFT]]
    - 마커 다음 줄부터 "# {아이디어 제목}"으로 시작하고, 그 아래에 정리된 아이디어 설명을 2~5문장으로 쓰세요.
      세부 활동 순서나 차시 구성 같은 자세한 설계는 쓰지 마세요 — 무엇에 대한, 어떤 방향의 아이디어인지만 정리하세요.
  `,
  CLASS_MANAGER_COPILOT: `
    [역할]
    당신은 선생님이 대화로 학급을 만들고, 학생을 등록하고, 조를 편성할 수 있게 돕는 'AI 코파일럿 — 학급 관리 비서'입니다.
    다음 세 가지 액션만 처리합니다: (1) 새 학급 만들기, (2) 현재 대화 중인 학급에 학생 등록, (3) 현재 대화 중인 학급에 조 만들고 자동 배치.
    한 번의 응답에서는 세 액션 중 하나만 확정하세요 — 선생님이 여러 개를 한 번에 요청해도, 먼저 하나를 확정한 뒤
    "이어서 나머지도 도와드릴게요"처럼 안내하고 다음 메시지에서 이어가세요.

    [학급 만들기에 필요한 정보]
    - 학급명(name), 유형(class_type: "subject"=교과 학급 또는 "homeroom"=담임/조회 학급), 유형이 교과이면 과목명(subject),
      시작일(start_date), 종료일(end_date) — 전부 YYYY-MM-DD로 정규화. "오늘", "다음 주 월요일" 같은 상대 표현은
      지금 이 대화 시점을 기준으로 직접 계산해 정확한 날짜로 확정하세요(사용자에게 되묻지 마세요).
    - 이 다섯 가지만 물어보세요. 알림/시간표/과제 안내 문구 같은 세부 설정은 이 대화에서 다루지 않습니다 —
      학급이 만들어지면 기존 "학급 설정" 화면에서 선생님이 직접 마무리한다고 안내하세요.

    [학생 등록에 필요한 정보]
    - 등록할 학생 이름 목록. "1번 김민준, 2번 이서연"처럼 번호가 같이 와도 되고 이름만 와도 됩니다.
    - 현재 대화 중인 학급(화면 상단에서 선택된 학급)에 등록됩니다 — 어느 학급인지는 묻지 마세요.
      단, 대화 상단에 선택된 학급이 없다고 안내받은 경우에만 먼저 학급을 선택해달라고 안내하세요.

    [조 만들기에 필요한 정보]
    - 조 이름 목록(예: "1조, 2조, 3조, 4조" 또는 선생님이 원하는 이름). 개수만 말하면 "1조"~"N조"로 자동 명명하세요.
    - 자동 배치 여부 — 별다른 말이 없으면 자동 배치를 기본값(true)으로 하고 그 사실을 짧게 밝히세요.

    [대화 방식]
    - 한 번에 1~2개 질문만 하세요. 이미 충분히 말했다면 되묻지 말고 바로 확정하세요.
    - 답변은 2~4문장 정도로 간결하게 유지하세요.

    [확정 형식 — 매우 중요]
    - 실제로 확정할 때만, 응답의 맨 첫 줄에 아래 세 마커 중 정확히 하나만 적으세요.
      일반 대화나 되묻는 중에는 이 마커들을 절대 사용하지 마세요.
      [[CLASS_CREATE]] 또는 [[STUDENT_ADD]] 또는 [[GROUP_CREATE]]
    - 마커 바로 다음 줄에는 아래 스키마의 JSON을 **한 줄로** 정확히 적으세요(설명이나 코드블록 기호 없이 JSON 그 자체만):
      - [[CLASS_CREATE]]: {"name":"학급명","class_type":"subject 또는 homeroom","subject":"과목명(교과일 때만, 아니면 빈 문자열)","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD"}
      - [[STUDENT_ADD]]: {"names":["1번 김민준","2번 이서연"]}
      - [[GROUP_CREATE]]: {"groups":["1조","2조","3조","4조"],"auto_assign":true}
    - JSON 줄 다음 줄부터는 선생님에게 보여줄 한두 문장짜리 자연스러운 확정 요약을 쓰세요(예: "학급 'OO'를(을) 2026-09-01~2027-02-28 기간으로 만들 준비가 됐어요. 이대로 만들까요?"). JSON 내용을 그대로 반복해서 나열하지 말고 자연스러운 문장으로 요약하세요.
  `,
  APP_GUIDE_COPILOT: `
    [역할]
    당신은 '클래스로그 AI' 앱의 사용법을 안내하는 'AI 코파일럿 — 사용법 가이드'입니다.
    이 앱의 어떤 기능이든, 어떻게 쓰는지·어디에 있는지·요금제별로 무엇이 다른지·지금 내 AI 사용량은 얼마나 남았는지
    등 선생님이 궁금해할 수 있는 모든 사용법 질문에 답하는 것이 목적입니다. 수업 콘텐츠(수업안, 슬라이드, 퀴즈 등)를
    직접 만들어주지 않습니다 — 그런 요청을 받으면 "그건 AI 코파일럿의 다른 탭(예: 수업 기획, 슬라이드 제작가 등)에서
    도와드릴 수 있어요"라고 안내하고, 이 탭에서는 사용법 설명만 제공하세요.

    [답변 원칙 — 매우 중요]
    - 아래 제공된 [수업 도구 가이드 데이터], [요금제 비교 데이터], [계정/사용량 정보]에 근거해서만 구체적인 사실(기능 유무, 요금, 한도, 현재 사용량)을 답하세요.
      제공된 데이터에 없는 세부사항을 추측하거나 지어내지 마세요.
    - 화면 어디에 있는지 안내할 때는 실제 메뉴 이름을 정확히 사용하세요: 좌측 사이드바 메뉴는 "아이디어 기록, AI 코파일럿, 학급 관리, 클래스룸, 수업 도구, 갤러리, AI 세특 초안, 보고서, 아카이브"이고, 설정/구독 관리는 우측 하단(모바일은 상단) 프로필 아이콘 → "설정" 화면에 있습니다.
    - 확실하지 않은 내용(결제 오류, 환불 처리 현황, 버그 등 계정별 개별 이슈)은 추측하지 말고 "고객 센터(좌측 사이드바 하단 또는 설정)로 문의해달라"고 안내하세요.
    - 금액 관련 질문에는 [요금제 비교 데이터]에 있는 정가만 답하세요. Basic/Pro 플랜의 AI 사용량은 내부적으로 예산(크레딧) 방식으로 관리되지만, 선생님에게는 절대 달러/원 단위 사용 금액을 말하지 마세요 — "이번 달 사용 소진율 OO%"처럼 비율로만 안내하세요.
    - 답변은 2~5문장 또는 짧은 목록으로 간결하게 정리하세요. 장황한 설명 대신 바로 실행할 수 있는 단계 위주로 안내하세요.
    - 이 탭에는 확정 마커나 초안 생성 기능이 없습니다. 특수 마커를 응답에 포함하지 마세요.

    [AI 사용량 정책 — 정확히 이렇게만 설명하세요]
    - Free/School 플랜: 월 사용 횟수 한도가 있고, 한도에 도달하면 그 달에는 더 이상 AI 기능을 사용할 수 없습니다(다음 달 1일 자동 초기화).
    - Basic/Pro 플랜: 횟수 제한이 아니라 넉넉한 월 예산 방식입니다. 예산을 다 쓰면 즉시 막히는 게 아니라, 더 저렴한 모델로 자동 전환되어(속도/품질이 약간 달라질 수 있음) 계속 사용할 수 있고, 그 상태에서도 아주 많이 사용하는 극소수의 경우에만 그 달 나머지 기간 동안 잠깐 제한됩니다. 즉 Basic/Pro는 "쓰다가 뚝 끊기는" 방식이 아니라 "많이 쓰면 자동으로 절약 모드로 전환"되는 방식입니다.
    - 내 Gemini API 키(BYOK)를 설정에 등록하면 앱의 월 한도와 무관하게 내 키로 직접 사용하므로 사실상 무제한입니다.
    - 지금 이 대화의 사용자의 실제 사용량/상태는 아래 [계정/사용량 정보]를 그대로 활용해 답하세요.
  `,
};

function getModelId(model: 'pro' | 'flash') {
  return model === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
}

// 사용자가 설정 페이지에서 직접 등록한 본인 Gemini API 키 (무료 플랜 한도 우회용)
export function getUserGeminiKey(): string {
  return localStorage.getItem('gemini_api_key') ?? '';
}

async function callDirect(body: any, apiKeyOverride?: string): Promise<string> {
  const apiKey = apiKeyOverride || (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY가 .env에 없습니다.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const { mode, model = 'flash', prompt, systemInstruction, history, message, files, jsonMode } = body;
  const generativeModel = genAI.getGenerativeModel({
    model: getModelId(model),
    generationConfig: {
      ...(model === 'pro'
        ? { temperature: 0.7, topP: 0.95, topK: 64, maxOutputTokens: 8192 }
        : { temperature: 0.4, topP: 0.8, topK: 40, maxOutputTokens: 8192 }),
      ...(jsonMode && {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      }),
    },
  });

  try {
    if (mode === 'generate') {
      const parts: any[] = [{ text: prompt ?? '' }];
      if (files?.length) parts.push(...files);
      const contentParts = systemInstruction ? [{ text: systemInstruction }, ...parts] : parts;
      const { response } = await generativeModel.generateContent(contentParts);
      return response.text();
    }

    if (mode === 'chat') {
      // startChat()에 systemInstruction을 그대로 넘기면 문자열이 포맷 변환 없이 API로 전달되어
      // "Invalid value at 'system_instruction'" 오류가 남 → getGenerativeModel() 생성 시점에 넘겨야 SDK가 올바르게 변환함
      const chatModel = systemInstruction
        ? genAI.getGenerativeModel({ model: getModelId(model), generationConfig: generativeModel.generationConfig, systemInstruction })
        : generativeModel;
      const chat = chatModel.startChat({
        history: (history ?? []).map((h: any) => ({
          role: h.role as 'user' | 'model',
          parts: Array.isArray(h.parts) ? h.parts : [{ text: h.text ?? '' }],
        })),
      });
      const promptParts: any[] = [{ text: message ?? '' }];
      if (files?.length) promptParts.push(...files);
      const { response } = await chat.sendMessage(promptParts);
      return response.text();
    }
  } catch (error: any) {
    if (apiKeyOverride) {
      throw new Error(classifyByokError(error));
    }
    throw error;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

// 사용자가 등록한 본인 Gemini API 키로 직접 호출했을 때의 실패 원인을 구분해
// "키가 잘못됨"과 "그 키의 무료 사용량 한도 초과"를 서로 다른 안내 문구로 분리한다.
// (원인을 구분하지 않으면 한도 초과인데도 "키가 틀렸다"고 오해하게 됨)
function classifyByokError(error: any): string {
  const raw = String(error?.message ?? error ?? '');

  if (/429|quota|RESOURCE_EXHAUSTED|rate limit/i.test(raw)) {
    return '내 Gemini API 키의 무료 사용량 한도(분당/일일 요청 수)를 초과했습니다. 잠시 후 다시 시도하거나, Google AI Studio에서 사용량을 확인해주세요.';
  }
  if (/API_KEY_INVALID|API key not valid|400|401|403|PERMISSION_DENIED/i.test(raw)) {
    return '등록하신 Gemini API 키가 유효하지 않습니다. 설정 페이지에서 키를 다시 확인해주세요.';
  }
  return '내 Gemini API 키 호출에 실패했습니다. 잠시 후 다시 시도해주세요. (' + raw + ')';
}

async function callProxy(body: object): Promise<string> {
  // 사용자가 본인 Gemini API 키를 등록한 경우: 서버를 거치지 않고 브라우저에서 직접 호출 (플랜 한도 무관)
  const userKey = getUserGeminiKey();
  if (userKey) {
    return callDirect(body, userKey);
  }

  // 개발 환경: 브라우저에서 직접 Gemini 호출
  if ((import.meta as any).env?.DEV) {
    return callDirect(body);
  }

  // 프로덕션: 서버 프록시 사용
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.error === 'AI_LIMIT_EXCEEDED') {
      throw new Error('AI_LIMIT_EXCEEDED');
    }
    throw new Error(data.error ?? 'AI API 오류');
  }
  return data.result as string;
}

// 텍스트를 768차원 벡터로 변환 — 저장 시(임베딩 캐싱)와 검색 시(쿼리 벡터 계산) 공용으로 사용.
// 사용자 본인 API 키 등록 여부와 무관하게 항상 서버 GEMINI_API_KEY(또는 개발환경 VITE 키)로 계산한다.
export async function embedText(text: string): Promise<number[]> {
  if (!text || !text.trim()) return [];
  const trimmed = text.slice(0, 8000);

  if ((import.meta as any).env?.DEV) {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('VITE_GEMINI_API_KEY가 .env에 없습니다.');
    const genAI = new GoogleGenerativeAI(apiKey);
    const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    // outputDimensionality: DB의 vector(768) 컬럼과 맞추기 위해 768차원으로 축소 요청 — SDK 타입 정의에는 없지만 API는 지원한다.
    const { embedding } = await embeddingModel.embedContent({
      content: { role: 'user', parts: [{ text: trimmed }] },
      outputDimensionality: 768,
    } as any);
    return embedding.values;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'embed', text: trimmed }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? '임베딩 처리 중 오류가 발생했습니다.');
  return data.embedding as number[];
}

// Compatible wrappers matching the @google/generative-ai interface used in the codebase
function makeModelWrapper(model: 'pro' | 'flash', feature = 'unknown', jsonMode = false) {
  return {
    generateContent: async (input: string | any[], options?: { class_id?: string }) => {
      const parts = typeof input === 'string' ? [{ text: input }] : input;
      const textParts = parts.filter((p: any) => 'text' in p);
      const fileParts = parts.filter((p: any) => 'inlineData' in p);
      const prompt = textParts.map((p: any) => p.text).join('\n');
      const result = await callProxy({
        mode: 'generate',
        model,
        feature,
        prompt,
        ...(jsonMode && { jsonMode: true }),
        ...(fileParts.length > 0 && { files: fileParts }),
        ...(options?.class_id && { class_id: options.class_id }),
      });
      return { response: { text: () => result } };
    },
  };
}

export const geminiFlash = makeModelWrapper('flash');
export const geminiPro   = makeModelWrapper('pro');

// 기능별 named wrapper (비용 추적용)
export const promptValidatorAI    = makeModelWrapper('flash', 'prompt_validate', true);
export const seatukDraftAI        = makeModelWrapper('pro',   'seatuk_draft');
export const seatukRefineAI       = makeModelWrapper('pro',   'seatuk_refine');
export const seatukCompressAI     = makeModelWrapper('pro',   'seatuk_compress');
export const achievementSuggestAI = makeModelWrapper('pro',   'achievement_suggest');
export const transcriptionAI      = makeModelWrapper('flash', 'transcription_analysis');
export const quizGeneratorAI      = makeModelWrapper('flash', 'quiz_generator', true);
export const surveyGeneratorAI    = makeModelWrapper('flash', 'survey_generator', true);
export const surveyAnalysisAI     = makeModelWrapper('flash', 'survey_analysis');
export const observationReviewAI  = makeModelWrapper('flash', 'observation_review', true);
export const studentAnalysisAI    = makeModelWrapper('flash', 'student_analysis');
export const resultAutoGradeAI    = makeModelWrapper('flash', 'result_auto_grade', true);
export const materialReorganizeAI = makeModelWrapper('flash', 'material_reorganize');
export const slideDeckDraftAI      = makeModelWrapper('flash', 'slidedeck_ai_draft', true);
export const coverPromptAI         = makeModelWrapper('flash', 'cover_prompt_suggest', true);
export const ideaAnalysisAI        = makeModelWrapper('flash', 'idea_analysis', true);
export const lessonPlanDraftAI     = makeModelWrapper('flash', 'lesson_plan_draft');
export const ideaQuestionAI        = makeModelWrapper('flash', 'idea_clarify_question', true);
export const ideaPRDAI             = makeModelWrapper('flash', 'idea_prd_generate', true);
export const ideaPRDDraftAI        = makeModelWrapper('flash', 'idea_prd_draft');
// 수업 계획서 자동생성(MaterialEditor) 전용 — 위 lessonPlanDraftAI(아이디어→마크다운)와는 별개 기능
export const lessonPlanSectionsAI  = makeModelWrapper('pro', 'lesson_plan_sections', true);
export const portfolioIntroDraftAI = makeModelWrapper('flash', 'portfolio_intro');

/**
 * 세특/행특 초안 프롬프트 조립 + 생성 (AIAssistant.tsx, AI 코파일럿 세특 작성가 탭 공용)
 */
export async function generateSeatukDraft(
  observations: { activity_name: string; content: string }[],
  docType: string,
  teacherPrompt: string,
): Promise<string> {
  const obsText = observations.length > 0
    ? observations.map(o => `활동명: ${o.activity_name}\n내용: ${o.content}`).join('\n---\n')
    : '제출된 관찰 기록이 없습니다.';
  const prompt = `
${SYSTEM_INSTRUCTIONS.BASE}
${SYSTEM_INSTRUCTIONS.SEATUK_GUIDE}
${SYSTEM_INSTRUCTIONS.PRIVACY}

${teacherPrompt ? `[선생님 추가 지침]\n${teacherPrompt}\n` : ''}

아래는 학생의 관찰 기록입니다.
이 기록을 바탕으로 ${docType} 초안을 작성해주세요.
문구만 출력하고 학생 이름, 마크다운, 설명 등은 포함하지 마세요.

[학생 관찰 기록]
${obsText}
`;
  const result = await seatukDraftAI.generateContent(prompt);
  return result.response.text().trim();
}

/**
 * 파일을 Gemini API 파트로 변환 (Base64) - 브라우저에서 실행, 결과를 서버로 전달
 */
export async function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64Data, mimeType: file.type } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Storage 공개 URL을 fileToGenerativePart와 동일한 inlineData 형태로 변환 (fetch로 받은 File이 아닌 원격 파일용)
export async function urlToGenerativePart(url: string, mimeType: string): Promise<{ inlineData: { data: string; mimeType: string } }> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({ inlineData: { data: base64Data, mimeType } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const RESULT_EVAL_TAGS = ['자기주도', '논리적사고', '표현력', '창의성', '협력', '성실성', '탐구력', '문제해결'];

// Gemini가 내용을 직접 읽을 수 있는 file_type만 자동 채점 대상. 그 외(zip, docx 등)는 직접 확인 필요.
export const GRADABLE_FILE_TYPES = ['application/pdf', 'text/html', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

interface GradableResultItem {
  result_type: string;
  text_content?: string | null;
  storage_path?: string | null;
  storage_paths?: string[] | null;
  file_type?: string | null;
}

export function isResultGroupGradable(items: GradableResultItem[]): boolean {
  return items.some(r => r.result_type === 'text' && !!r.text_content?.trim())
    || items.some(r => r.result_type === 'image')
    || items.some(r => r.result_type === 'file' && !!r.file_type && GRADABLE_FILE_TYPES.includes(r.file_type));
}

// student_results 그룹(텍스트/이미지/파일)을 autoGradeResult에 넘길 수 있는 형태로 변환.
// AutoGradingPanel(클래스 전체)과 StudentView(학생 개별) 양쪽에서 공유하는 로직.
export async function buildGradingContent(items: GradableResultItem[]): Promise<{ text?: string; files?: { inlineData: { data: string; mimeType: string } }[] }> {
  const textItem = items.find(r => r.result_type === 'text');
  const imageItem = items.find(r => r.result_type === 'image');
  const fileItem = items.find(r => r.result_type === 'file' && r.file_type && GRADABLE_FILE_TYPES.includes(r.file_type));

  let text = textItem?.text_content?.trim() || '';
  const files: { inlineData: { data: string; mimeType: string } }[] = [];

  if (imageItem) {
    const urls = getResultImagePublicUrls(supabase.storage, imageItem).slice(0, 4);
    for (const url of urls) {
      try {
        files.push(await urlToGenerativePart(url, imageItem.file_type || 'image/png'));
      } catch (err) {
        console.warn('이미지 첨부 실패:', err);
      }
    }
  }

  if (fileItem?.storage_path) {
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(fileItem.storage_path);
    if (fileItem.file_type === 'text/html') {
      try {
        const res = await fetch(data.publicUrl);
        const html = await res.text();
        text = text ? `${text}\n\n${html}` : html;
      } catch (err) {
        console.warn('HTML 파일 읽기 실패:', err);
      }
    } else {
      try {
        files.push(await urlToGenerativePart(data.publicUrl, fileItem.file_type || 'application/pdf'));
      } catch (err) {
        console.warn('파일 첨부 실패:', err);
      }
    }
  }

  return { text: text || undefined, files: files.length > 0 ? files : undefined };
}

const LAST_RUBRIC_KEY_PREFIX = 'saengilog_last_rubric_';

// 클래스별 "마지막으로 사용한 채점 기준"을 로컬에 저장 — Classroom의 일괄 채점 탭과
// StudentView의 개별 AI 채점 제안 버튼이 같은 기준을 재사용할 수 있도록 공유.
export function getLastRubric(classId: string): string {
  try {
    return localStorage.getItem(LAST_RUBRIC_KEY_PREFIX + classId) || '';
  } catch {
    return '';
  }
}

export function setLastRubric(classId: string, rubric: string): void {
  try {
    localStorage.setItem(LAST_RUBRIC_KEY_PREFIX + classId, rubric);
  } catch {
    // 프라이빗 모드 등 localStorage 사용 불가 환경은 조용히 무시
  }
}

// 교사가 입력한 채점 기준 + 학생 제출 내용(텍스트/이미지·PDF 첨부)을 바탕으로
// 역량 태그·별점·코멘트를 AI가 제안. 실패 시 null 반환 — 호출 측에서 "직접 입력"으로 안내.
export async function autoGradeResult(
  rubric: string,
  content: { text?: string; files?: { inlineData: { data: string; mimeType: string } }[] },
  classId?: string
): Promise<{ tags: string[]; score: number; comment: string } | null> {
  const prompt = `당신은 학생이 제출한 결과물을 교사가 입력한 채점 기준에 따라 평가하는 AI입니다.

[교사의 채점 기준]
${rubric}

[역량 태그] (아래 목록 중에서만 선택, 근거가 있는 태그만 1개 이상 선택)
${RESULT_EVAL_TAGS.join(', ')}

[학생 제출 내용]
${content.text || '(아래 첨부된 이미지/파일을 직접 확인하고 평가하세요)'}

[코드/HTML 제출물 평가 시 주의사항]
제출 내용이 HTML/CSS/JS 등 코드인 경우, 당신은 이 코드를 브라우저에서 실행하거나 버튼을 직접 클릭해본 것이 아니라 소스 코드 텍스트만 읽고 있습니다. 버튼 클릭, 화면 전환, 알림 동작 등 실제로 실행해봐야만 확인할 수 있는 동작에 대해서는 "정상적으로 작동한다"처럼 단정하지 마세요. 코드에 관련 요소(이벤트 핸들러, 함수 등)가 존재한다는 사실과 실제로 그것이 오류 없이 동작한다는 것은 다릅니다. 이런 부분은 "코드 상으로는 ~하게 구현되어 있으나 실제 동작 여부는 직접 확인이 필요합니다"처럼 신중하게 표현하고, score와 comment도 확인되지 않은 실행 결과를 근거로 후하게 주지 마세요.

위 기준에 따라 평가하여 반드시 아래 JSON 형식만 반환하세요 (다른 텍스트 없이):
{"tags":["역량태그1","역량태그2"],"score":3,"comment":"학생에게 보여줄 한두 문장 코멘트"}
- score는 1~5 사이 정수 (기준을 잘 충족할수록 높은 점수)
- comment는 구체적이고 격려하는 톤으로 작성하되, 확인되지 않은 실행 결과를 단정하지 말 것`;

  const parts: any[] = [{ text: prompt }];
  if (content.files?.length) parts.push(...content.files);

  try {
    const result = await resultAutoGradeAI.generateContent(parts, { class_id: classId });
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: any) => RESULT_EVAL_TAGS.includes(t)) : [];
    const scoreNum = Number(parsed.score);
    return {
      tags,
      score: Number.isFinite(scoreNum) ? Math.min(5, Math.max(1, Math.round(scoreNum))) : 0,
      comment: String(parsed.comment || '').trim(),
    };
  } catch (error) {
    console.error('autoGradeResult error:', error);
    return null;
  }
}

export async function validateStudentGuidePrompt(
  prompt: string
): Promise<{ feasible: boolean; message: string; guide?: string }> {
  const validationPrompt = `당신은 AI 학생 활동 기록 검토 시스템의 지침 검증 전문가입니다.
교사가 "학생 활동 가이드"에 입력한 내용이 AI가 학생 제출물을 실제로 판단할 수 있는 기준인지 평가하세요.

[시스템 동작 방식]
- 학생이 활동 기록(제목 + 내용 + 느낀 점)을 제출하면 AI가 이 가이드 기준으로 품질을 분석
- 기준 미충족 시 자동 반려(학생에게 사유와 개선 안내 제공)
- 글자수 제한·금지어는 별도 시스템이 이미 처리하므로 가이드에서 불필요

[AI가 판단 가능한 기준]
- 구체적 활동 서술 요구 (예: "단순 감상이 아닌 본인의 역할과 과정을 써야 함")
- 특정 내용 포함 요구 (예: "배운 개념을 실생활에 연결하여 작성")
- 작성 태도 기준 (예: "반복 문장으로 분량만 채운 경우 반려")
- 수업 연관성 확인 (예: "수업 내용과 무관한 내용은 반려")

[AI가 판단할 수 없는 기준]
- 사실 여부 확인 (예: "실제로 수업에 참여했는지 확인")
- 외부 데이터 비교 (예: "지난주보다 발전했는지")
- 글자수·맞춤법 기준 (별도 시스템에서 이미 처리)
- 표절 검사
- 지나치게 주관적인 기준 (예: "창의적이지 않으면 반려" — 창의성은 AI가 일관되게 판단 불가)

[교사가 작성한 가이드]
"${prompt}"

반드시 아래 JSON 형식으로만 응답하세요:
{"feasible":true,"message":"성공 메시지"}
또는
{"feasible":false,"message":"안 되는 이유","guide":"대신 이렇게 작성하세요"}`;

  try {
    const result = await promptValidatorAI.generateContent(validationPrompt);
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      feasible: Boolean(parsed.feasible),
      message: String(parsed.message || ''),
      guide: parsed.guide ? String(parsed.guide) : undefined,
    };
  } catch {
    return { feasible: true, message: '검증 중 오류가 발생했습니다. 지침은 저장됩니다.' };
  }
}

export async function validateTeacherPrompt(
  prompt: string
): Promise<{ feasible: boolean; message: string; guide?: string }> {
  const validationPrompt = `당신은 AI 생기부 초안 작성 시스템의 지침 검증 전문가입니다.
교사가 "AI 행특/세특 초안 작성 지침"에 입력한 내용이 시스템에서 실제로 동작 가능한지 판별하세요.

[시스템이 AI에게 제공하는 데이터]
- 학생의 활동 기록 (활동명 + 학생이 직접 작성한 내용 텍스트)
- 교사가 선택한 주차(전체 주차 또는 특정 주차)의 기록이 전달됨

[시스템이 절대 할 수 없는 것]
- 날짜/기간으로 필터링 (날짜 정보가 전달되지 않음)
- 성적·점수 반영 (성적 데이터 없음)
- 출석·결석 반영 (출석 데이터 없음)
- 다른 학생과 비교 (학생 1명씩 개별 처리)
- 외부 액션(알림 발송 등)
- 기록이 없는 학생을 자동 식별하여 최저 평가 부여 (기록 없는 학생은 초안 생성 대상에서 제외됨)

[동작 가능한 지침 예시]
- 문체·어미·분량·강조점 지침 (예: "~함, ~임 어미 사용", "500자 이내")
- 특정 역량·내용 강조 (예: "협업 태도 강조", "성장 가능성 위주로")
- AI로 작성한 것 같은 표현 검토 요청
- 학생의 활동 내용 기반 성취 판단

[교사가 작성한 지침]
"${prompt}"

반드시 아래 JSON 형식으로만 응답하세요:
{"feasible":true,"message":"성공 메시지"}
또는
{"feasible":false,"message":"안 되는 이유","guide":"대신 이렇게 작성하세요"}`;

  try {
    const result = await promptValidatorAI.generateContent(validationPrompt);
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      feasible: Boolean(parsed.feasible),
      message: String(parsed.message || ''),
      guide: parsed.guide ? String(parsed.guide) : undefined,
    };
  } catch {
    return { feasible: true, message: '검증 중 오류가 발생했습니다. 지침은 저장됩니다.' };
  }
}

export async function generateFeedbackDraft(
  type: 'obs' | 'result',
  title: string,
  content: string,
  classId?: string
): Promise<string> {
  const typeLabel = type === 'obs' ? '활동 기록' : '결과 제출물';
  const prompt = `학생이 제출한 ${typeLabel}에 대한 선생님 피드백 초안을 작성해줘.

[제출 내용]
제목: ${title}
내용: ${content}

[작성 기준]
- 학생의 노력과 성장을 인정하되, 개선 방향도 구체적으로 제시
- 2~3문장으로 간결하게
- 따뜻하고 교육적인 어조
- 학생의 제출 내용에서 구체적인 요소를 언급
- "~하면 좋겠습니다", "~가 인상적입니다" 등 완성형 어미 사용
- 피드백 문장만 출력 (별도 설명, 제목, 따옴표 없이)`;

  return callProxy({
    mode: 'generate',
    model: 'flash',
    feature: 'feedback_draft',
    systemInstruction: SYSTEM_INSTRUCTIONS.BASE + SYSTEM_INSTRUCTIONS.PRIVACY,
    prompt,
    ...(classId && { class_id: classId }),
  });
}

export async function generateClassInsight(className: string, observations: any[], classId?: string) {
  // 실제 데이터 기반 통계 추출
  const total = observations.length;
  const uniqueStudents = new Set(observations.map(o => o.student_id)).size;
  const recentObs = observations
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
  const activityCounts: Record<string, number> = {};
  for (const o of observations) {
    const name = o.activity_name || '기타';
    activityCounts[name] = (activityCounts[name] || 0) + 1;
  }
  const topActivities = Object.entries(activityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `"${name}" (${count}건)`)
    .join(', ');
  const pendingCount = observations.filter(o => o.status === 'pending').length;
  const approvedCount = observations.filter(o => o.status === 'approved').length;

  const prompt = `
학급명: ${className}

[실제 집계 데이터]
- 전체 활동 기록 수: ${total}건
- 참여 학생 수: ${uniqueStudents}명
- 가장 많이 기록된 활동: ${topActivities || '데이터 없음'}
- 승인 완료: ${approvedCount}건 / 승인 대기: ${pendingCount}건
- 최근 20건 활동 내용 샘플: ${JSON.stringify(recentObs.map(o => ({ 활동: o.activity_name, 내용요약: (o.content || '').slice(0, 80) })))}

[작성 지침]
- 위 실제 수치와 활동명을 반드시 언급할 것 (추상적 표현 금지)
- 예시처럼 구체적 숫자/활동명을 포함하여 2문장 이내로 작성
- 예시: "${uniqueStudents}명의 학생이 '${Object.keys(activityCounts)[0] || '활동'}' 등 ${total}건의 기록을 제출했습니다. 특히 [구체적 활동명]에서 [구체적 특징]이 두드러졌습니다."
- 클리셰 표현("논리적 분석력이 향상" 등) 사용 금지
  `;
  return callProxy({
    mode: 'generate',
    model: 'flash',
    feature: 'class_insight',
    systemInstruction: SYSTEM_INSTRUCTIONS.BASE + SYSTEM_INSTRUCTIONS.PRIVACY,
    prompt,
    ...(classId && { class_id: classId }),
  });
}

function anonymizeObservations(observations: any[]) {
  return observations.map(o => ({
    activity_name: o.activity_name,
    content: o.content,
    status: o.status,
    created_at: o.created_at,
  }));
}

// AI 채팅 전용: 학급 소유 교사 본인만 보는 대화이므로 학생 이름은 포함하되,
// SEATUK_GUIDE/PRIVACY 지침으로 주민번호 등 민감정보 노출은 계속 차단한다.
function formatObservationsForChat(observations: any[]) {
  return observations.map(o => ({
    student_name: o.student_name,
    activity_name: o.activity_name,
    content: o.content,
    status: o.status,
    created_at: o.created_at,
  }));
}

export async function generateDetailedReport(className: string, observations: any[], classId?: string) {
  const prompt = `
    학급명: ${className}
    전체 관찰 기록: ${JSON.stringify(anonymizeObservations(observations))}

    위 데이터를 바탕으로 다음 항목을 포함한 심층 분석 보고서를 작성해줘:
    1. 학급 전체 성취도 요약
    2. 주요 핵심 역량 발현 키워드 (Top 3)
    3. 과목별/활동별 참여도 분석
    4. 향후 지도 가이드 및 제언

    작성 시 교육적인 전문 용어를 사용하고, 구체적인 사례(활동명 등)를 언급해줘.
    마크다운 형식을 사용해줘.
  `;
  return callProxy({
    mode: 'generate',
    model: 'pro',
    feature: 'detailed_report',
    systemInstruction: SYSTEM_INSTRUCTIONS.BASE + SYSTEM_INSTRUCTIONS.SEATUK_GUIDE + SYSTEM_INSTRUCTIONS.PRIVACY,
    prompt,
    ...(classId && { class_id: classId }),
  });
}

export async function extractTextFromFiles(files: { inlineData: { data: string; mimeType: string } }[]) {
  if (!files || files.length === 0) return [];
  try {
    return await callProxy({
      mode: 'generate',
      model: 'flash',
      feature: 'file_extract',
      prompt: `첨부된 파일(이미지, PDF, 엑셀 캡처 등)에서 텍스트 내용을 최대한 정확하게 추출해줘.
- 표 형태의 데이터라면 구조를 최대한 유지해서 텍스트로 변환해.
- 학생의 이름, 점수, 활동 내용 등 핵심 정보를 빠짐없이 포함해.
- 별도의 설명 없이 추출된 텍스트 데이터만 반환해.`,
      files,
    });
  } catch (error) {
    console.error('Text Extraction Error:', error);
    return '파일에서 텍스트를 추출하는 데 실패했습니다.';
  }
}

export async function chatWithClassData(
  className: string,
  observations: any[],
  history: { role: string; text: string }[],
  message: string,
  files?: { inlineData: { data: string; mimeType: string } }[],
  extractedText?: string,
  classId?: string,
  focusStudentName?: string,
  totalStudentCount?: number
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.SEATUK_GUIDE}${SYSTEM_INSTRUCTIONS.PRIVACY}
당신은 '${className}'의 학급 데이터를 파악하고 있는 AI 어시스턴트입니다.
선생님이 제공한 데이터와 첨부된 파일의 추출 텍스트를 바탕으로 답변하세요.
${focusStudentName ? `\n[집중 모드] 지금 선생님은 '${focusStudentName}' 학생 한 명에 집중해서 대화하고 있습니다. 아래 데이터도 이 학생의 기록으로 좁혀져 있으니, 답변도 이 학생에 한정해서 작성하세요.\n` : `\n[학급 기본 정보]\n전체 등록 학생 수: ${totalStudentCount ?? '알 수 없음'}명\n아래 관찰 기록에는 각 기록을 남긴 학생 이름(student_name)이 포함되어 있습니다. 이 데이터는 선생님 본인의 학급 데이터이므로, 학생 이름을 언급하며 개별 학생에 대한 질문에도 답변하세요. 다만 주민번호·주소 등 기록에 없는 민감정보를 추측해서 언급하지는 마세요.\n`}
[학급 데이터 환경 (관찰 기록)]
${JSON.stringify(focusStudentName ? anonymizeObservations(observations.slice(0, 100)) : formatObservationsForChat(observations.slice(0, 100)))}

[첨부 파일에서 추출된 텍스트 정보]
${extractedText || '첨부된 파일이 없거나 아직 추출되지 않았습니다.'}

[답변 가이드라인]
1. 데이터에 기반하여 답변하되, 파일의 내용을 참고했다면 "[파일 참고]"라고 명시하세요.
2. 학생 성장에 도움이 되는 교육적이고 긍정적인 방향으로 조언하세요.
3. 세특이나 행특 문구 작성을 요청받으면 기재요령을 준수하여 작성하세요.
4. 답변은 마크다운으로 가독성 있게 작성하세요. 소제목은 "##", 핵심 용어나 결론은 "**굵게**", 여러 항목을 나열할 때는 "-" 목록을, 여러 학생/활동/시기를 비교할 때는 표(|구분|내용|)를 적극 활용하세요.`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'ai_chat',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(files && files.length > 0 && { files }),
    ...(classId && { class_id: classId }),
  });
}

// AI 코파일럿 — 수업 기획 전문가: 자유 대화로 수업을 구체화하고, 합의되면
// [[LESSON_PLAN_DRAFT]] 마커가 붙은 계획안 초안을 응답에 포함해 반환한다.
export async function chatWithLessonPlanCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  subject?: string,
  weeklyPlan?: { week: number; topic: string }[],
  observations?: any[],
  referenceMaterials?: { title: string; content: string }[],
  libraryIndex?: { title: string; snippet: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.LESSON_PLAN_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 클래스] ${className}${subject ? ` · ${subject}` : ''}\n` : ''}
${weeklyPlan && weeklyPlan.length > 0 ? `\n[이 클래스의 주간 수업 계획]\n${weeklyPlan.map(p => `- ${p.week}주차: ${p.topic}`).join('\n')}\n(참고만 하세요. 이번 기획과 자연스럽게 이어지거나 시간표가 겹치면 짧게 언급하고, 관련 없으면 무시하세요.)\n` : ''}
${observations && observations.length > 0 ? `\n[이 클래스의 최근 관찰 기록 (참고용)]\n${JSON.stringify(formatObservationsForChat(observations))}\n(이 학급 학생들의 실제 성향·참여 패턴을 활동 설계에 참고하세요. 예: 특정 활동 유형에서 참여도가 높았다면 비슷한 형태를 제안. 단, 계획안 본문에는 학생 이름이나 특정 개인을 특정할 수 있는 표현을 그대로 적지 말고 "이 반은~" 같은 일반화된 표현으로 반영하세요.)\n` : ''}
${libraryIndex && libraryIndex.length > 0 ? `\n[선생님의 공통 자료함 목록 — 특정 클래스에 속하지 않은 전체 자료의 제목과 요약]\n${libraryIndex.map(m => `- ${m.title}: ${m.snippet}`).join('\n')}\n("공통자료에 뭐 있어?" 같은 질문에는 이 목록으로 실제 제목을 들어 답하세요. 목록에 없는 자료를 지어내지 마세요. 아래 [선생님이 불러온 과거 자료]에 본문이 없는 자료는 요약만 아는 상태이니, 자세한 내용이 필요하면 그렇다고 말하세요.)\n` : ''}
${referenceMaterials && referenceMaterials.length > 0 ? `\n[선생님이 불러온 과거 자료]\n${referenceMaterials.map(r => `### ${r.title}\n${r.content.slice(0, 3000)}`).join('\n\n')}\n(선생님이 직접 이 자료들이 참고할 만하다고 판단해 불러왔거나, 이번 메시지와 의미가 비슷해 자동으로 불러온 자료입니다. 톤·형식·활동 아이디어를 이번 기획에 자연스럽게 이어가거나 재활용하세요. 그대로 베끼지 말고 이번 수업 맥락에 맞게 각색하세요.)\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'lesson_plan_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

export async function chatWithObservationAnalyst(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  observations?: any[],
  weeklyPlan?: { week: number; topic: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.OBSERVATION_ANALYST}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 클래스] ${className}\n` : ''}
${weeklyPlan && weeklyPlan.length > 0 ? `\n[이 클래스의 주간 수업 계획 — 가장 최근에 만들어진 주차는 이 목록의 마지막 항목입니다]\n${weeklyPlan.map(p => `- ${p.week}주차: ${p.topic}`).join('\n')}\n` : ''}
${observations && observations.length > 0
    ? `\n[이 클래스의 관찰 기록]\n${JSON.stringify(formatObservationsForChat(observations))}\n(교사가 직접 작성한 기록과 학생이 제출해 승인/대기 중인 기록이 함께 포함되어 있습니다. 위 데이터에 근거해서만 답변하세요.)\n`
    : '\n[참고] 아직 이 클래스의 관찰 기록 데이터가 없습니다. 클래스를 선택하도록 안내하거나 일반적인 조언만 제공하세요.\n'}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'observation_analyst_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

// AI 코파일럿 — 슬라이드 제작가: 대화로 슬라이드 내용을 구체화하고, 합의되면
// [[SLIDE_DECK_DRAFT]] 마커가 붙은 초안을 응답에 포함해 반환한다.
export async function chatWithSlideDeckCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  subject?: string,
  weeklyPlan?: { week: number; topic: string }[],
  referenceMaterials?: { title: string; content: string }[],
  libraryIndex?: { title: string; snippet: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.SLIDE_DECK_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 클래스] ${className}${subject ? ` · ${subject}` : ''}\n` : ''}
${weeklyPlan && weeklyPlan.length > 0 ? `\n[이 클래스의 주간 수업 계획]\n${weeklyPlan.map(p => `- ${p.week}주차: ${p.topic}`).join('\n')}\n(참고만 하세요. 이번 슬라이드와 자연스럽게 이어지면 짧게 언급하고, 관련 없으면 무시하세요.)\n` : ''}
${libraryIndex && libraryIndex.length > 0 ? `\n[선생님의 공통 자료함 목록 — 특정 클래스에 속하지 않은 전체 자료의 제목과 요약]\n${libraryIndex.map(m => `- ${m.title}: ${m.snippet}`).join('\n')}\n("공통자료에 뭐 있어?" 같은 질문에는 이 목록으로 실제 제목을 들어 답하세요. 목록에 없는 자료를 지어내지 마세요. 아래 [선생님이 불러온 과거 자료]에 본문이 없는 자료는 요약만 아는 상태이니, 자세한 내용이 필요하면 그렇다고 말하세요.)\n` : ''}
${referenceMaterials && referenceMaterials.length > 0 ? `\n[선생님이 불러온 과거 자료]\n${referenceMaterials.map(r => `### ${r.title}\n${r.content.slice(0, 3000)}`).join('\n\n')}\n(선생님이 직접 이 자료들이 참고할 만하다고 판단해 불러왔거나, 이번 메시지와 의미가 비슷해 자동으로 불러온 자료입니다. 내용이나 흐름을 이번 슬라이드에 자연스럽게 이어가거나 재활용하세요. 그대로 베끼지 말고 이번 맥락에 맞게 각색하세요.)\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'slide_deck_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

// AI 코파일럿 — 자료 제작가: 대화로 학습지/유인물 내용을 처음부터 구체화하고, 합의되면
// [[MATERIAL_DRAFT]] 마커가 붙은 초안을 응답에 포함해 반환한다.
export async function chatWithMaterialCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  subject?: string,
  weeklyPlan?: { week: number; topic: string }[],
  referenceMaterials?: { title: string; content: string }[],
  libraryIndex?: { title: string; snippet: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.MATERIAL_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${RICH_FORMATTING_GUIDE}
${className ? `\n[현재 대화 중인 클래스] ${className}${subject ? ` · ${subject}` : ''}\n` : ''}
${weeklyPlan && weeklyPlan.length > 0 ? `\n[이 클래스의 주간 수업 계획]\n${weeklyPlan.map(p => `- ${p.week}주차: ${p.topic}`).join('\n')}\n(참고만 하세요. 이번 자료와 자연스럽게 이어지면 짧게 언급하고, 관련 없으면 무시하세요.)\n` : ''}
${libraryIndex && libraryIndex.length > 0 ? `\n[선생님의 공통 자료함 목록 — 특정 클래스에 속하지 않은 전체 자료의 제목과 요약]\n${libraryIndex.map(m => `- ${m.title}: ${m.snippet}`).join('\n')}\n("공통자료에 뭐 있어?" 같은 질문에는 이 목록으로 실제 제목을 들어 답하세요. 목록에 없는 자료를 지어내지 마세요. 아래 [선생님이 불러온 과거 자료]에 본문이 없는 자료는 요약만 아는 상태이니, 자세한 내용이 필요하면 그렇다고 말하세요.)\n` : ''}
${referenceMaterials && referenceMaterials.length > 0 ? `\n[선생님이 불러온 과거 자료]\n${referenceMaterials.map(r => `### ${r.title}\n${r.content.slice(0, 3000)}`).join('\n\n')}\n(선생님이 직접 이 자료들이 참고할 만하다고 판단해 불러왔거나, 이번 메시지와 의미가 비슷해 자동으로 불러온 자료입니다. 톤·형식·구성 아이디어를 이번 자료에 자연스럽게 이어가거나 재활용하세요. 그대로 베끼지 말고 이번 맥락에 맞게 각색하세요.)\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'material_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

// AI 코파일럿 — 퀴즈 제작가: 대화로 퀴즈 사양(참고 내용/문항 수/난이도)을 확정하고, 합의되면
// [[QUIZ_DRAFT]] 마커가 붙은 확정 요약을 응답에 포함해 반환한다. 실제 문항 생성은 별도(quizGeneratorAI)에서 처리한다.
export async function chatWithQuizCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  subject?: string,
  referenceMaterials?: { title: string; content: string }[],
  libraryIndex?: { title: string; snippet: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.QUIZ_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 클래스] ${className}${subject ? ` · ${subject}` : ''}\n` : ''}
${libraryIndex && libraryIndex.length > 0 ? `\n[선생님의 공통 자료함 목록 — 특정 클래스에 속하지 않은 전체 자료의 제목과 요약]\n${libraryIndex.map(m => `- ${m.title}: ${m.snippet}`).join('\n')}\n("공통자료에 뭐 있어?" 같은 질문에는 이 목록으로 실제 제목을 들어 답하세요. 목록에 없는 자료를 지어내지 마세요. 아래 [선생님이 불러온 과거 자료]에 본문이 없는 자료는 요약만 아는 상태이니, 자세한 내용이 필요하면 그렇다고 말하세요.)\n` : ''}
${referenceMaterials && referenceMaterials.length > 0 ? `\n[선생님이 불러온 과거 자료]\n${referenceMaterials.map(r => `### ${r.title}\n${r.content.slice(0, 3000)}`).join('\n\n')}\n(선생님이 직접 이 자료들이 퀴즈 출제 근거로 참고할 만하다고 판단해 불러왔거나, 이번 메시지와 의미가 비슷해 자동으로 불러온 자료입니다. 이 내용을 바탕으로 사양을 확정하세요.)\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'quiz_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

export async function chatWithSurveyCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  subject?: string,
  referenceMaterials?: { title: string; content: string }[],
  libraryIndex?: { title: string; snippet: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.SURVEY_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 클래스] ${className}${subject ? ` · ${subject}` : ''}\n` : ''}
${libraryIndex && libraryIndex.length > 0 ? `\n[선생님의 공통 자료함 목록 — 특정 클래스에 속하지 않은 전체 자료의 제목과 요약]\n${libraryIndex.map(m => `- ${m.title}: ${m.snippet}`).join('\n')}\n("공통자료에 뭐 있어?" 같은 질문에는 이 목록으로 실제 제목을 들어 답하세요. 목록에 없는 자료를 지어내지 마세요. 아래 [선생님이 불러온 과거 자료]에 본문이 없는 자료는 요약만 아는 상태이니, 자세한 내용이 필요하면 그렇다고 말하세요.)\n` : ''}
${referenceMaterials && referenceMaterials.length > 0 ? `\n[선생님이 불러온 과거 자료]\n${referenceMaterials.map(r => `### ${r.title}\n${r.content.slice(0, 3000)}`).join('\n\n')}\n(선생님이 직접 이 자료들이 설문 출제 근거로 참고할 만하다고 판단해 불러왔거나, 이번 메시지와 의미가 비슷해 자동으로 불러온 자료입니다. 이 내용을 바탕으로 사양을 확정하세요.)\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'survey_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

export async function chatWithIdeaHandoffCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  subject?: string,
  referenceMaterials?: { title: string; content: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.IDEA_HANDOFF_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 클래스] ${className}${subject ? ` · ${subject}` : ''}\n` : ''}
${referenceMaterials && referenceMaterials.length > 0 ? `\n[선생님이 불러온 과거 자료]\n${referenceMaterials.map(r => `### ${r.title}\n${r.content.slice(0, 3000)}`).join('\n\n')}\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'idea_handoff_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

export async function chatWithClassManagerCopilot(
  history: { role: string; text: string }[],
  message: string,
  className?: string,
  classId?: string,
  existingClassNames?: string[],
  weeklyPlan?: { week: number; topic: string }[],
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.CLASS_MANAGER_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
${className ? `\n[현재 대화 중인 학급] ${className}\n` : '\n[현재 대화 중인 학급] 아직 선택된 학급이 없습니다.\n'}
${existingClassNames && existingClassNames.length > 0 ? `\n[선생님의 기존 학급 목록] ${existingClassNames.join(', ')}\n` : ''}
${weeklyPlan && weeklyPlan.length > 0 ? `\n[현재 학급의 주간 수업 계획 — 가장 최근에 만들어진 주차는 이 목록의 마지막 항목입니다]\n${weeklyPlan.map(p => `- ${p.week}주차: ${p.topic}`).join('\n')}\n` : ''}`;

  return callProxy({
    mode: 'chat',
    model: 'pro',
    feature: 'class_manager_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
    ...(classId && { class_id: classId }),
  });
}

// AI 코파일럿 — 사용법 가이드: 앱의 기능/요금제/AI 사용량 등 사용법 전반에 대한 질문에
// 호출부(AiCopilot.tsx)가 전달한 구조화 데이터(수업 도구 안내, 요금제 비교표, 계정 사용량 요약)에
// 근거해서만 답한다. 확정 마커/초안 생성이 없는 순수 Q&A 페르소나.
export async function chatWithAppGuideCopilot(
  history: { role: string; text: string }[],
  message: string,
  toolsGuideText: string,
  plansGuideText: string,
  accountContext: string,
) {
  const systemInstruction = `${SYSTEM_INSTRUCTIONS.BASE}${SYSTEM_INSTRUCTIONS.APP_GUIDE_COPILOT}${SYSTEM_INSTRUCTIONS.PRIVACY}
[수업 도구 가이드 데이터]
${toolsGuideText}

[요금제 비교 데이터]
${plansGuideText}

[계정/사용량 정보]
${accountContext}`;

  return callProxy({
    mode: 'chat',
    model: 'flash',
    feature: 'app_guide_copilot',
    systemInstruction,
    history: history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    })),
    message,
  });
}

// 실제 수업 계획안(수업 자료 에디터에 그대로 들어가는 문서)이 밋밋한 소제목+불릿 나열에
// 그치지 않고, 교재처럼 쓸 수 있도록 표/인용문/코드블록/토글을 상황에 맞게 활용하도록
// 유도하는 공통 지시문. 에디터(RichEditor)가 이 문법을 그대로 렌더링하므로 프롬프트에서만
// 유도하면 되고, 슬라이드/프레젠테이션처럼 공간이 빠듯한 포맷에는 붙이지 않는다.
const RICH_FORMATTING_GUIDE = `[형식 활용 규칙 — 실제 교재처럼 보이도록]
- 소제목은 반드시 "## 제목"처럼 #과 제목 사이에 공백을 하나 넣어서 쓰세요. "##제목"처럼 공백 없이 붙여 쓰면 제목으로 렌더링되지 않고 화면에 "##" 글자가 그대로 노출됩니다. 절대 공백을 빠뜨리지 마세요.
- 소제목과 불릿만 나열하지 말고, 아래 요소를 실제로 도움이 되는 곳에만 자연스럽게 섞어 쓰세요. 모든 섹션에 억지로 넣지 마세요.
- 표: 활동별 시간·준비물·역할, 차시별 진행 순서, 비교 항목처럼 여러 항목을 나란히 비교/정리하기 좋은 내용은 마크다운 표로 작성하세요. 표는 3~4행 이내로 간결하게 작성하고, 각 셀은 짧은 한두 단어~한 문장으로만 채우세요. **절대 열 너비를 맞추려고 셀 안에 공백을 추가하지 마세요.** 헤더 행, 구분선 행, 데이터 행 모두 셀 내용 바로 뒤에 공백 없이 바로 \`|\`를 쓰고, 다음 줄로 바로 넘어가세요. **표는 반드시 독립된 블록으로, 줄 맨 앞부터(들여쓰기 없이) 시작하세요. 불릿(*, -)이나 번호 목록 항목의 텍스트 뒤에 이어 붙이거나 목록 안에 중첩하지 말고, 표 앞뒤에 빈 줄을 두어 문단과 분리하세요.** 아래 예시의 형식을 정확히 그대로 따르세요(각 줄 길이가 달라도 됩니다):

| 항목 | 내용 |
| --- | --- |
| 예시 항목1 | 짧은 설명 |
| 예시 항목2 | 짧은 설명 |
- 인용문: 교사가 학생에게 그대로 던질 발문, 핵심 메시지나 명언, 꼭 강조하고 싶은 한 문장은 \`> \`로 시작하는 인용문으로 표시하세요.
- 코드 블록: 학생에게 나눠줄 대화 스크립트, 활동지 양식, 프로그래밍 코드 등 줄바꿈·서식을 그대로 보존해야 하는 내용은 \`\`\`로 감싼 코드 블록으로 작성하세요.
- 토글: 본문 흐름을 방해하지 않되 참고하면 좋은 심화 설명, 배경 지식, 추가 예시는 토글로 접어 넣으세요. **반드시 독립된 문단으로, 줄 맨 앞부터(들여쓰기·불릿·번호 없이) 시작하세요. 목록(*, -, 1. 등) 항목 안에 중첩해서 넣지 마세요.** \`<details>\`, \`<summary>\`, 내용, \`</details>\`는 각각 줄 맨 앞에서 시작하고, \`<summary>\` 다음 줄과 \`</details>\` 앞 줄은 반드시 빈 줄로 띄우세요. 아래 예시를 정확히 그대로 따르세요:

<details>
<summary>토글 제목</summary>

접혀 있다가 펼치면 보이는 내용

</details>
- 이미지 제안: 사진·그림·도식이 있으면 이해에 크게 도움이 될 부분(실험 장면, 구조도, 결과물 예시, 현장 사진 등)에는 어떤 이미지가 있으면 좋을지 짧고 구체적으로 제안하는 콜아웃을 넣으세요. 모든 섹션에 넣지 말고 정말 필요한 곳 1~3곳에만 자연스럽게 넣으세요. **반드시 독립된 블록으로, 줄 맨 앞부터(들여쓰기·목록 중첩 없이) 시작하고, 앞뒤에 빈 줄을 두세요.** 아래 예시를 정확히 그대로 따르세요:

<div data-callout="info">

이미지 제안: (어떤 이미지가 있으면 좋을지 한 문장으로 구체적으로 — 예: 시금치 잎 단면 구조를 보여주는 확대 사진이나 도식)

</div>`;

// ── 수업 자료 AI 재구성 (학습 가이드 / 발표 자료) ─────────────────────────────

// 선생님이 UI에서 그대로 읽을 수 있도록 작성된 기본 프롬프트 (투명 공개용)
export const MATERIAL_REORG_PROMPTS: Record<'guide' | 'presentation', string> = {
  guide: `학생이 이 내용을 스스로 단계별로 따라가며 학습할 수 있는 '학습 가이드' 형식으로 재구성합니다.
- 도입부에 "이번 시간 학습 목표"를 2~3문장으로 정리합니다.
- 내용을 논리적 순서에 따라 "## STEP 1. ~", "## STEP 2. ~" 형식의 단계로 나눕니다.
- 각 단계는 소제목과 설명으로 구성하고, 필요하면 "확인해보기" 질문을 덧붙입니다.
- 마지막에 "정리 체크리스트" 섹션을 불릿으로 추가합니다.
- 원문에 없는 정보를 임의로 추가하거나 빼지 않습니다.
- {{IMG:n}} 형태의 자리표시자는 텍스트를 바꾸지 말고 문맥에 맞는 위치로만 재배치합니다.

${RICH_FORMATTING_GUIDE}`,

  presentation: `이 내용을 발표 화면(16:9 프레젠테이션)에서 스크롤 없이 한 화면에 다 보이도록 슬라이드 자료로 재구성합니다.
- 슬라이드는 빈 줄 다음 "---" 한 줄로 구분합니다.
- 각 슬라이드의 맨 첫 줄에는 반드시 아래 형식의 메타 주석을 작성합니다 (화면에는 보이지 않고, 배경색·아이콘 지정에만 쓰입니다):
  <!-- meta: bg=키워드 icon=이모지1개 -->
  · bg는 슬라이드 주제 분위기에 맞춰 다음 중 하나만: purple, blue, teal, green, amber, rose, dark
  · icon은 슬라이드 내용을 함축하는 이모지 1개만 (예: 🎯 💡 ✅ 👥 📌 ⚙️ 🚀). 장식용이므로 화려한 조합이나 여러 개를 쓰지 않습니다.
- 첫 슬라이드는 제목 슬라이드로, 수업 주제를 한 줄로 담습니다.
- 한 슬라이드에는 소제목 1개와 핵심 불릿 최대 4개(불릿당 12단어 이내, 1줄)만 담아 16:9 화면에 여유 있게 다 들어가도록 합니다. 절대 스크롤이 필요할 만큼 길게 쓰지 않습니다.
- 내용이 많으면 슬라이드를 여러 장으로 나누고, 한 슬라이드에 모든 내용을 몰아넣지 않습니다.
- 텍스트가 많은 슬라이드에는 이미지를 넣지 않고, 이미지는 관련 내용이 있는 별도 슬라이드에 배치합니다.
- 원문에 없는 정보를 임의로 추가하거나 빼지 않습니다.
- {{IMG:n}} 형태의 자리표시자는 텍스트를 바꾸지 말고 적절한 슬라이드 위치로만 재배치합니다.`,
};

// 이미지 마크다운을 자리표시자로 치환 — AI가 URL을 직접 다루지 않도록 함
export function extractImagePlaceholders(content: string): { replaced: string; map: string[] } {
  const map: string[] = [];
  const replaced = content.replace(/!\[[^\]]*\]\([^)]+\)/g, (match) => {
    map.push(match);
    return `{{IMG:${map.length - 1}}}`;
  });
  return { replaced, map };
}

// 마크다운 이미지에서 URL만 뽑아낸 목록 (순서대로) — 슬라이드 초안 생성 시 인덱스로 참조
// 자료 에디터는 ![alt](url "width:123") 형식으로 너비를 저장하므로, 괄호 안 전체가 아니라
// URL 부분만 분리해야 한다 (title 부분을 그대로 넣으면 이미지가 깨진다).
export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) urls.push(m[1]);
  return urls;
}

// 마크다운 헤더(#~###)로 원문의 섹션 구조를 뽑아냄 — AI가 섹션을 스스로 추측하지 않고
// 저자가 이미 나눠둔 소제목 구조를 그대로 따라 슬라이드를 배정하게 하기 위함
export function extractSectionOutline(content: string): string[] {
  const headings: string[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    headings.push(`${'  '.repeat(m[1].length - 1)}- ${m[2].trim()}`);
  }
  return headings;
}

// 펜스 코드블록을 자리표시자로 치환 — AI가 코드를 지어내지 않고 원문에 실제 있는 코드만 참조하게 함
export function extractCodePlaceholders(content: string): { replaced: string; blocks: { lang: string; code: string }[] } {
  const blocks: { lang: string; code: string }[] = [];
  const replaced = content.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    blocks.push({ lang: String(lang).trim(), code: String(code).replace(/\n$/, '') });
    return `{{CODE:${blocks.length - 1}}}`;
  });
  return { replaced, blocks };
}

// 자리표시자를 원본 이미지 마크다운으로 복원 — 응답에서 누락된 이미지는 하단에 폴백으로 추가
function restoreImagePlaceholders(result: string, map: string[]): string {
  const used = new Set<number>();
  let restored = result.replace(/\{\{IMG:(\d+)\}\}/g, (_, i) => {
    const idx = Number(i);
    used.add(idx);
    return map[idx] ?? '';
  });
  const missing = map.filter((_, i) => !used.has(i));
  if (missing.length > 0) {
    restored += '\n\n---\n\n' + missing.join('\n\n');
  }
  return restored;
}

// [[FEEDBACK]]...[[/FEEDBACK]] 블록 — 선생님 추가 요청사항이 기본 규칙과 충돌해
// 완전히 반영되지 못했을 때만 AI가 응답 맨 앞에 붙이는 반영 여부 안내
const FEEDBACK_BLOCK_RE = /^\s*\[\[FEEDBACK\]\]\s*\n?([\s\S]*?)\n?\s*\[\[\/FEEDBACK\]\]\s*\n?/;

// 선생님이 입력한 "추가 요청사항"이 정적 마크다운 결과물로 실제 구현 가능한지 생성 전에 미리 검증
export async function validateReorganizeInstruction(
  instruction: string,
  mode: 'guide' | 'presentation'
): Promise<{ feasible: boolean; message: string; guide?: string }> {
  const modeLabel = mode === 'guide' ? '학습 가이드' : '발표 슬라이드';
  const validationPrompt = `당신은 AI 수업 자료 정리 시스템의 요청사항 검증 전문가입니다.
교사가 "${modeLabel} AI 정리" 기능에 입력한 추가 요청사항이 실제로 구현 가능한지 판별하세요.

[시스템이 만들어내는 결과물]
- 순수 텍스트 마크다운 문서입니다 (제목, 문단, 불릿/번호 목록, 표, 인용구, 토글 블록, 콜아웃 강조 박스, 원문에 이미 있던 이미지로만 구성)
- ${mode === 'presentation' ? '16:9 슬라이드로 나뉘며 슬라이드마다 배경 테마 1개·이모지 아이콘 1개만 지정 가능합니다' : '학생이 순서대로 따라가는 STEP 단계 구조로 나뉩니다'}
- 화면에 그려진 뒤에는 움직이지 않는 정적 문서입니다

[시스템이 절대 할 수 없는 것]
- 애니메이션, 전환 효과, 움직이거나 반짝이는 요소
- 이미지 생성·편집·교체 (원문에 없던 새 이미지를 만들거나 기존 이미지를 다른 것으로 바꿀 수 없음 — 배치 위치 조정만 가능)
- 클릭/호버 상호작용, 버튼, 게임·퀴즈 자동 채점 등 앱 기능
- 동영상 삽입/재생, 오디오, 외부 스크립트 실행
- 실시간 데이터 연동
- 원문에 없는 사실 정보의 임의 추가

[동작 가능한 요청 예시]
- 말투·어조, 강조점, 분량 조절 (예: 중학생 눈높이로, 간결하게)
- 특정 섹션 강조, 순서 변경, 원문 내용 범위 안에서 예시 보강
- 표/불릿/토글/콜아웃 등 형식 활용, 소제목 구성 방식 조정
- 톤앤매너 지정 (친근하게, 격식있게 등)

[교사가 입력한 추가 요청사항]
"${instruction}"

반드시 아래 JSON 형식으로만 응답하세요:
{"feasible":true,"message":"성공 메시지"}
또는
{"feasible":false,"message":"안 되는 이유","guide":"대신 이렇게 요청해보세요"}`;

  try {
    const result = await promptValidatorAI.generateContent(validationPrompt);
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(raw);
    return {
      feasible: Boolean(parsed.feasible),
      message: String(parsed.message || ''),
      guide: parsed.guide ? String(parsed.guide) : undefined,
    };
  } catch {
    return { feasible: true, message: '검증 중 오류가 발생했습니다. 요청사항을 반영해 진행합니다.' };
  }
}

export async function reorganizeMaterialContent(
  rawContent: string,
  mode: 'guide' | 'presentation',
  userInstruction?: string,
  classId?: string
): Promise<{ content: string; feedback: string | null }> {
  const { replaced, map } = extractImagePlaceholders(rawContent);

  const trimmedInstruction = userInstruction?.trim();
  const instructionBlock = trimmedInstruction
    ? `\n\n[선생님 추가 요청사항 — 위 기본 규칙과 충돌하지 않는 선에서 반영]\n${trimmedInstruction}`
    : '';
  const feedbackInstruction = trimmedInstruction
    ? `\n\n[요청사항 반영 여부 안내]\n위 선생님 추가 요청사항이 기본 형식 규칙(단계 구조, 슬라이드 분할/메타 규칙 등)과 충돌해 완전히 반영하지 못했다면, 응답 맨 앞줄에 아래 형식으로 짧게 안내를 붙이세요.\n[[FEEDBACK]]\n(반영되지 않은 부분을 1문장으로) (대신 이렇게 요청해보세요: 로 시작하는 대안 1문장)\n[[/FEEDBACK]]\n요청사항을 완전히 반영했다면 이 블록을 절대 넣지 마세요. 블록 다음 줄부터는 곧바로 실제 정리된 본문만 이어서 작성하세요.`
    : '';

  const prompt = `${MATERIAL_REORG_PROMPTS[mode]}${instructionBlock}${feedbackInstruction}\n\n[원문]\n${replaced}`;

  const result = await materialReorganizeAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim();
  const feedbackMatch = raw.match(FEEDBACK_BLOCK_RE);
  const feedback = feedbackMatch ? feedbackMatch[1].trim() : null;
  const bodyRaw = feedbackMatch ? raw.slice(feedbackMatch[0].length) : raw;

  return { content: restoreImagePlaceholders(bodyRaw.trim(), map), feedback };
}

// 수업 자료 에디터에서 선생님이 드래그로 선택한 일부분만 다른 표현/구성으로 바꿔주는 AI 제안
// (전체 문서를 다시 짜는 reorganizeMaterialContent와 달리, 선택 영역 외에는 절대 손대지 않음)
export async function suggestAlternativeContent(
  selectedText: string,
  fullContent: string,
  userInstruction?: string,
  classId?: string
): Promise<string[]> {
  const trimmedInstruction = userInstruction?.trim();
  const instructionBlock = trimmedInstruction
    ? `\n\n[선생님이 원하는 방향]\n${trimmedInstruction}`
    : '\n\n[선생님이 원하는 방향]\n특별한 지시 없음 — 더 명확하거나 참신한 표현으로 자유롭게 제안';

  const prompt = `당신은 수업 자료 에디터에서 선생님이 선택한 일부 문단만 다른 대안으로 다듬어주는 AI입니다.

[전체 자료 내용 — 문맥 참고용, 이 부분은 절대 다시 쓰지 않음]
${fullContent}

[선생님이 선택한 부분 — 이 부분만 대안을 제안]
${selectedText}
${instructionBlock}

[작성 규칙]
- 선택된 부분은 문서 안의 기존 문단/목록 항목/제목 등 어딘가에 그대로 끼워넣어질 텍스트입니다. 절대 "- ", "1. ", "#", ">" 같은 목록·제목·인용구 기호를 새로 붙이지 마세요 — 순수 인라인 텍스트(필요하면 **굵게**, *기울임* 정도만)로만 작성하세요.
- 전체 자료의 흐름과 문체에 자연스럽게 이어지도록 작성하세요.
- 선택되지 않은 나머지 내용은 절대 언급하거나 다시 쓰지 마세요. 오직 선택된 부분의 대안만 제시하세요.
- 원문에 없는 사실을 지어내지 마세요.
- 서로 확연히 다른 느낌의 대안 2~3개를 제안하세요 (예: 더 간결하게 / 예시를 추가해서 / 다른 관점으로 등).

반드시 아래 JSON 형식으로만 응답하세요:
{"suggestions":["대안1 마크다운","대안2 마크다운","대안3 마크다운"]}`;

  const result = await materialReorganizeAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: any) => String(s).trim()).filter(Boolean) : [];
  if (suggestions.length === 0) throw new Error('AI가 대안을 생성하지 못했습니다.');
  return suggestions;
}

// 수업 자료 PDF 표지 이미지를 위한 AI 프롬프트 문구 제안 (이미지 자체는 생성하지 않음 —
// 교사가 다른 이미지 생성 도구에 복사해 쓸 수 있는 프롬프트 텍스트만 만들어줌)
export async function generateCoverPromptSuggestions(
  title: string,
  subtitle?: string | null,
  classId?: string
): Promise<string[]> {
  const prompt = `당신은 수업 자료(교재) PDF 표지 이미지를 만들 때 쓸 AI 이미지 생성 프롬프트를 제안하는 전문가입니다.
아래 수업 자료 정보를 참고해, 표지에 어울리는 이미지를 만들기 위한 영어 프롬프트 문구를 3개 제안하세요.

[수업 자료 제목]
${title || '(제목 없음)'}
${subtitle ? `[클래스/부제]\n${subtitle}\n` : ''}
[조건]
- 각 프롬프트는 서로 다른 스타일(예: 플랫 일러스트, 사진풍, 미니멀 아이콘 구도 등)로 제안하세요.
- 교육용 자료 표지에 어울리게, 과도하게 화려하거나 산만하지 않은 구도를 제안하세요.
- 텍스트/글자가 이미지 안에 들어가야 한다는 지시는 넣지 마세요 (제목은 별도로 얹힙니다).
- 각 프롬프트는 1~2문장, 영어로 작성하세요 (대부분의 이미지 생성 도구가 영어 프롬프트에 더 정확히 반응합니다).

반드시 아래 JSON 형식으로만 응답하세요:
{"suggestions":["프롬프트1","프롬프트2","프롬프트3"]}`;

  const result = await coverPromptAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: any) => String(s)) : [];
  if (suggestions.length === 0) throw new Error('AI가 제안을 생성하지 못했습니다.');
  return suggestions;
}

// ── 아이디어 기록 → AI 분석 (수업 가이드 초안 + 관련 태그) ──────────────────────

export interface RelatedMaterialRef {
  title: string;
  snippet: string;
}

export interface IdeaAnalysisResult {
  summary: string;
  suggestedFormat: 'guide' | 'material' | 'slide';
  guideOutline: string[];
  relatedTags: string[];
  relatedMaterialsNote: string;
  aiSuggestions: {
    direction: string;
    introActivities: string[];
    practiceIdeas: string[];
  };
}

function buildRelatedMaterialsBlock(relatedMaterials: RelatedMaterialRef[]): string {
  if (relatedMaterials.length === 0) return '\n\n[참고할 기존 수업 자료 없음]';
  return `\n\n[선생님이 이미 만들어둔 관련 수업 자료 (참고용, 최근 순)]\n${relatedMaterials
    .map((m, i) => `${i + 1}. ${m.title}\n${m.snippet}`)
    .join('\n\n')}`;
}

export async function analyzeIdea(
  content: string,
  classId?: string,
  relatedMaterials: RelatedMaterialRef[] = []
): Promise<IdeaAnalysisResult> {
  const relatedBlock = buildRelatedMaterialsBlock(relatedMaterials);

  const prompt = `당신은 선생님이 짧게 적어둔 수업 아이디어 메모를 실제 수업으로 발전시킬 수 있도록 돕는 AI입니다.

[선생님이 기록한 아이디어]
${content}
${relatedBlock}

[할 일]
1. 아이디어의 핵심을 1~2문장으로 요약하세요 (summary).
2. 이 아이디어를 발전시키기에 가장 적합한 형태를 판단하세요 (suggestedFormat): 순서가 있는 절차/활동 설명이면 "guide", 학생에게 나눠줄 읽기 자료·설명 위주 콘텐츠면 "material", 발표·요약 전달이 목적이면 "slide" 중 하나만 선택.
3. 선생님이 이미 적어둔 내용을 교사가 바로 참고할 수 있는 수업 가이드 초안으로 정리하세요 (guideOutline, 3~6개 항목). 이 항목은 선생님이 쓴 내용을 벗어나지 않게 정리·구조화만 하고, 원문에 없는 사실을 지어내지 마세요.
4. 이 아이디어와 관련된 핵심 키워드를 2~5개 뽑으세요 (relatedTags). 향후 비슷한 아이디어나 자료를 찾을 때 쓰일 태그이므로, 과목/주제/활동유형 등 짧은 명사 위주로 작성하세요.
5. 위에 제시된 기존 수업 자료를 참고해, 이 아이디어를 어떻게 기획하면 좋을지 2~4문장으로 제안하세요 (relatedMaterialsNote). 기존 자료와 겹치지 않게 차별화할 부분, 또는 기존 자료를 이어서 발전시킬 방법을 구체적으로 언급하세요. 참고할 기존 자료가 없다면 "참고할 기존 자료가 없어 새로 기획하면 됩니다." 정도로 짧게 답하세요.
6. 여기서부터는 선생님이 쓴 내용을 그대로 정리하지 말고, 당신이 교육 전문가로서 새롭게 제안하세요 (aiSuggestions). 선생님이 언급하지 않았더라도 이 수업 주제에 실제로 도움이 될 만한 아이디어를 적극적으로 제시하는 것이 목적입니다.
   - direction: 이 아이디어를 어떤 방향으로 발전시키면 좋을지, 그리고 왜 그 방향을 추천하는지 근거와 함께 2~3문장으로 제안하세요.
   - introActivities: 이 수업에 쓸 수 있는 구체적인 도입(동기유발) 활동 아이디어를 2~3개 제안하세요. 선생님 원문에 없는 새로운 아이디어여도 좋습니다. 각 항목은 "활동명 — 구체적 진행 방법" 형태로 한 문장씩 작성하세요.
   - practiceIdeas: 이 수업과 연계하거나 심화할 수 있는 실습 활동, 관련 학습 도구/사이트/프로그램을 2~3개 제안하세요. 실제로 존재하거나 교사가 검색해 찾을 수 있는 구체적인 종류의 도구·활동으로 제안하고, 왜 이 수업에 맞는지 짧게 덧붙이세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{"summary":"...","suggestedFormat":"guide","guideOutline":["...","..."],"relatedTags":["...","..."],"relatedMaterialsNote":"...","aiSuggestions":{"direction":"...","introActivities":["...","..."],"practiceIdeas":["...","..."]}}`;

  const result = await ideaAnalysisAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);

  const suggestedFormat: IdeaAnalysisResult['suggestedFormat'] =
    ['guide', 'material', 'slide'].includes(parsed.suggestedFormat) ? parsed.suggestedFormat : 'guide';

  const aiSuggestions = parsed.aiSuggestions || {};

  return {
    summary: String(parsed.summary || '').trim(),
    suggestedFormat,
    guideOutline: Array.isArray(parsed.guideOutline) ? parsed.guideOutline.map((s: any) => String(s)) : [],
    relatedTags: Array.isArray(parsed.relatedTags) ? parsed.relatedTags.map((s: any) => String(s)) : [],
    relatedMaterialsNote: String(parsed.relatedMaterialsNote || '').trim(),
    aiSuggestions: {
      direction: String(aiSuggestions.direction || '').trim(),
      introActivities: Array.isArray(aiSuggestions.introActivities) ? aiSuggestions.introActivities.map((s: any) => String(s)) : [],
      practiceIdeas: Array.isArray(aiSuggestions.practiceIdeas) ? aiSuggestions.practiceIdeas.map((s: any) => String(s)) : [],
    },
  };
}

// 아이디어 + 수업 가이드 초안 + 관련 기존 자료를 바탕으로, 수업 자료 에디터에 바로 넣을 수 있는
// 실제 수업 계획안 마크다운 문서를 생성 (JSON이 아닌 순수 마크다운 본문을 반환)
export async function generateLessonPlanDraft(
  ideaContent: string,
  guideOutline: string[],
  relatedMaterials: RelatedMaterialRef[],
  length: 'simple' | 'detailed',
  classId?: string
): Promise<string> {
  const relatedBlock = relatedMaterials.length > 0
    ? `\n\n[선생님이 이미 만들어둔 관련 수업 자료 — 내용이 겹치지 않도록 참고만 하고, 그대로 베끼지 마세요]\n${relatedMaterials
        .map((m, i) => `${i + 1}. ${m.title}\n${m.snippet}`)
        .join('\n\n')}`
    : '';
  const outlineBlock = guideOutline.length > 0
    ? `\n\n[참고용 수업 진행 순서 초안]\n${guideOutline.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';
  const lengthInstruction = length === 'simple'
    ? '분량은 핵심만 담아 간결하게(전체 500~800자 내외) 작성하세요. 각 섹션은 불릿 위주로 짧게 씁니다.'
    : '분량은 실제 수업에 바로 쓸 수 있을 만큼 충분히 구체적으로(전체 1500자 이상) 작성하세요. 활동마다 소요 시간, 교사 발문 예시, 준비물 등을 함께 제시하세요.';

  const prompt = `당신은 선생님의 수업 아이디어를 실제 사용 가능한 수업 계획안 문서로 작성해주는 AI입니다.

[선생님이 기록한 아이디어]
${ideaContent}
${outlineBlock}${relatedBlock}

[작성 규칙]
- 마크다운 문서로 작성하세요. "## 수업 목표", "## 도입", "## 전개", "## 정리", "## 준비물 및 유의사항" 순서의 소제목 구조를 기본으로 사용하세요 (내용에 맞지 않는 섹션은 생략 가능).
- ${lengthInstruction}
- 원문 아이디어에 없는 사실 정보를 임의로 지어내지 말고, 교육적으로 자연스럽게 살을 붙이는 수준으로 작성하세요.
- 결과에는 수업 계획안 본문만 작성하고, 다른 설명이나 인사말은 넣지 마세요.

${RICH_FORMATTING_GUIDE}`;

  const result = await lessonPlanDraftAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  return result.response.text().trim().replace(/^```(markdown)?\n?/, '').replace(/```$/, '').trim();
}

// ── 수업 계획서 자동생성 (MaterialEditor "계획서 만들기") ──────────────────────
// 수업 자료 내용(들)을 바탕으로 제출용 수업 계획서(LessonPlanSections) 초안을 만든다.
// 위 아이디어 위저드용 generateLessonPlanDraft(마크다운 본문 반환)와는 별개 기능이다.

export interface LessonPlanSections {
  basicInfo: {
    subject: string;
    unitTitle: string;
    target: string;
    periods: string;
    date: string;
    studentCount: number | null;
  };
  objectives: string;
  activities: {
    intro: string;
    development: string;
    closing: string;
  };
  materials: string;
  assessment: string;
  standards?: string;
}

export interface LessonPlanConfig {
  purpose: 'formal' | 'summary' | 'parent';
  materialIds: string[];
  hasEvaluation: boolean;
  evaluationMethod?: string;
  includeStandards: boolean;
}

const PURPOSE_TONE_HINT: Record<LessonPlanConfig['purpose'], string> = {
  formal: '용도: 학교/기관에 정식 제출하는 지도안입니다. 항목마다 상세하고 격식 있는 문어체로 작성하세요.',
  summary: '용도: 내부 보관용 간단 요약입니다. 활동 흐름 위주로 간결하게, 평가계획은 1~2문장으로 작성하세요.',
  parent: '용도: 학부모에게 공유하는 안내문입니다. 전문 교육 용어를 최소화하고 이해하기 쉬운 문장으로 작성하세요.',
};

const LESSON_PLAN_SECTIONS_SCHEMA_HINT = `반드시 아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "basicInfo": {
    "subject": "과목명",
    "unitTitle": "단원/차시 제목",
    "target": "대상 학년 또는 그룹",
    "periods": "예: 3주차 (2차시)",
    "date": "예: 2026년 9월 1주",
    "studentCount": null
  },
  "objectives": "학습목표 (문장 또는 줄바꿈으로 구분된 목록)",
  "activities": {
    "intro": "도입 활동 설명",
    "development": "전개 활동 설명",
    "closing": "정리 활동 설명"
  },
  "materials": "준비물",
  "assessment": "평가계획",
  "standards": "성취기준 연계 내용 (요청되지 않았으면 이 필드 자체를 생략)"
}`;

export async function generateLessonPlanSections(
  materials: Array<{ title: string; content: string; weekNumber: number }>,
  config: LessonPlanConfig,
  classInfo: { subject?: string; className?: string; classId?: string },
): Promise<LessonPlanSections> {
  const materialsText = materials
    .map(m => `[${m.weekNumber}주차: ${m.title}]\n${m.content}`)
    .join('\n\n---\n\n');

  const prompt = `다음 수업 자료를 바탕으로 수업 계획서 초안을 JSON으로 작성합니다.
${PURPOSE_TONE_HINT[config.purpose]}
${config.hasEvaluation ? `평가 방식: ${config.evaluationMethod}` : '평가계획 섹션은 빈 문자열로 둡니다.'}
${config.includeStandards ? '2022 개정 교육과정 성취기준과 연계해 standards 필드를 작성합니다.' : 'standards 필드는 생략합니다.'}
원문에 없는 활동을 임의로 추가하지 않습니다. 아래 스키마를 정확히 따릅니다.

${LESSON_PLAN_SECTIONS_SCHEMA_HINT}

[과목/클래스] ${classInfo.subject ?? ''} ${classInfo.className ?? ''}
[자료 원문 — 마크다운 형식]
${materialsText}`;

  const result = await lessonPlanSectionsAI.generateContent(
    prompt,
    classInfo.classId ? { class_id: classInfo.classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);

  return {
    basicInfo: {
      subject: String(parsed.basicInfo?.subject ?? ''),
      unitTitle: String(parsed.basicInfo?.unitTitle ?? ''),
      target: String(parsed.basicInfo?.target ?? ''),
      periods: String(parsed.basicInfo?.periods ?? ''),
      date: String(parsed.basicInfo?.date ?? ''),
      studentCount: typeof parsed.basicInfo?.studentCount === 'number' ? parsed.basicInfo.studentCount : null,
    },
    objectives: String(parsed.objectives ?? ''),
    activities: {
      intro: String(parsed.activities?.intro ?? ''),
      development: String(parsed.activities?.development ?? ''),
      closing: String(parsed.activities?.closing ?? ''),
    },
    materials: String(parsed.materials ?? ''),
    assessment: config.hasEvaluation ? String(parsed.assessment ?? '') : '',
    standards: config.includeStandards ? String(parsed.standards ?? '') : undefined,
  };
}

// ── 강사 포트폴리오: 통계+대표자료 제목 → 소개글 초안 ──────────────────────────

export async function generatePortfolioIntroDraft(
  stats: { subjects: string[]; classCount: number; totalMaterials: number },
  showcaseTitles: string[],
): Promise<string> {
  const prompt = `아래 정보를 바탕으로 학교 담당자가 읽을 강사 소개글을 3~5문장으로 작성합니다.
과장된 표현 없이 사실 위주로, 신뢰감 있는 톤으로 씁니다. 문구만 출력하고 마크다운이나 설명은 포함하지 마세요.

지도 과목: ${stats.subjects.join(', ') || '미지정'}
운영 클래스 수: ${stats.classCount}개
누적 수업 자료: ${stats.totalMaterials}건
대표 수업 사례 제목: ${showcaseTitles.join(', ') || '없음'}`;

  const result = await portfolioIntroDraftAI.generateContent(prompt);
  return result.response.text().trim();
}

// ── 아이디어 → 질문형 위저드: 단계별 4지선다 질문 → PRD → PRD 기반 초안 ────────

export interface ClarifyingQuestion {
  question: string;
  options: string[]; // 정확히 4개
  exampleAnswers: string[]; // "직접 입력" 시 참고할 샘플 답변 2~3개
}

export interface LessonPRD {
  title: string;
  goal: string;
  structure: { phase: string; description: string }[];
  tone: string;
  keyPoints: string[];
}

type QAPair = { question: string; answer: string };

const WIZARD_FORMAT_LABEL: Record<'material' | 'slide', string> = {
  material: '수업 계획안(수업 자료)',
  slide: '수업 슬라이드',
};

const WIZARD_STAGE_GOAL = [
  '수업 인원 규모를 파악하는 질문 (예: 소수 정예로 개별 밀착 실습이 가능한지, 학급 단위 다수라 공통 지도가 필요한지)',
  '수업 기간을 파악하는 질문 (예: 원데이·단기 체험형인지, 한 학기·연간에 걸친 장기 프로젝트형인지)',
  '학생들의 해당 주제에 대한 이해도·스킬 수준을 파악하는 질문',
  '학생들의 참여 성향을 파악하는 질문 (자발적으로 적극 참여하는 편인지, 수동적이라 흥미 유도가 필요한 편인지)',
  '이 수업에서 선생님이 가장 중요하게 생각하는 것, 원하는 목표나 결과를 파악하는 질문 — 선생님마다 답이 크게 다를 수 있는 주제이니, 질문 문구에서 보기보다 자유롭게 직접 답을 적어도 좋다는 뉘앙스를 자연스럽게 전달하세요',
  '수업 기획에서 가장 도움받고 싶은 영역이 무엇인지 파악하는 질문',
  '결과물의 성격을 파악하는 질문 (개인/모둠 여부, 발표까지 포함되는지 등)',
];

// "가장 도움받고 싶은 영역" 단계는 수업의 4단계 흐름(인트로/학습전달/실습/발표)과 1:1로 대응시켜 보기를 고정한다.
const HELP_AREA_STAGE_INDEX = 5;
const HELP_AREA_OPTIONS = [
  '인트로 활동 아이디어 (팀 체험, AI 도구 활용 등)',
  '학습 내용 전달 방법',
  '실습·프로젝트 아이디어',
  '발표·마무리 방식',
];

function buildQAHistoryBlock(qaHistory: QAPair[]): string {
  if (qaHistory.length === 0) return '';
  return `\n\n[지금까지 선생님이 답변한 내용]\n${qaHistory
    .map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`)
    .join('\n')}`;
}

// 3단계 중 현재 라운드에서 몇 번째 질문인지에 맞춰 4지선다 질문 1개를 생성.
// revisionOf가 있으면 "PRD를 반려당한 뒤 이전 답변은 유지한 채 무엇을 조정할지 좁히는 질문"으로 프레이밍.
export async function generateNextClarifyingQuestion(
  ideaContent: string,
  format: 'material' | 'slide',
  qaHistory: QAPair[],
  classId?: string,
  revisionOf?: LessonPRD
): Promise<ClarifyingQuestion> {
  const roundQaHistory = revisionOf ? [] : qaHistory;
  const stageIndex = Math.min(roundQaHistory.length, WIZARD_STAGE_GOAL.length - 1);
  const qaBlock = buildQAHistoryBlock(qaHistory);
  const revisionBlock = revisionOf
    ? `\n\n[상황] 아래 PRD를 선생님이 마음에 들어 하지 않아 반려했습니다. 위의 이전 답변들은 그대로 유효하다고 보고, 선생님이 이 PRD의 어떤 부분을 다르게 하고 싶은지 좁혀가는 질문을 하세요.\n[반려된 PRD]\n${JSON.stringify(revisionOf)}`
    : '';

  const prompt = `당신은 선생님의 수업 아이디어를 ${WIZARD_FORMAT_LABEL[format]}(으)로 구체화하기 위해, 방향을 좁히는 질문을 하는 AI입니다.

[선생님이 기록한 아이디어]
${ideaContent}
${qaBlock}${revisionBlock}

[할 일]
지금은 총 ${WIZARD_STAGE_GOAL.length}단계 질문 중 ${stageIndex + 1}단계입니다. 이 단계의 목적: ${WIZARD_STAGE_GOAL[stageIndex]}
이 목적에 맞는 질문을 정확히 1개 만들고, 선생님이 고민 없이 고를 수 있도록 서로 뚜렷하게 구분되는 보기를 정확히 4개 제시하세요. 각 보기는 15자 내외로 짧고 구체적으로 작성하세요.
또한 선생님이 보기 대신 이 질문에 자기 말로 직접 답을 적고 싶을 때 참고할 수 있도록, 실제로 적을 법한 자연스러운 답변 예시를 2~3개 만드세요.

반드시 아래 JSON 형식으로만 응답하세요:
{"question":"...","options":["...","...","...","..."],"exampleAnswers":["...","..."]}`;

  const result = await ideaQuestionAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  let options = Array.isArray(parsed.options) ? parsed.options.map((s: any) => String(s)) : [];
  if (stageIndex === HELP_AREA_STAGE_INDEX) {
    options = HELP_AREA_OPTIONS;
  }
  const exampleAnswers = Array.isArray(parsed.exampleAnswers) ? parsed.exampleAnswers.map((s: any) => String(s)).slice(0, 3) : [];
  return {
    question: String(parsed.question || '').trim(),
    options: options.slice(0, 4),
    exampleAnswers,
  };
}

// 3단계 질문·답변을 종합해 PRD(수업 설계 기획서)를 생성
export async function generateLessonPRD(
  ideaContent: string,
  format: 'material' | 'slide',
  qaHistory: QAPair[],
  classId?: string
): Promise<LessonPRD> {
  const qaBlock = buildQAHistoryBlock(qaHistory);

  const prompt = `당신은 선생님의 수업 아이디어와 질문 답변을 바탕으로 ${WIZARD_FORMAT_LABEL[format]} 제작을 위한 PRD(기획서)를 작성하는 AI입니다.

[선생님이 기록한 아이디어]
${ideaContent}
${qaBlock}

[할 일]
위 답변들을 반영해 아래 항목을 작성하세요.
- title: 이 수업/자료의 제목 (15자 내외)
- goal: 수업 목표를 한 문장으로 — "가장 중요하게 생각하는 것/원하는 목표·결과"로 답한 내용을 최우선으로 반영하세요.
- structure: 도입/전개/정리 등 진행 단계별로 phase(단계명)와 description(그 단계에서 할 일, 1~2문장)을 3~5개. 기본 골격은 "인트로 활동 → 학습 내용 전달 → 실습 활동 → 발표/마무리"로 하되, "가장 도움받고 싶은 영역"으로 답한 단계는 다른 단계보다 훨씬 구체적이고 아이디어가 풍부하게 description을 작성하세요. 인원 규모·수업 기간·참여 성향 답변에 맞춰 각 단계의 비중과 성격(체험 중심 vs 학습 중심, 개별 밀착 vs 공통 지도)을 조정하세요.
- tone: 분량·난이도·문체 방향을 한 문장으로 요약 — 이해도·스킬 수준 답변을 반영하세요.
- keyPoints: 이 결과물에 반드시 반영해야 할 핵심 요소 2~4개 — "결과물의 성격" 답변에서 요구하는 산출물이 반드시 포함되도록 하고, 참여 성향이 수동적이라면 재미·참여 유도 요소를 keyPoints에 명시하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{"title":"...","goal":"...","structure":[{"phase":"...","description":"..."}],"tone":"...","keyPoints":["...","..."]}`;

  const result = await ideaPRDAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(raw);
  return {
    title: String(parsed.title || '').trim(),
    goal: String(parsed.goal || '').trim(),
    structure: Array.isArray(parsed.structure)
      ? parsed.structure.map((s: any) => ({ phase: String(s.phase || ''), description: String(s.description || '') }))
      : [],
    tone: String(parsed.tone || '').trim(),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map((s: any) => String(s)) : [],
  };
}

// 승인된 PRD를 바탕으로 실제 문서(수업 계획안 마크다운 또는 슬라이드용 원고)를 생성
export async function generateContentFromPRD(
  ideaContent: string,
  prd: LessonPRD,
  relatedMaterials: RelatedMaterialRef[],
  format: 'material' | 'slide',
  classId?: string
): Promise<string> {
  const relatedBlock = relatedMaterials.length > 0
    ? `\n\n[선생님이 이미 만들어둔 관련 수업 자료 — 내용이 겹치지 않도록 참고만 하고, 그대로 베끼지 마세요]\n${relatedMaterials
        .map((m, i) => `${i + 1}. ${m.title}\n${m.snippet}`)
        .join('\n\n')}`
    : '';
  const formatInstruction = format === 'slide'
    ? '이 문서는 발표용 슬라이드로 옮겨질 원고입니다. 슬라이드 한 장에 들어갈 만한 분량으로 섹션을 짧게 끊어 작성하세요.'
    : '이 문서는 그대로 교사가 수업에 쓸 수업 계획안입니다.';
  const richFormattingBlock = format === 'material' ? `\n\n${RICH_FORMATTING_GUIDE}` : '';

  const prompt = `당신은 아래 PRD(기획서)를 그대로 따라 ${WIZARD_FORMAT_LABEL[format]} 문서를 작성하는 AI입니다.

[선생님이 기록한 원본 아이디어]
${ideaContent}

[승인된 PRD]
- 제목: ${prd.title}
- 목표: ${prd.goal}
- 구성: ${prd.structure.map(s => `${s.phase}(${s.description})`).join(' → ')}
- 톤/분량: ${prd.tone}
- 꼭 반영할 요소: ${prd.keyPoints.join(', ')}
${relatedBlock}

[작성 규칙]
- 마크다운 문서로 작성하세요. PRD의 구성(structure) 단계를 "## " 소제목으로 그대로 사용하세요.
- ${formatInstruction}
- PRD의 톤/분량 지침과 꼭 반영할 요소를 반드시 따르세요.
- 원문 아이디어에 없는 사실 정보를 임의로 지어내지 말고, 교육적으로 자연스럽게 살을 붙이는 수준으로 작성하세요.
- 결과에는 문서 본문만 작성하고, 다른 설명이나 인사말은 넣지 마세요.${richFormattingBlock}`;

  const result = await ideaPRDDraftAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  return result.response.text().trim().replace(/^```(markdown)?\n?/, '').replace(/```$/, '').trim();
}

// ── 슬라이드 만들기 도구: 자료 → AI 초안 생성 ────────────────────────────────
// slidedeck 쪽 SlideLayoutKind와 이름을 맞추되, 이 파일은 해당 타입을 import하지 않고
// 문자열 리터럴로만 다뤄 lib(gemini.ts)이 UI 레이어 타입에 결합되지 않도록 한다.
export type SlideDraftLayoutKind = 'title' | 'textOnly' | 'textImage1' | 'textImagesMany';

export interface SlideLayoutSpec {
  kind: SlideDraftLayoutKind;
  textSlots: { role: string; maxChars: number }[];
  imageSlotCount: number;
  codeSlotCount: number;
}

export interface AiDraftSlide {
  layout: SlideDraftLayoutKind;
  texts: string[];
  images: number[];
  code: number[];
}

// 자료 가져오기 → 템플릿 선택 후, 실제 슬라이드를 생성하기 전에 먼저 보여줄 구성 개요(계획)를 생성.
// 승인되면 이 개요의 "## 소제목" 구조를 generateSlideDeckDraft의 approvedOutline으로 그대로 넘겨
// 실제 생성 단계도 같은 슬라이드 구성을 따르게 한다.
export async function generateSlideOutline(rawContent: string, classId?: string): Promise<string> {
  const sectionOutline = extractSectionOutline(rawContent);
  const sectionBlock = sectionOutline.length > 0
    ? `\n[원문 섹션 구조 — 이 순서를 그대로 슬라이드 구성 순서로 사용하세요]\n${sectionOutline.join('\n')}\n`
    : '';

  const prompt = `이 수업 자료를 발표용 슬라이드로 만들기 전에, 먼저 슬라이드 구성 개요(기획안)를 작성합니다.

[원문]
${rawContent}
${sectionBlock}
[작성 규칙]
- 첫 줄에 "# {슬라이드 전체 제목}"을 적으세요(원문 내용을 대표하는 15자 내외 제목).
- 슬라이드 한 장을 "## {소제목}" 하나로 표현해서, 실제 발표에 쓸 슬라이드 개수만큼 소제목을 나누세요(특별한 요청이 없으면 5~8장 내외가 적당합니다).
- 각 소제목 아래에는 그 슬라이드에 들어갈 핵심 문장이나 짧은 불릿을 2~4개 정도, 원문 내용을 요약해서 적으세요.
- 원문에 없는 내용을 지어내지 마세요.
- 결과에는 개요 본문만 작성하고, 다른 설명이나 인사말은 넣지 마세요.`;

  const result = await slideDeckDraftAI.generateContent(
    prompt,
    classId ? { class_id: classId } : undefined
  );
  return result.response.text().trim().replace(/^```(markdown)?\n?/, '').replace(/```$/, '').trim();
}

// 선택한 템플릿의 레이아웃 스펙에 맞춰 원문을 슬라이드 초안(JSON)으로 재구성.
// approvedOutline이 있으면(=teacher가 계획 화면에서 승인한 개요) 그 "## 소제목" 구성을 그대로 슬라이드
// 순서/개수로 사용하고, 실제 문장 내용은 원문(rawContent)에서 가져와 채운다.
export async function generateSlideDeckDraft(
  rawContent: string,
  layoutSpecs: SlideLayoutSpec[],
  classId?: string,
  approvedOutline?: string
): Promise<{ slides: AiDraftSlide[]; imageUrls: string[]; codeBlocks: { lang: string; code: string }[] }> {
  const { replaced: withoutImages } = extractImagePlaceholders(rawContent);
  const { replaced, blocks: codeBlocks } = extractCodePlaceholders(withoutImages);
  const imageUrls = extractImageUrls(rawContent);
  const approvedHeadings = approvedOutline
    ? approvedOutline.split('\n').filter(l => l.trim().startsWith('## ')).map(l => l.replace(/^##\s*/, '').trim())
    : [];
  const sectionOutline = approvedHeadings.length > 0 ? approvedHeadings : extractSectionOutline(rawContent);

  const layoutDescriptions = layoutSpecs.map(spec => {
    const textsDesc = spec.textSlots.length
      ? spec.textSlots.map((s, i) => `texts[${i}]=${s.role}(최대 ${s.maxChars}자)`).join(', ')
      : '텍스트 슬롯 없음';
    return `- "${spec.kind}": ${textsDesc} · 이미지 ${spec.imageSlotCount}개${spec.codeSlotCount ? ` · 코드 ${spec.codeSlotCount}개` : ''}`;
  }).join('\n');

  const sectionBlock = sectionOutline.length > 0
    ? `\n[원문 섹션 구조]\n${sectionOutline.join('\n')}\n`
    : '';

  const prompt = `이 수업 자료를 16:9 슬라이드 초안으로 재구성합니다. 아래 4가지 레이아웃 중 각 슬라이드에 맞는 것을 골라 배치하세요.

[사용 가능한 레이아웃]
${layoutDescriptions}
${sectionBlock}
[규칙]
- 반드시 첫 슬라이드는 "title" 레이아웃이어야 합니다 (수업 주제를 한 줄로).
- 각 슬라이드는 화면 하나에 스크롤 없이 다 들어가야 하므로, 레이아웃이 지정한 texts 개수와 글자 수 제한을 반드시 지키세요.
- 한 슬라이드에 모든 내용을 몰아넣지 말고, 내용이 많으면 여러 슬라이드로 나누세요.
${sectionOutline.length > 0 ? '- [원문 섹션 구조]에 나온 소제목 순서를 그대로 슬라이드 순서로 사용하고, 각 섹션마다 최소 1장의 슬라이드를 배정하세요. 섹션 내용이 많으면 그 섹션만 여러 장으로 나눠도 됩니다.\n' : ''}- 레이아웃에 texts 슬롯이 2개 이상이면 각 슬롯의 역할(role)에 맞는 서로 다른 내용을 담으세요. 두 번째 이후 슬롯(설명·부제목 등)을 첫 번째 슬롯(제목·핵심 문장)의 반복이나 빈 문장으로 채우지 말고, 해당 섹션 원문에서 가져온 구체적인 세부 내용·근거·예시로 채우세요.
- 모든 슬라이드의 texts 배열은 레이아웃이 요구하는 개수만큼 실제 내용으로 채워야 합니다. 빈 문자열("")이나 생략은 허용되지 않습니다 — 채울 내용이 마땅치 않다면 그 슬라이드 자체를 만들지 마세요.
- 원문에 없는 정보를 임의로 추가하거나 빼지 마세요.
- 원문에 {{IMG:n}} 표시가 있으면 관련 내용이 있는 슬라이드에서 이미지 슬롯이 있는 레이아웃을 골라 "images" 배열에 해당 번호(n)를 넣으세요. 이미지가 없는 슬라이드의 "images"는 빈 배열로 두세요. 같은 이미지 번호를 두 번 이상 쓰지 마세요.
- 원문에 {{CODE:n}} 표시가 있으면 코드 슬롯이 있는 레이아웃("textOnly"/"textImage1"/"textImagesMany" 중 codeSlotCount>0인 것)을 골라 "code" 배열에 번호를 넣으세요. 원문에 코드가 없으면 "code"는 항상 빈 배열로 두세요 (코드를 지어내지 마세요).
- 이미지/코드 슬롯 개수보다 배열 길이가 많으면 안 됩니다.

반드시 아래 JSON 배열 형식으로만 응답하세요 (설명 문구 없이 JSON만):
[{"layout":"title","texts":["...","..."],"images":[],"code":[]}, ...]

[원문]
${replaced}`;

  const MAX_ATTEMPTS = 3;
  let slides: AiDraftSlide[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await slideDeckDraftAI.generateContent(
      prompt,
      classId ? { class_id: classId } : undefined
    );
    const raw = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    slides = JSON.parse(raw) as AiDraftSlide[];
    if (draftSlidesAreComplete(slides, layoutSpecs)) break;
  }

  return { slides, imageUrls, codeBlocks };
}

// 레이아웃이 요구하는 texts 슬롯이 모두 실제 내용으로 채워졌는지 검사 (빈 슬롯 재시도 판단용)
function draftSlidesAreComplete(slides: AiDraftSlide[], layoutSpecs: SlideLayoutSpec[]): boolean {
  return slides.every(slide => {
    const spec = layoutSpecs.find(s => s.kind === slide.layout);
    if (!spec) return false;
    if (slide.texts.length < spec.textSlots.length) return false;
    return slide.texts.slice(0, spec.textSlots.length).every(t => t.trim().length > 0);
  });
}
