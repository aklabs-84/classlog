import type { QuestionType } from './SurveyTool';

export interface SurveyTemplateQuestion {
  type: QuestionType;
  text: string;
  options?: { label: string }[];
}

export interface SurveyTemplate {
  id: string;
  title: string;
  when: string;
  description: string;
  questions: SurveyTemplateQuestion[];
}

const opts = (...labels: string[]) => labels.map(label => ({ label }));
// 의견 척도는 [낮은 쪽 말, 높은 쪽 말, 최대 점수] 순서로 저장된다 (QuestionEditor 규칙)
const scale = (low: string, high: string, max: 5 | 10 = 5) => opts(low, high, String(max));

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    id: 'lesson-satisfaction',
    title: '수업 만족도',
    when: '매 수업이 끝난 직후',
    description: '오늘 수업이 어땠는지 묻고 다음 수업을 조정해요 (9문항)',
    questions: [
      { type: 'star_rating', text: '오늘 수업은 전체적으로 어땠나요?' },
      { type: 'opinion_scale', text: '오늘 수업 내용을 이해했나요?', options: scale('전혀 이해 못 했다', '완전히 이해했다') },
      { type: 'multiple_choice', text: '수업 속도는 어땠나요?', options: opts('너무 느렸어요', '알맞았어요', '조금 빨랐어요', '너무 빨랐어요') },
      { type: 'opinion_scale', text: '오늘 수업이 재미있었나요?', options: scale('전혀 재미없었다', '아주 재미있었다') },
      { type: 'ranking', text: '오늘 활동 중 가장 좋았던 것을 순서대로 놓아 보세요', options: opts('선생님 설명', '직접 만들기·실습', '친구와 함께하기', '발표·나누기') },
      { type: 'yes_no', text: '수업 중 도움이 필요했을 때 질문하기 편했나요?' },
      { type: 'short_text', text: '오늘 새로 알게 된 것을 한 줄로 써 주세요' },
      { type: 'short_text', text: '아직 헷갈리거나 어려운 점이 있나요?' },
      { type: 'short_text', text: '선생님에게 하고 싶은 말이 있다면 자유롭게 써 주세요' },
    ],
  },
  {
    id: 'project-reflection',
    title: '프로젝트 끝난 뒤 소감',
    when: '프로젝트가 끝났을 때',
    description: '몇 주 동안 해 온 전체를 돌아봐요 (10문항)',
    questions: [
      { type: 'star_rating', text: '이 프로젝트 전체는 어땠나요?' },
      { type: 'opinion_scale', text: '프로젝트를 시작할 때보다 실력이 늘었다고 느끼나요?', options: scale('전혀 안 늘었다', '많이 늘었다') },
      { type: 'opinion_scale', text: '내가 만든 결과물에 만족하나요?', options: scale('전혀 만족하지 않는다', '매우 만족한다') },
      { type: 'star_rating', text: '친구들과 함께한 활동은 어땠나요?' },
      { type: 'ranking', text: '프로젝트에서 가장 좋았던 것을 순서대로 놓아 보세요', options: opts('결과물 만들기', '친구와 협력', '새로운 도구 써 보기', '발표·공유') },
      { type: 'yes_no', text: '중간에 포기하고 싶었던 적이 있나요?' },
      { type: 'short_text', text: '이 프로젝트에서 가장 기억에 남는 순간은?' },
      { type: 'short_text', text: '가장 어려웠던 점은 무엇이었나요?' },
      { type: 'multiple_choice', text: '다음에 비슷한 프로젝트를 한다면 하고 싶나요?', options: opts('꼭 하고 싶어요', '하고 싶어요', '잘 모르겠어요', '별로 하고 싶지 않아요') },
      { type: 'short_text', text: '다음 프로젝트에서 바뀌었으면 하는 점을 써 주세요' },
    ],
  },
  {
    id: 'pre-survey',
    title: '시작 전 사전 조사',
    when: '프로젝트나 학기를 시작하기 전',
    description: '학생의 출발선과 기대를 알아 수업 수준을 맞춰요 (8문항)',
    questions: [
      // 1번은 '프로젝트 소감 2번(실력이 늘었는지)'과 같은 5점 척도라 전후 비교에 쓸 수 있다
      { type: 'opinion_scale', text: '이 주제에 대해 얼마나 알고 있나요?', options: scale('전혀 모른다', '잘 안다') },
      { type: 'yes_no', text: '비슷한 수업이나 활동을 해 본 적이 있나요?' },
      { type: 'opinion_scale', text: '컴퓨터나 태블릿을 쓰는 게 얼마나 편한가요?', options: scale('많이 어렵다', '아주 편하다') },
      { type: 'ranking', text: '어떤 방식의 수업이 가장 좋은가요? 순서대로 놓아 보세요', options: opts('선생님 설명 듣기', '직접 만들어 보기', '친구와 함께하기', '게임·퀴즈') },
      { type: 'multiple_choice', text: '이번 수업에서 가장 기대되는 것은 무엇인가요?', options: opts('새로운 것 배우기', '직접 만들어 보기', '친구들과 함께하기', '잘 모르겠어요') },
      { type: 'star_rating', text: '이 수업이 얼마나 기대되나요?' },
      { type: 'short_text', text: '걱정되거나 어려울 것 같은 점이 있나요?' },
      { type: 'short_text', text: '선생님이 꼭 알았으면 하는 것이 있나요?' },
    ],
  },
];
