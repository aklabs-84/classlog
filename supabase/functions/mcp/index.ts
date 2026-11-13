// ClassLog AI — MCP 접수 창구 (읽기 + 권한에 따른 쓰기: 반·주차·공지·자료·폴더, 지우기 없음)
// ChatGPT/Claude 등 AI가 "AI 연결 키"로 선생님의 수업 자료·슬라이드·수업 계획서를 읽고 정리하는 입구.
// 흐름: Bearer 키 → sha256 지문 → mcp_auth(주인·속도 확인) → mcp_* 조회 기능 → mcp_log(기록)
// 배포: supabase functions deploy --no-verify-jwt mcp
// 외부 라이브러리 없이 MCP(Streamable HTTP)의 JSON-RPC를 직접 처리한다(상태 없음, POST만).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SERVER = { name: 'classlog-ai', version: '1.0.0' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};
const uuid = (v: unknown, required = false) => {
  if (v == null || v === '') {
    if (required) throw new Error('id가 필요합니다.');
    return null;
  }
  if (typeof v !== 'string' || !UUID.test(v)) throw new Error('id 형식이 올바르지 않습니다.');
  return v;
};

const str = (v: unknown, max: number, required = false) => {
  if (v == null || v === '') {
    if (required) throw new Error('필수 값이 비어 있습니다.');
    return null;
  }
  if (typeof v !== 'string') throw new Error('글자 형식이 올바르지 않습니다.');
  if (v.length > max) throw new Error(`글이 너무 깁니다. (최대 ${max}자)`);
  return v;
};
const date = (v: unknown) => {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  return v;
};

// 슬라이드: 정해진 기본 모양(밝은 바탕, 글자만)으로 서버가 직접 만든다. AI는 좌표를 만지지 않는다.
const buildSlides = (raw: unknown) => {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('slides는 1장 이상의 목록이어야 합니다.');
  if (raw.length > 30) throw new Error('슬라이드는 한 번에 30장까지입니다.');
  const FONT = "'Pretendard', 'Noto Sans KR', sans-serif";
  return raw.map((r) => {
    const s = (r ?? {}) as Record<string, unknown>;
    const sid = crypto.randomUUID();
    const title = str(s.title, 100, true)!;
    const objs: Record<string, unknown>[] = [];
    if (s.layout === 'cover') {
      const sub = str(s.subtitle ?? s.body, 200);
      objs.push({ id: `${sid}-bar`, type: 'text', x: 600, y: 200, width: 80, height: 6, zIndex: 1, text: '', decorative: true, style: { background: '#4F46E5' } });
      objs.push({ id: `${sid}-title`, type: 'text', x: 140, y: 230, width: 1000, height: 200, zIndex: 2, text: title, style: { fontSize: 64, align: 'center', bold: true, fontFamily: FONT } });
      if (sub) objs.push({ id: `${sid}-sub`, type: 'text', x: 140, y: 450, width: 1000, height: 80, zIndex: 3, text: sub, style: { fontSize: 26, align: 'center', color: '#6B7280', fontFamily: FONT } });
    } else {
      let body = str(s.body, 1500) ?? '';
      if (Array.isArray(s.bullets)) {
        if (s.bullets.length > 10) throw new Error('bullets는 슬라이드당 10개까지입니다.');
        body = s.bullets.map((b) => '• ' + str(b, 200, true)).join('\n');
      }
      objs.push({ id: `${sid}-bar`, type: 'text', x: 80, y: 60, width: 8, height: 64, zIndex: 1, text: '', decorative: true, style: { background: '#4F46E5' } });
      objs.push({ id: `${sid}-title`, type: 'text', x: 110, y: 56, width: 1090, height: 76, zIndex: 2, text: title, style: { fontSize: 40, align: 'left', bold: true, fontFamily: FONT } });
      if (body) objs.push({ id: `${sid}-body`, type: 'text', x: 110, y: 170, width: 1090, height: 480, zIndex: 3, text: body, style: { fontSize: 28, align: 'left', lineHeight: 1.6, fontFamily: FONT } });
    }
    return { id: sid, bg: '#ffffff', textColor: '#1f2937', objects: objs };
  });
};

// 이 연결로 할 수 없는 일 + 사용자에게 안내할 말 (AI가 읽고 선생님께 그대로 전달)
const CANNOT_DO = {
  rule: '아래 일은 이 연결(MCP)로 할 수 없습니다. 시도하지 말고, 사용자에게 "클래스로그AI에서 직접 해 주세요"라고 안내하세요.',
  where: '클래스로그AI(https://classlog-ai.vercel.app)에 로그인해서 진행',
  privacy: ['학생 이름·PIN·연락처 보기/입력/수정 (학생은 번호로만 보입니다)', '학생 제출물·관찰 기록·평가·출결', '학부모 공유·동의·학생 사진 공개 설정'],
  security: ['AI 연결 키 만들기·폐기·권한 변경', '로그인·비밀번호·계정 설정', '입장 방식 변경, 학생 실명 입력·명단 수정·삭제 (학생 칸을 별칭으로 추가하는 add_students만 가능)', '학교 프로젝트의 공유 링크·입장 코드 보기/켜기, 다른 선생님 초대·권한', '학교 프로젝트에 학교·반 추가/수정 (프로젝트 틀 만들기 create_school_project만 가능)'],
  money_admin: ['결제·요금제·AI 크레딧', '관리자 기능'],
  delete: ['반·자료·폴더·공지·학생·슬라이드 등 모든 삭제'],
  also_manual: ['자료·도구를 학생에게 공개하는 최종 결정(자료 공개 여부), 모둠 구성'],
};

// DB 오류 -> 선생님이 이해할 말
const FRIENDLY: Array<[string, string]> = [
  ['CLASS_LIMIT_EXCEEDED', '반 개수 한도에 도달했습니다. 클래스로그AI에서 요금제를 확인하거나 끝난 반을 정리해 주세요.'],
  ['protected_class', '이 반(체험·학교 프로젝트·하위 반)은 연결로 바꿀 수 없습니다. 클래스로그AI에서 직접 하세요.'],
  ['material_not_found', '연결할 자료를 찾을 수 없습니다. list_materials로 자료 id를 확인하세요.'],
  ['week_not_found', '그 주차가 없습니다. add_week로 먼저 추가하세요.'],
  ['tool_not_found', '그 도구가 이 반에 연결돼 있지 않습니다. list_class_tools로 확인하세요. 새 도구 연결은 클래스로그AI에서 직접 하세요.'],
  ['too_many_weeks', '주차는 최대 60개까지입니다.'],
  ['name_required', '이름이 필요합니다.'],
  ['title_required', '제목이 필요합니다.'],
  ['topic_required', '주제가 필요합니다.'],
  ['invalid_style', '화면 스타일은 default, mission, storybook, challenge, note, manual, workshop 중 하나여야 합니다.'],
  ['invalid_url','링크는 http:// 또는 https:// 로 시작해야 합니다.'],
  ['too_many_projects', '학교 프로젝트는 최대 30개까지 만들 수 있습니다. 클래스로그AI에서 정리해 주세요.'],
  ['invalid_dates', '종료일이 시작일보다 빠릅니다.'],
  ['content_too_long', '본문이 너무 깁니다.'],
  ['plan_limit_survey', '무료 플랜은 설문을 5개까지 만들 수 있습니다. 클래스로그AI에서 요금제를 확인하거나 안 쓰는 설문을 정리해 주세요.'],
  ['daily_limit', '하루에 만들 수 있는 개수(20개)에 도달했습니다. 내일 다시 시도하거나 클래스로그AI에서 직접 만들어 주세요.'],
  ['questions_required', '질문(문제) 목록이 필요합니다.'],
  ['too_many_questions', '질문은 설문 20개, 퀴즈 30개까지입니다. 나눠서 만들어 주세요.'],
  ['question_text_required', '질문(문제) 글이 비어 있습니다.'],
  ['question_too_long', '질문 글이 너무 깁니다. (최대 300자)'],
  ['invalid_question_type', '질문 종류가 올바르지 않습니다. 설문: multiple_choice, yes_no, star_rating, short_text, opinion_scale, ranking / 퀴즈: multiple_choice, short_answer'],
  ['options_required', '선택형·순위 질문에는 options(글자 목록)가 필요합니다.'],
  ['options_count', '선택형·순위 질문의 선택지는 2~6개여야 합니다.'],
  ['quiz_options_count', '4지선다 문제는 비어 있지 않은 선택지가 정확히 4개여야 합니다.'],
  ['invalid_correct', '4지선다의 correct(정답 번호)는 1~4 중 하나여야 합니다.'],
  ['short_answers_required', '단답형 문제에는 correct_answers(정답 글자 목록, 1~10개)가 필요합니다.'],
  ['slides_required', '슬라이드 목록(slides)이 필요합니다.'],
  ['too_many_slides', '슬라이드는 30장까지입니다. 나눠서 만들어 주세요.'],
  ['invalid_slides', '슬라이드 형식이 올바르지 않습니다.'],
  ['too_many_edits', '한 번에 고칠 수 있는 글상자는 20개까지입니다.'],
  ['edit_invalid', 'edits는 [{object_id, text}] 형식이어야 합니다.'],
  ['object_not_found', '고칠 글상자를 찾을 수 없습니다(장식 도형·그림은 고칠 수 없음). get_slide_deck으로 object id를 다시 확인하세요.'],
  ['invalid_purpose', 'purpose는 formal(정식), summary(요약), parent(학부모용) 중 하나여야 합니다.'],
  ['invalid_sections', '수업계획서 내용 형식이 올바르지 않습니다. basicInfo(기본 정보)가 필요합니다.'],
  ['nothing_to_update', '바꿀 내용이 없습니다.'],
  ['aliases_required', '별칭 목록(aliases)이 필요합니다.'],
  ['too_many_aliases', '한 번에 30명까지 추가할 수 있습니다.'],
  ['alias_empty', '비어 있는 별칭이 있습니다.'],
  ['alias_too_long', '별칭은 20자 이내여야 합니다.'],
  ['STUDENT_LIMIT_EXCEEDED', '한 반에 등록할 수 있는 학생 수(40명)를 넘었습니다. 반을 나누어 주세요.'],
  ['pin_failed', '입장 번호를 만들지 못했습니다. 잠시 뒤 다시 시도하세요.'],
  // 가장 넓은 것은 맨 끝에 (위의 *_not_found가 먼저 걸리도록)
  ['not_found', '찾을 수 없거나 선생님의 것이 아닙니다. id를 다시 확인하세요.'],
];

// 도구 정의: 설명(AI가 읽음) + 입력 + 실행할 DB 기능
type Tool = {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
  // 필요한 권한: 없으면 읽기. 'create'=새로 만들기, 'edit'=이미 있는 것 바꾸기. (지우기 도구는 만들지 않는다)
  level?: 'create' | 'edit';
  run: (hash: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

// 열쇠 권한 단계(scope) -> 쓸 수 있는 쓰기 수준
const CAN: Record<string, Array<'create' | 'edit'>> = {
  read: [],
  write_create: ['create'],
  write_edit: ['create', 'edit'],
};
const allowed = (scope: string, level?: 'create' | 'edit') => !level || (CAN[scope] ?? []).includes(level);

const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args);

const TOOLS: Tool[] = [
  {
    name: 'list_classes',
    description: '선생님이 가르치는 반 목록을 보여 줍니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 50)' } },
    run: (h, a) => rpc('mcp_list_classes', { p_hash: h, p_limit: int(a.limit, 50, 1, 100) }),
  },
  {
    name: 'list_folders',
    description: '수업 자료 폴더 목록을 보여 줍니다.',
    properties: {},
    run: (h) => rpc('mcp_list_folders', { p_hash: h }),
  },
  {
    name: 'list_materials',
    description: '수업 자료 목록(제목·주차·글자 수)을 보여 줍니다. 본문은 get_material로 읽습니다.',
    properties: {
      folder_id: { type: 'string', description: '폴더 id (선택)' },
      class_id: { type: 'string', description: '반 id (선택)' },
      limit: { type: 'integer', description: '최대 개수 (기본 30, 최대 100)' },
      offset: { type: 'integer', description: '건너뛸 개수 (기본 0)' },
    },
    run: (h, a) => rpc('mcp_list_materials', {
      p_hash: h, p_folder: uuid(a.folder_id), p_class: uuid(a.class_id),
      p_limit: int(a.limit, 30, 1, 100), p_offset: int(a.offset, 0, 0, 100000),
    }),
  },
  {
    name: 'get_material',
    description: '수업 자료 한 건의 본문을 읽습니다. 길면 나눠서 줍니다(has_more가 true면 offset을 늘려 이어서 읽기).',
    properties: {
      id: { type: 'string', description: '자료 id' },
      offset: { type: 'integer', description: '읽기 시작 글자 위치 (기본 0)' },
      max_chars: { type: 'integer', description: '한 번에 읽을 글자 수 (기본 30000, 최대 60000)' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_material', {
      p_hash: h, p_id: uuid(a.id, true), p_offset: int(a.offset, 0, 0, 100000000), p_max: int(a.max_chars, 30000, 1000, 60000),
    }),
  },
  {
    name: 'list_slide_decks',
    description: '슬라이드 묶음 목록(제목·장 수)을 보여 줍니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 30)' } },
    run: (h, a) => rpc('mcp_list_slide_decks', { p_hash: h, p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'get_slide_deck',
    description: '슬라이드 묶음 내용을 읽습니다. 한 번에 최대 10장씩 주며, 큰 이미지는 "[이미지 생략]"으로 바뀝니다.',
    properties: {
      id: { type: 'string', description: '슬라이드 묶음 id' },
      from: { type: 'integer', description: '시작 장 번호 (0부터, 기본 0)' },
      count: { type: 'integer', description: '장 수 (기본 3, 최대 10)' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_slide_deck', {
      p_hash: h, p_id: uuid(a.id, true), p_from: int(a.from, 0, 0, 10000), p_count: int(a.count, 3, 1, 10),
    }),
  },
  {
    name: 'list_lesson_plans',
    description: '수업 계획서 목록을 보여 줍니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 30)' } },
    run: (h, a) => rpc('mcp_list_lesson_plans', { p_hash: h, p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'get_lesson_plan',
    description: '수업 계획서 한 건의 전체 내용을 읽습니다.',
    properties: { id: { type: 'string', description: '수업 계획서 id' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_lesson_plan', { p_hash: h, p_id: uuid(a.id, true) }),
  },
  {
    name: 'what_i_cannot_do',
    description: '이 연결로 할 수 없는 일(개인정보·보안·결제·지우기 등)과, 그때 사용자에게 어떻게 안내할지 알려 줍니다. 요청이 연결로 가능한지 헷갈릴 때 먼저 부르세요.',
    properties: {},
    run: async () => ({ data: CANNOT_DO, error: null }),
  },
  {
    name: 'list_class_tools',
    description: '반에 연결된 수업도구 목록과 학생 공개 여부를 보여 줍니다.',
    properties: { class_id: { type: 'string', description: '반 id' } },
    required: ['class_id'],
    run: (h, a) => rpc('mcp_list_class_tools', { p_hash: h, p_class: uuid(a.class_id, true) }),
  },

  // ---------- 읽기 확장 (2묶음): 학생 이름·응답자·파일 주소 없이 ----------
  {
    name: 'list_idea_notes',
    description: '아이디어 기록 목록(제목·상태·태그)을 보여 줍니다. 본문은 get_idea_note로 읽습니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 30)' }, offset: { type: 'integer', description: '건너뛸 개수' } },
    run: (h, a) => rpc('mcp_list_idea_notes', { p_hash: h, p_limit: int(a.limit, 30, 1, 100), p_offset: int(a.offset, 0, 0, 100000) }),
  },
  {
    name: 'get_idea_note',
    description: '아이디어 기록 한 건(본문·AI 요약·참고 링크)을 읽습니다. 길면 나눠서 줍니다.',
    properties: { id: { type: 'string', description: '아이디어 기록 id' }, offset: { type: 'integer' }, max_chars: { type: 'integer', description: '기본 30000' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_idea_note', { p_hash: h, p_id: uuid(a.id, true), p_offset: int(a.offset, 0, 0, 100000000), p_max: int(a.max_chars, 30000, 1000, 60000) }),
  },
  {
    name: 'list_lesson_memos',
    description: '반별 수업 메모(수업 활동 기록)를 보여 줍니다. class_id를 주면 그 반만.',
    properties: { class_id: { type: 'string', description: '반 id (선택)' }, limit: { type: 'integer' } },
    run: (h, a) => rpc('mcp_list_lesson_memos', { p_hash: h, p_class: uuid(a.class_id), p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'list_surveys',
    description: '설문 목록(제목·상태·질문 수·응답 수)을 보여 줍니다.',
    properties: { limit: { type: 'integer' } },
    run: (h, a) => rpc('mcp_list_surveys', { p_hash: h, p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'get_survey',
    description: '설문의 질문과 문항별 통계를 보여 줍니다. 응답자 이름·개별 응답은 제공하지 않습니다(주관식은 응답 개수만). 자세한 응답은 클래스로그AI에서 직접 보세요.',
    properties: { id: { type: 'string', description: '설문 id' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_survey', { p_hash: h, p_id: uuid(a.id, true) }),
  },
  {
    name: 'list_quizzes',
    description: '퀴즈 세트 목록(제목·문제 수·진행 횟수)을 보여 줍니다.',
    properties: { limit: { type: 'integer' } },
    run: (h, a) => rpc('mcp_list_quizzes', { p_hash: h, p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'get_quiz',
    description: '퀴즈의 문제·정답·해설과 문제별 전체 정답률을 보여 줍니다. 학생 이름·학생별 점수는 제공하지 않습니다.',
    properties: { id: { type: 'string', description: '퀴즈 세트 id' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_quiz', { p_hash: h, p_id: uuid(a.id, true) }),
  },
  {
    name: 'get_portfolio',
    description: '선생님의 포트폴리오(소개·이력·공개 범위)를 읽습니다.',
    properties: {},
    run: (h) => rpc('mcp_get_portfolio', { p_hash: h }),
  },
  {
    name: 'list_gallery',
    description: '반의 갤러리 항목 목록(주차·종류·캡션)을 보여 줍니다. 사진·파일 자체와 올린 사람 이름은 제공하지 않습니다.',
    properties: { class_id: { type: 'string', description: '반 id' }, limit: { type: 'integer' }, offset: { type: 'integer' } },
    required: ['class_id'],
    run: (h, a) => rpc('mcp_list_gallery', { p_hash: h, p_class: uuid(a.class_id, true), p_limit: int(a.limit, 50, 1, 100), p_offset: int(a.offset, 0, 0, 100000) }),
  },
  {
    name: 'list_school_projects',
    description: '참여 중인 학교 프로젝트 목록(이름·기간·참여 반 수)을 보여 줍니다. kind가 project면 사업, school이면 그 아래 학교입니다. 공유 링크·입장 코드는 보이지 않습니다.',
    properties: {},
    run: (h) => rpc('mcp_list_school_projects', { p_hash: h }),
  },
  {
    name: 'get_school_project',
    description: '학교 프로젝트 한 건의 구조(학교 → 반, 반별 학생 수)와 이 프로젝트에 연결된 내 설문 목록(응답 수)을 보여 줍니다. 설문 결과 통계는 설문 id로 get_survey를 부르세요. 공유 링크·입장 코드·학생 이름은 보이지 않으니, 필요하면 "클래스로그AI에서 직접 확인·복사하세요"라고 안내하세요.',
    properties: { id: { type: 'string', description: '학교 프로젝트 id (list_school_projects에서 확인)' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_school_project', { p_hash: h, p_id: uuid(a.id, true) }),
  },

  // ---------- 쓰기 도구: 반·주차·공지·자료·폴더 (학생 정보 없음, 지우기 없음) ----------
  {
    name: 'create_school_project',
    description: '학교 프로젝트(사업) 틀을 새로 만듭니다. 이름만 정하며, 앱에서 만든 것처럼 "사업 전체" 반도 함께 만들어집니다. 학교·반 추가, 다른 선생님 초대, 공유 링크, 입장 코드, 배너 색, AI 사용량 배정은 클래스로그AI에서 직접 하도록 안내하세요.',
    level: 'create',
    properties: { name: { type: 'string', description: '프로젝트 이름 (예: 바이브코딩 수업)' } },
    required: ['name'],
    run: (h, a) => rpc('mcp_create_school_project', { p_hash: h, p_name: str(a.name, 60, true) }),
  },
  {
    name: 'create_class',
    description: '새 반을 만듭니다. 입장 코드는 자동으로 만들어집니다. 반 개수 제한(요금제별)은 그대로 적용됩니다. 학생 추가·입장 방식은 클래스로그AI에서 직접 하세요.',
    level: 'create',
    properties: {
      name: { type: 'string', description: '반 이름 (예: 3학년 2반 정보)' },
      subject: { type: 'string', description: '과목 (담임 반이면 비워 두세요)' },
      class_type: { type: 'string', enum: ['subject', 'homeroom'], description: 'subject=교과(기본), homeroom=담임' },
      start_date: { type: 'string', description: '시작일 YYYY-MM-DD (선택)' },
      end_date: { type: 'string', description: '종료일 YYYY-MM-DD (선택)' },
    },
    required: ['name'],
    run: (h, a) => rpc('mcp_create_class', {
      p_hash: h, p_name: str(a.name, 60, true), p_subject: str(a.subject, 40),
      p_class_type: a.class_type === 'homeroom' ? 'homeroom' : 'subject',
      p_start: date(a.start_date), p_end: date(a.end_date),
    }),
  },
  {
    name: 'update_class',
    description: '반 이름·과목을 고치거나, 반을 종료/다시 열기 합니다(지우기는 아닙니다). 학교 프로젝트·체험 반은 바꿀 수 없습니다.',
    level: 'edit',
    properties: {
      id: { type: 'string', description: '반 id' },
      name: { type: 'string', description: '새 이름 (선택)' },
      subject: { type: 'string', description: '새 과목 (선택)' },
      closed: { type: 'boolean', description: 'true=종료, false=다시 열기 (선택)' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_update_class', {
      p_hash: h, p_id: uuid(a.id, true), p_name: str(a.name, 60), p_subject: str(a.subject, 40),
      p_closed: typeof a.closed === 'boolean' ? a.closed : null,
    }),
  },
  {
    name: 'add_week',
    description: '반의 수업 계획 맨 끝에 한 주차(차시)를 추가합니다. 자료(material_id)를 함께 연결할 수 있습니다(복사 없이 가리킴).',
    level: 'create',
    properties: {
      class_id: { type: 'string', description: '반 id' },
      topic: { type: 'string', description: '이번 주차 주제' },
      url: { type: 'string', description: '관련 링크 http(s):// (선택)' },
      material_id: { type: 'string', description: '연결할 자료 id (선택, list_materials의 자료)' },
    },
    required: ['class_id', 'topic'],
    run: (h, a) => rpc('mcp_add_week', {
      p_hash: h, p_class: uuid(a.class_id, true), p_topic: str(a.topic, 200, true),
      p_url: str(a.url, 500) ?? '', p_material: uuid(a.material_id),
    }),
  },
  {
    name: 'link_material_to_week',
    description: '이미 있는 주차에 자료를 연결합니다(이전 연결은 바뀝니다).',
    level: 'edit',
    properties: {
      class_id: { type: 'string', description: '반 id' },
      week: { type: 'integer', description: '주차 번호' },
      material_id: { type: 'string', description: '자료 id' },
    },
    required: ['class_id', 'week', 'material_id'],
    run: (h, a) => rpc('mcp_link_material_to_week', {
      p_hash: h, p_class: uuid(a.class_id, true), p_week: int(a.week, 1, 1, 200), p_material: uuid(a.material_id, true),
    }),
  },
  {
    name: 'create_announcement',
    description: '반에 공지를 올립니다.',
    level: 'create',
    properties: {
      class_id: { type: 'string', description: '반 id' },
      title: { type: 'string', description: '제목' },
      content: { type: 'string', description: '내용 (선택)' },
      pinned: { type: 'boolean', description: '맨 위 고정 (선택)' },
    },
    required: ['class_id', 'title'],
    run: (h, a) => rpc('mcp_create_announcement', {
      p_hash: h, p_class: uuid(a.class_id, true), p_title: str(a.title, 100, true),
      p_content: str(a.content, 5000) ?? '', p_pinned: a.pinned === true,
    }),
  },
  {
    name: 'update_announcement',
    description: '공지의 제목·내용을 고치거나, 고정/숨김을 바꿉니다(지우기는 아닙니다).',
    level: 'edit',
    properties: {
      id: { type: 'string', description: '공지 id' },
      title: { type: 'string' }, content: { type: 'string' },
      pinned: { type: 'boolean', description: '고정 여부' },
      visible: { type: 'boolean', description: '학생에게 보임 여부' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_update_announcement', {
      p_hash: h, p_id: uuid(a.id, true), p_title: str(a.title, 100), p_content: str(a.content, 5000),
      p_pinned: typeof a.pinned === 'boolean' ? a.pinned : null,
      p_visible: typeof a.visible === 'boolean' ? a.visible : null,
    }),
  },
  {
    name: 'create_survey',
    description: '설문을 "초안"으로 만듭니다(학생에게 여는 것은 선생님이 클래스로그AI에서 직접). 질문은 최대 20개. 질문 종류(type): multiple_choice(선택형, options 2~6개), yes_no, star_rating(별점), short_text(주관식), opinion_scale(척도, low_label/high_label/max 5 또는 10), ranking(순위, options 2~6개). 만들기 전에 질문 목록을 사용자에게 보여 주고 확인받으세요.',
    level: 'create',
    properties: {
      title: { type: 'string', description: '설문 제목' },
      class_id: { type: 'string', description: '연결할 반 id (선택)' },
      anonymous: { type: 'boolean', description: '익명 설문 여부 (기본 true)' },
      questions: {
        type: 'array', description: '질문 목록 (순서대로)',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['multiple_choice', 'yes_no', 'star_rating', 'short_text', 'opinion_scale', 'ranking'] },
            text: { type: 'string', description: '질문 글' },
            options: { type: 'array', items: { type: 'string' }, description: 'multiple_choice·ranking 선택지 (2~6개)' },
            low_label: { type: 'string', description: 'opinion_scale 낮은 쪽 설명' },
            high_label: { type: 'string', description: 'opinion_scale 높은 쪽 설명' },
            max: { type: 'integer', description: 'opinion_scale 최대값 5 또는 10' },
          },
          required: ['type', 'text'],
        },
      },
    },
    required: ['title', 'questions'],
    run: (h, a) => {
      if (!Array.isArray(a.questions)) throw new Error('questions는 목록이어야 합니다.');
      return rpc('mcp_create_survey', {
        p_hash: h, p_title: str(a.title, 100, true), p_questions: a.questions,
        p_class: uuid(a.class_id), p_anonymous: typeof a.anonymous === 'boolean' ? a.anonymous : true,
      });
    },
  },
  {
    name: 'create_quiz',
    description: '퀴즈 세트를 글자 문제로만 만듭니다(그림·소리·유튜브는 선생님이 클래스로그AI에서 직접). 최대 30문제. type: multiple_choice(options 정확히 4개 + correct 정답 번호 1~4) 또는 short_answer(correct_answers 정답 글자 목록). 해설(explanation)과 제한시간(time_limit 5~120초, 기본 20)은 선택. 퀴즈 시작은 선생님이 직접 합니다. 만들기 전에 문제와 정답을 사용자에게 보여 주고 확인받으세요.',
    level: 'create',
    properties: {
      title: { type: 'string', description: '퀴즈 세트 제목' },
      class_id: { type: 'string', description: '연결할 반 id (선택)' },
      questions: {
        type: 'array', description: '문제 목록 (순서대로)',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['multiple_choice', 'short_answer'] },
            text: { type: 'string', description: '문제 글' },
            options: { type: 'array', items: { type: 'string' }, description: '4지선다 선택지 4개' },
            correct: { type: 'integer', description: '4지선다 정답 번호 (1~4)' },
            correct_answers: { type: 'array', items: { type: 'string' }, description: '단답형 정답(동의어 포함)' },
            explanation: { type: 'string', description: '해설 (선택)' },
            time_limit: { type: 'integer', description: '제한시간 초 (5~120)' },
          },
          required: ['text'],
        },
      },
    },
    required: ['title', 'questions'],
    run: (h, a) => {
      if (!Array.isArray(a.questions)) throw new Error('questions는 목록이어야 합니다.');
      return rpc('mcp_create_quiz', { p_hash: h, p_title: str(a.title, 100, true), p_questions: a.questions, p_class: uuid(a.class_id) });
    },
  },
  {
    name: 'create_slide_deck',
    description: '글자만 있는 슬라이드를 정해진 기본 모양(밝은 바탕)으로 만듭니다. 최대 30장. 각 장: layout "cover"(표지: title + subtitle) 또는 "content"(내용: title + bullets 목록 또는 body 글). 그림·디자인·배치는 선생님이 클래스로그AI에서 직접 바꿉니다. 공유는 꺼진 채로 만들어집니다. 만들기 전에 장별 제목과 내용을 사용자에게 보여 주고 확인받으세요.',
    level: 'create',
    properties: {
      title: { type: 'string', description: '슬라이드 묶음 제목' },
      class_id: { type: 'string', description: '연결할 반 id (선택)' },
      slides: {
        type: 'array', description: '장 목록 (순서대로)',
        items: {
          type: 'object',
          properties: {
            layout: { type: 'string', enum: ['cover', 'content'] },
            title: { type: 'string' },
            subtitle: { type: 'string', description: '표지 부제' },
            bullets: { type: 'array', items: { type: 'string' }, description: '내용 장 글머리 (최대 10)' },
            body: { type: 'string', description: '내용 장 본문 (bullets 대신)' },
          },
          required: ['title'],
        },
      },
    },
    required: ['title', 'slides'],
    run: (h, a) => rpc('mcp_create_slide_deck', { p_hash: h, p_title: str(a.title, 100, true), p_slides: buildSlides(a.slides), p_class: uuid(a.class_id) }),
  },
  {
    name: 'update_slide_text',
    description: '이미 있는 슬라이드의 글상자 글만 고칩니다(위치·모양·그림은 그대로). get_slide_deck으로 object id를 확인한 뒤 edits에 [{object_id, text}]를 넣으세요(최대 20개). 슬라이드 추가·삭제·순서 변경은 클래스로그AI에서 직접 하세요. 고치기 전에 바꿀 내용을 사용자에게 알리세요.',
    level: 'edit',
    properties: {
      id: { type: 'string', description: '슬라이드 묶음 id' },
      edits: { type: 'array', items: { type: 'object', properties: { object_id: { type: 'string' }, text: { type: 'string' } }, required: ['object_id', 'text'] } },
      title: { type: 'string', description: '묶음 제목 바꾸기 (선택)' },
    },
    required: ['id'],
    run: (h, a) => {
      const edits = a.edits == null ? [] : a.edits;
      if (!Array.isArray(edits)) throw new Error('edits는 목록이어야 합니다.');
      return rpc('mcp_update_slide_text', { p_hash: h, p_id: uuid(a.id, true), p_edits: edits, p_title: str(a.title, 100) });
    },
  },
  {
    name: 'create_lesson_plan',
    description: '수업계획서를 만듭니다. purpose: formal(정식)/summary(요약)/parent(학부모용). basic_info(subject, unitTitle, target, periods, date, studentCount, title), objectives(글 목록), session_plans([{session, title, content, note}]), materials(글), assessment(글), standards(글)를 채우세요. 내보내기(한글/PDF)는 클래스로그AI에서 직접 합니다. 만들기 전에 내용을 사용자에게 확인받으세요.',
    level: 'create',
    properties: {
      purpose: { type: 'string', enum: ['formal', 'summary', 'parent'] },
      basic_info: { type: 'object', description: '기본 정보 (subject, unitTitle, target, periods, date, studentCount, title)' },
      objectives: { type: 'array', items: { type: 'string' } },
      session_plans: { type: 'array', items: { type: 'object', properties: { session: { type: 'integer' }, title: { type: 'string' }, content: { type: 'string' }, note: { type: 'string' } } } },
      materials: { type: 'string' },
      assessment: { type: 'string' },
      standards: { type: 'string', description: '성취기준' },
      class_id: { type: 'string', description: '연결할 반 id (선택)' },
    },
    required: ['purpose', 'basic_info'],
    run: (h, a) => {
      if (a.basic_info == null || typeof a.basic_info !== 'object' || Array.isArray(a.basic_info)) throw new Error('basic_info는 객체여야 합니다.');
      const sections: Record<string, unknown> = { basicInfo: a.basic_info };
      if (a.objectives != null) sections.objectives = a.objectives;
      if (a.session_plans != null) sections.sessionPlans = a.session_plans;
      if (a.materials != null) sections.materials = a.materials;
      if (a.assessment != null) sections.assessment = a.assessment;
      if (a.standards != null) sections.standards = a.standards;
      return rpc('mcp_create_lesson_plan', { p_hash: h, p_purpose: str(a.purpose, 20, true), p_sections: sections, p_class: uuid(a.class_id) });
    },
  },
  {
    name: 'update_lesson_plan',
    description: '이미 있는 수업계획서의 내용을 고칩니다. 넣은 항목만 바뀝니다: basic_info는 넣은 칸만 합쳐지고, objectives·session_plans·materials·assessment·standards는 통째로 교체됩니다(get_lesson_plan으로 먼저 읽고 전체를 보내세요). 고치기 전에 사용자에게 알리세요.',
    level: 'edit',
    properties: {
      id: { type: 'string', description: '수업계획서 id' },
      basic_info: { type: 'object' },
      objectives: { type: 'array', items: { type: 'string' } },
      session_plans: { type: 'array', items: { type: 'object' } },
      materials: { type: 'string' },
      assessment: { type: 'string' },
      standards: { type: 'string' },
    },
    required: ['id'],
    run: (h, a) => {
      const patch: Record<string, unknown> = {};
      if (a.basic_info != null) patch.basicInfo = a.basic_info;
      if (a.objectives != null) patch.objectives = a.objectives;
      if (a.session_plans != null) patch.sessionPlans = a.session_plans;
      if (a.materials != null) patch.materials = a.materials;
      if (a.assessment != null) patch.assessment = a.assessment;
      if (a.standards != null) patch.standards = a.standards;
      return rpc('mcp_update_lesson_plan', { p_hash: h, p_id: uuid(a.id, true), p_patch: patch });
    },
  },
  {
    name: 'add_students',
    description: '반에 학생 칸을 "별칭"으로만 추가합니다(번호는 자동으로 이어서 매김). 실명·연락처·PIN은 절대 넣지 마세요. 사용자가 실명을 말하면 받아 적지 말고 "실명은 클래스로그AI에서 직접 입력해 주세요"라고 안내하세요(별칭은 나중에 앱에서 실명으로 바꿀 수 있습니다). 한 번에 최대 30명, 한 반 40명까지. 학교 프로젝트·하위 반은 불가. 추가 전에 별칭 목록을 사용자에게 보여 주고 확인받으세요. 학생 정보 읽기·수정·삭제와 입장 방식 변경은 이 연결로 할 수 없습니다.',
    level: 'create',
    properties: {
      class_id: { type: 'string', description: '반 id' },
      aliases: { type: 'array', items: { type: 'string' }, description: '별칭 목록 (각 20자 이내, 실명 금지)' },
    },
    required: ['class_id', 'aliases'],
    run: (h, a) => {
      if (!Array.isArray(a.aliases)) throw new Error('aliases는 목록이어야 합니다.');
      return rpc('mcp_add_students', { p_hash: h, p_class: uuid(a.class_id, true), p_aliases: a.aliases.map((x) => String(x)) });
    },
  },
  {
    name: 'create_folder',
    description: '수업 자료 폴더를 만듭니다.',
    level: 'create',
    properties: {
      name: { type: 'string', description: '폴더 이름' },
      parent_id: { type: 'string', description: '상위 폴더 id (선택)' },
    },
    required: ['name'],
    run: (h, a) => rpc('mcp_create_folder', { p_hash: h, p_name: str(a.name, 60, true), p_parent: uuid(a.parent_id) }),
  },
  {
    name: 'rename_folder',
    description: '폴더 이름을 바꿉니다.',
    level: 'edit',
    properties: { id: { type: 'string', description: '폴더 id' }, name: { type: 'string', description: '새 이름' } },
    required: ['id', 'name'],
    run: (h, a) => rpc('mcp_rename_folder', { p_hash: h, p_id: uuid(a.id, true), p_name: str(a.name, 60, true) }),
  },
  {
    name: 'create_material',
    description: '수업 자료를 새로 만듭니다(자료실에 비공개로 저장). 학생에게 공개하는 것은 클래스로그AI에서 선생님이 직접 합니다.',
    level: 'create',
    properties: {
      title: { type: 'string', description: '제목' },
      content: { type: 'string', description: '본문 (마크다운/글)' },
      folder_id: { type: 'string', description: '폴더 id (선택)' },
    },
    required: ['title'],
    run: (h, a) => rpc('mcp_create_material', {
      p_hash: h, p_title: str(a.title, 100, true), p_content: str(a.content, 200000) ?? '', p_folder: uuid(a.folder_id),
    }),
  },
  {
    name: 'update_material',
    description: '수업 자료의 제목·본문·폴더를 고칩니다. 본문은 통째로 바뀌니, 먼저 get_material로 읽고 고친 전체를 보내세요. 공개 여부는 바꿀 수 없습니다.',
    level: 'edit',
    properties: {
      id: { type: 'string', description: '자료 id' },
      title: { type: 'string' }, content: { type: 'string', description: '새 본문 전체' },
      folder_id: { type: 'string', description: '옮길 폴더 id' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_update_material', {
      p_hash: h, p_id: uuid(a.id, true), p_title: str(a.title, 100), p_content: str(a.content, 200000), p_folder: uuid(a.folder_id),
    }),
  },
  {
    name: 'set_material_style',
    description: '자료가 학생에게 보이는 화면 스타일을 바꿉니다. default(기본) / mission(미션) / storybook(이야기책) / challenge(챌린지) / note(노트) / manual(설명서) / workshop(워크숍). 공개 여부는 바꾸지 않습니다.',
    level: 'edit',
    properties: {
      id: { type: 'string', description: '자료 id' },
      style: { type: 'string', enum: ['default', 'mission', 'storybook', 'challenge', 'note', 'manual', 'workshop'] },
    },
    required: ['id', 'style'],
    run: (h, a) => rpc('mcp_set_material_style', { p_hash: h, p_id: uuid(a.id, true), p_style: str(a.style, 20, true) }),
  },
  {
    name: 'get_material_style',
    description: '자료의 현재 화면 스타일을 알려 줍니다.',
    properties: { id: { type: 'string', description: '자료 id' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_material_style', { p_hash: h, p_id: uuid(a.id, true) }),
  },
  {
    name: 'set_class_tool',
    description: '반에 이미 연결된 수업도구를 학생에게 공개/비공개로 바꿉니다. 먼저 list_class_tools로 tool_id를 확인하세요.',
    level: 'edit',
    properties: {
      class_id: { type: 'string', description: '반 id' },
      tool_id: { type: 'string', description: '도구 id' },
      published: { type: 'boolean', description: 'true=공개, false=비공개' },
    },
    required: ['class_id', 'tool_id', 'published'],
    run: (h, a) => rpc('mcp_set_class_tool', {
      p_hash: h, p_class: uuid(a.class_id, true), p_tool_id: str(a.tool_id, 100, true), p_published: a.published === true,
    }),
  },
];

const rpcErr = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// ───────── OAuth 승인 화면 방식(ChatGPT 등): 안내문·등록·열쇠 교환 ─────────
// 열쇠를 주소에 넣지 않고, 선생님이 승인 화면에서 권한을 고르면 ChatGPT가 열쇠를 받아 가는 방식.
const MCP_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp`;
const APP_ORIGIN = 'https://classlog-ai.vercel.app';
const SCOPES = ['read', 'write_create', 'write_edit'];
const META_URL = `${MCP_URL}/.well-known/oauth-protected-resource`;
const WWW_AUTH = { 'WWW-Authenticate': `Bearer resource_metadata="${META_URL}"` };
const oerr = (error: string, description: string, status = 400) =>
  new Response(JSON.stringify({ error, error_description: description }), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const ojson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const handleOAuth = async (req: Request, path: string): Promise<Response | null> => {
  if (req.method === 'GET' && path.endsWith('/.well-known/oauth-protected-resource')) {
    return ojson({ resource: MCP_URL, authorization_servers: [APP_ORIGIN], bearer_methods_supported: ['header'], scopes_supported: SCOPES });
  }
  if (req.method === 'GET' && (path.endsWith('/.well-known/oauth-authorization-server') || path.endsWith('/.well-known/openid-configuration'))) {
    return ojson({
      issuer: APP_ORIGIN,
      authorization_endpoint: `${APP_ORIGIN}/oauth/authorize`,
      token_endpoint: `${MCP_URL}/token`,
      registration_endpoint: `${MCP_URL}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: SCOPES,
    });
  }
  if (req.method === 'POST' && path.endsWith('/register')) {
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return oerr('invalid_client_metadata', 'JSON을 읽을 수 없습니다.'); }
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    const name = typeof b.client_name === 'string' ? b.client_name : '';
    const { data, error } = await supabase.rpc('mcp_oauth_register', { p_name: name, p_redirects: uris });
    if (error) {
      if (error.message.includes('invalid_redirect')) return oerr('invalid_redirect_uri', '허용되지 않은 되돌아올 주소입니다.');
      if (error.message.includes('rate_limited')) return oerr('temporarily_unavailable', '잠시 뒤 다시 시도하세요.', 429);
      return oerr('server_error', '등록 중 오류가 났습니다.', 500);
    }
    return ojson({
      client_id: (data as { client_id: string }).client_id, client_name: name.slice(0, 60) || '외부 AI', redirect_uris: uris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'],
    }, 201);
  }
  if (req.method === 'POST' && path.endsWith('/token')) {
    let f: URLSearchParams;
    try {
      const ct = req.headers.get('content-type') ?? '';
      f = ct.includes('json') ? new URLSearchParams(Object.entries(await req.json()).map(([k, v]) => [k, String(v)])) : new URLSearchParams(await req.text());
    } catch { return oerr('invalid_request', '요청을 읽을 수 없습니다.'); }
    if (f.get('grant_type') !== 'authorization_code') return oerr('unsupported_grant_type', 'authorization_code만 지원합니다.');
    const { data, error } = await supabase.rpc('mcp_oauth_exchange', {
      p_code: f.get('code'), p_client_id: f.get('client_id'), p_redirect_uri: f.get('redirect_uri'), p_verifier: f.get('code_verifier'),
    });
    if (error) {
      if (error.message.includes('too_many_tokens')) return oerr('access_denied', '연결 열쇠가 너무 많습니다(최대 5개). 클래스로그AI 설정 > AI 연결에서 안 쓰는 열쇠를 끄고 다시 시도하세요.');
      if (error.message.includes('invalid_grant')) return oerr('invalid_grant', '승인 코드가 올바르지 않거나 만료되었습니다.');
      return oerr('server_error', '열쇠 발급 중 오류가 났습니다.', 500);
    }
    return ojson(data);
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const oauthRes = await handleOAuth(req, new URL(req.url).pathname);
  if (oauthRes) return oauthRes;
  if (req.method !== 'POST') return json({ error: 'POST만 지원합니다.' }, 405);

  // 1) 열쇠 확인
  // 헤더 방식(기본) 또는 주소 방식(?key=clk_…, 헤더를 못 넣는 앱용 · 읽기 전용 열쇠만)
  const m = /^Bearer\s+(clk_[0-9a-f]{64})$/i.exec(req.headers.get('authorization') ?? '');
  const urlKey = m ? null : /^clk_[0-9a-f]{64}$/i.exec(new URL(req.url).searchParams.get('key') ?? '');
  const keyStr = (m ?? urlKey)?.[m ? 1 : 0];
  if (!keyStr) return new Response(JSON.stringify(rpcErr(null, -32001, 'AI 연결 키가 필요합니다. (Authorization: Bearer clk_... 또는 주소 뒤 ?key=clk_...)')), { status: 401, headers: { ...cors, ...WWW_AUTH, 'Content-Type': 'application/json' } });
  const hash = await sha256(keyStr.toLowerCase());
  const auth = await supabase.rpc('mcp_auth', { p_hash: hash });
  if (auth.error) {
    const limited = auth.error.message.includes('rate_limited');
    return json(rpcErr(null, -32002, limited ? '요청이 너무 많습니다. 1분 뒤 다시 시도하세요.' : '인증 확인 중 오류가 났습니다.'), limited ? 429 : 500);
  }
  const row = Array.isArray(auth.data) ? auth.data[0] : auth.data;
  if (!row?.token_id) return new Response(JSON.stringify(rpcErr(null, -32001, '키가 올바르지 않거나 만료·폐기되었습니다.')), { status: 401, headers: { ...cors, ...WWW_AUTH, 'Content-Type': 'application/json' } });
  // 주소에 들어간 열쇠는 새기 쉬우므로 '읽기만' 열쇠만 허용 (만들기·고치기 열쇠는 헤더로만)
  if (urlKey && row.scope !== 'read') {
    return json(rpcErr(null, -32003, '주소 방식(?key=)은 "읽기만" 열쇠로만 쓸 수 있어요. 만들기·고치기 권한은 헤더 방식으로 연결하세요.'), 403);
  }

  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try { msg = await req.json(); } catch { return json(rpcErr(null, -32700, 'JSON을 읽을 수 없습니다.'), 400); }
  if (Array.isArray(msg)) return json(rpcErr(null, -32600, '배치 요청은 지원하지 않습니다.'), 400);
  const { id, method, params = {} } = msg;

  // 알림(응답 없음)
  if (method?.startsWith('notifications/')) return new Response(null, { status: 202, headers: cors });

  switch (method) {
    case 'initialize':
      return json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: SERVER,
          instructions: '선생님의 클래스로그AI 수업 자료·슬라이드·수업 계획서·아이디어 기록·수업 메모·설문·퀴즈·포트폴리오·갤러리 목록·학교 프로젝트를 읽고, 열쇠 권한에 따라 반·주차·공지·자료·폴더를 만들거나 고치고, 설문·퀴즈 초안, 글자만 있는 슬라이드와 수업계획서를 만들고 글을 고치고, 학생 칸을 별칭으로 추가하는 도구입니다. 슬라이드의 그림·디자인 변경·장 추가/삭제/순서·공유·내보내기는 클래스로그AI에서 직접 해야 합니다. 목록(list_*)으로 id를 찾은 뒤 get_*으로 읽으세요. 쓰기 전에는 무엇을 바꿀지 사용자에게 한 줄로 알리세요. 학생 정보는 제공하지 않습니다(학생은 번호로만 다룹니다). 지우기·학생 이름/제출물/출결/평가·학부모 공유·로그인/키/결제/요금제/관리자 기능은 이 연결로 할 수 없습니다. 그런 요청이나 도구가 없어 못 하는 요청은 시도하지 말고 "클래스로그AI에서 직접 해 주세요"라고 안내하세요. 헷갈리면 what_i_cannot_do를 부르세요.',
        },
      });
    case 'ping':
      return json({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return json({
        jsonrpc: '2.0', id,
        result: {
          tools: TOOLS.filter(t => allowed(row.scope, t.level)).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: { type: 'object', properties: t.properties, ...(t.required ? { required: t.required } : {}) },
            annotations: t.level ? { readOnlyHint: false, destructiveHint: false } : { readOnlyHint: true },
          })),
        },
      });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params.name);
      if (!tool) return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '이 연결에는 그런 도구가 없습니다. 사용자에게 클래스로그AI에서 직접 하시도록 안내하세요. (what_i_cannot_do 참고)' }], isError: true } });
      let ok = false;
      let text: string;
      if (!allowed(row.scope, tool.level)) {
        // 권한 밖 쓰기 시도: 실행하지 않고 실패로 기록
        supabase.rpc('mcp_log', { p_token_id: row.token_id, p_tool: tool.name, p_ok: false }).then(() => {}, () => {});
        return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '이 열쇠에는 이 작업 권한이 없습니다. 클래스로그AI 설정 > AI 연결에서 권한이 더 높은 열쇠를 새로 만들거나, 해당 작업을 클래스로그AI에서 직접 하세요.' }], isError: true } });
      }
      try {
        const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
        const { data, error } = await tool.run(hash, args);
        if (error) {
          if (error.message.includes('rate_limited')) throw new Error('요청이 너무 많습니다.');
          const hit = FRIENDLY.find(([k]) => error.message.includes(k));
          throw new Error(hit ? hit[1] : '처리 중 오류가 났습니다. 클래스로그AI에서 직접 해 보시거나 잠시 뒤 다시 시도하세요.');
        }
        text = JSON.stringify(data ?? []);
        ok = true;
      } catch (e) {
        text = (e as Error).message;
      }
      // 기록은 응답을 막지 않게 기다리지 않는다(실패해도 무시)
      supabase.rpc('mcp_log', { p_token_id: row.token_id, p_tool: tool.name, p_ok: ok }).then(() => {}, () => {});
      return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], ...(ok ? {} : { isError: true }) } });
    }
    default:
      return json(rpcErr(id, -32601, '지원하지 않는 방법입니다.'));
  }
});
