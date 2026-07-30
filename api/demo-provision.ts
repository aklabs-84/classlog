import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'crypto';

const DEMO_TEACHER_EMAIL = '__demo_teacher__@internal.saenggilog.app';
const DEMO_CLASS_TTL_MS = 2 * 60 * 60 * 1000; // 2시간
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // IP당 1분 1회
const ENTRY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동되는 0/O, 1/I 제외

const STUDENT_NAMES = ['김민준', '이서연', '박지호', '최유나', '정하윤'];

// 활동기록(observations) 시드 — studentIdx는 STUDENT_NAMES 인덱스
const OBSERVATION_SEEDS: Array<{
  studentIdx: number; week: number; activity_name: string; category: string;
  content: string; status: 'approved' | 'pending' | 'rejected';
  teacher_feedback?: string; ai_concern?: string;
}> = [
  { studentIdx: 0, week: 1, activity_name: '세포 소기관 모형 만들기', category: '실험',
    content: '세포 소기관 모형을 점토로 제작하며 미토콘드리아, 소포체, 골지체의 기능을 정확히 설명함. 모형 제작 후 다른 모둠원에게 각 소기관의 역할을 자발적으로 설명하는 모습을 보임.',
    status: 'approved', teacher_feedback: '모형과 설명이 모두 정확했습니다. 다음에는 소기관 간 상호작용도 다뤄보면 좋겠어요.' },
  { studentIdx: 0, week: 2, activity_name: '효소 반응 속도 실험 소감문', category: '실험소감',
    content: '카탈레이스 효소의 반응 속도가 온도에 따라 달라지는 것을 관찰했다. 실험이 재미있었다.',
    status: 'pending', ai_concern: '내용이 짧습니다. 관찰한 구체적인 수치나 온도별 차이의 원인 분석을 추가해보면 더 좋은 기록이 됩니다.' },
  { studentIdx: 0, week: 3, activity_name: '광합성 실험 결과 분석', category: '실험',
    content: '엘로디아를 이용한 광합성 실험에서 빛의 세기에 따른 산소 발생량 변화를 정확히 측정하고 그래프로 정리함. 온도 변인 통제의 필요성을 스스로 제기하여 실험 설계를 보완함.',
    status: 'approved', teacher_feedback: '변인 통제에 대한 문제의식이 훌륭합니다.' },
  { studentIdx: 0, week: 4, activity_name: '세포 분열 단계 배열 활동', category: '활동',
    content: '오늘 세포 분열 수업에서 G1, S, G2, M기의 각 특징을 꼼꼼히 정리했다. 특히 DNA 복제가 S기에 일어난다는 점을 실험 영상을 통해 확인하고, 동급생들에게 설명해주는 과정에서 심화 이해를 보여주었다. 교사가 제시한 유사분열 단계 순서 맞추기 활동에서 1등으로 완성하고, 감수분열과의 차이점을 자발적으로 표로 정리하여 제출하였다.',
    status: 'approved', teacher_feedback: '핵심 개념을 정확히 짚어낸 우수한 기록입니다.' },

  { studentIdx: 1, week: 1, activity_name: '세포막의 선택적 투과성 실험', category: '실험',
    content: '삼투 현상 실험에서 감자 조각의 질량 변화를 측정하여 농도에 따른 삼투압 차이를 확인함. 실험 결과를 표와 그래프로 정확하게 정리하고, 세포막의 선택적 투과성과 연결지어 설명함.',
    status: 'approved', teacher_feedback: '표와 그래프 정리가 깔끔합니다.' },
  { studentIdx: 1, week: 3, activity_name: '세포 호흡 발효 실험', category: '실험',
    content: '효모의 발효 과정에서 이산화탄소 발생량을 측정하여 무산소 호흡과 유산소 호흡의 차이를 비교함. 실험 도구를 능숙하게 다루고 모둠 실험을 주도적으로 이끎.',
    status: 'approved', teacher_feedback: '실험 주도력이 돋보였습니다.' },
  { studentIdx: 1, week: 4, activity_name: 'DNA 복제 과정 요약', category: '과제',
    content: 'DNA가 복제된다.',
    status: 'rejected', teacher_feedback: '분량이 너무 적습니다. 오늘 배운 개념을 좀 더 구체적으로 작성해서 다시 제출해주세요.' },

  { studentIdx: 2, week: 2, activity_name: '효소와 활성화 에너지 정리', category: '정리노트',
    content: '효소가 활성화 에너지를 낮추어 반응 속도를 높이는 원리를 도식으로 정리함. 기질 특이성 개념을 자물쇠-열쇠 모델에 비유하여 설명하는 등 이해도가 높음.',
    status: 'approved', teacher_feedback: '비유를 활용한 설명이 인상적입니다.' },
  { studentIdx: 2, week: 4, activity_name: '유사분열과 감수분열 비교', category: '활동',
    content: '유사분열과 감수분열의 염색체 수 변화를 그림으로 비교하여 정리함. 감수분열에서 상동염색체 분리가 일어나는 시점을 정확히 짚어냄.',
    status: 'approved', teacher_feedback: '개념 이해가 정확합니다.' },

  { studentIdx: 3, week: 1, activity_name: '원핵세포와 진핵세포 비교', category: '정리노트',
    content: '원핵세포와 진핵세포의 구조적 차이를 표로 정리하고, 세포벽과 핵막 유무를 기준으로 분류하는 활동을 정확히 수행함.',
    status: 'approved', teacher_feedback: '분류 기준 설정이 명확했습니다.' },
  { studentIdx: 3, week: 3, activity_name: '광합성 산물 검증 실험', category: '실험소감',
    content: '잎에서 광합성이 일어나는 걸 확인했다.',
    status: 'pending', ai_concern: '실험 과정과 결과를 더 구체적으로 서술하면 좋겠습니다.' },

  { studentIdx: 4, week: 4, activity_name: '세포 주기 그래프 해석', category: '활동',
    content: '세포 주기 그래프에서 각 시기별 DNA 양의 변화를 정확히 읽어내고, G1기와 G2기의 DNA 함량 차이가 발생하는 이유를 S기의 복제 과정과 연결지어 설명함.',
    status: 'approved', teacher_feedback: '그래프 해석 능력이 뛰어납니다.' },
];

// 결과물 제출(student_results) 시드
const RESULT_SEEDS: Array<{
  studentIdx: number; week: number; title: string;
  result_type: 'text' | 'link'; text_content?: string; link_url?: string;
  status: 'submitted' | 'approved' | 'rejected';
  teacher_eval_score?: number; teacher_eval_tags?: string[]; teacher_eval_note?: string;
  rejection_feedback?: string;
}> = [
  { studentIdx: 0, week: 4, title: '세포 분열 단계 정리 보고서', result_type: 'text',
    text_content: '세포 주기의 각 단계(G1기, S기, G2기, M기)를 표로 정리하고, 유사분열의 전기·중기·후기·말기 특징을 도식화했습니다. 감수분열과의 차이점도 비교표로 작성했습니다.',
    status: 'approved', teacher_eval_score: 5, teacher_eval_tags: ['탐구력', '성실성'],
    teacher_eval_note: '세포 주기 이해가 깊고, 스스로 비교표를 만들어 심화 학습한 점이 훌륭합니다.' },
  { studentIdx: 1, week: 3, title: '세포 호흡 실험 보고서', result_type: 'text',
    text_content: '효모 발효 실험 과정과 결과를 정리했습니다. 온도별 이산화탄소 발생량 데이터를 표로 나타내고, 무산소 호흡과 유산소 호흡의 에너지 효율 차이를 분석했습니다.',
    status: 'approved', teacher_eval_score: 4, teacher_eval_tags: ['논리적사고', '표현력'],
    teacher_eval_note: '데이터 분석과 논리적 서술이 돋보이는 보고서입니다.' },
  { studentIdx: 2, week: 4, title: '유사분열·감수분열 비교표', result_type: 'text',
    text_content: '유사분열과 감수분열의 차이를 염색체 수, 분열 횟수, 결과 세포 수를 기준으로 표로 정리했습니다.',
    status: 'submitted' },
  { studentIdx: 3, week: 2, title: '효소 실험 참고 자료 링크', result_type: 'link',
    link_url: 'https://youtu.be/example-enzyme-lab',
    status: 'rejected', rejection_feedback: '링크가 아니라 직접 실험 결과 정리 내용을 제출해주세요.' },
];

function randomEntryCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ENTRY_CODE_CHARS[Math.floor(Math.random() * ENTRY_CODE_CHARS.length)];
  }
  return code;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl    = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[api/demo-provision] Missing Supabase env variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Step 0: IP 기준 레이트리밋 (1분 1회) ────────────────────────────────
  const ipRaw = (req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').toString();
  const ip = ipRaw.split(',')[0].trim();
  const ipHash = createHash('sha256').update(ip).digest('hex');

  const { data: existingLog } = await supabaseAdmin
    .from('demo_provision_log')
    .select('last_at')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (existingLog && Date.now() - new Date(existingLog.last_at).getTime() < RATE_LIMIT_WINDOW_MS) {
    return res.status(429).json({ error: '잠시 후 다시 시도해주세요.' });
  }

  await supabaseAdmin
    .from('demo_provision_log')
    .upsert({ ip_hash: ipHash, last_at: new Date().toISOString() });

  // ── Step 1: 만료된 데모 학급 정리 (opportunistic cleanup) ────────────────
  await supabaseAdmin
    .from('classes')
    .delete()
    .eq('is_demo', true)
    .lt('demo_expires_at', new Date().toISOString());

  // ── Step 2: 고정 데모 교사 계정 확보 (없으면 생성) ───────────────────────
  let teacherId: string | null = null;

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', DEMO_TEACHER_EMAIL)
    .maybeSingle();

  if (existingProfile?.id) {
    teacherId = existingProfile.id;
  } else {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: DEMO_TEACHER_EMAIL,
      password: randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: '클래스로그 데모 교사' },
    });

    if (createError || !created?.user) {
      console.error('[api/demo-provision] failed to create demo teacher:', createError?.message);
      return res.status(500).json({ error: 'Could not provision demo teacher' });
    }

    teacherId = created.user.id;

    await supabaseAdmin
      .from('profiles')
      .update({
        full_name: '클래스로그 데모 교사',
        role: 'teacher',
        email: DEMO_TEACHER_EMAIL,
        is_approved: true,
        plan: 'pro',
      })
      .eq('id', teacherId);
  }

  // ── Step 3: 데모 학급 생성 (entry_code 충돌 시 재시도) ───────────────────
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + DEMO_CLASS_TTL_MS).toISOString();

  let classId: string | null = null;
  let entryCode = '';
  for (let attempt = 0; attempt < 5 && !classId; attempt++) {
    entryCode = randomEntryCode();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('classes')
      .insert({
        teacher_id: teacherId,
        name: '3학년 생명과학 I',
        subject: '생명과학',
        entry_code: entryCode,
        class_type: 'subject',
        weekly_plan: [
          { week: 1, topic: '세포의 구조와 기능' },
          { week: 2, topic: '물질대사와 효소' },
          { week: 3, topic: '세포 호흡과 광합성' },
          { week: 4, topic: '세포 분열과 DNA 복제' },
        ],
        active_week: 4,
        today_started_at: nowIso,
        share_enabled: true,
        min_obs_chars: 0,
        ai_review_enabled: true,
        is_demo: true,
        demo_expires_at: expiresAtIso,
      })
      .select('id')
      .single();

    if (!insertError && inserted) {
      classId = inserted.id;
    } else if (insertError?.code !== '23505') {
      // entry_code 유니크 충돌(23505)이 아닌 다른 오류는 즉시 중단
      console.error('[api/demo-provision] failed to create demo class:', insertError?.message);
      return res.status(500).json({ error: 'Could not provision demo class' });
    }
  }

  if (!classId) {
    return res.status(500).json({ error: 'Could not allocate entry code' });
  }

  // ── Step 4: 데모 학생 5명 생성 ────────────────────────────────────────────
  const { data: students, error: studentsError } = await supabaseAdmin
    .from('students')
    .insert(
      STUDENT_NAMES.map((name, idx) => ({
        class_id: classId,
        full_name: name,
        student_number: String(idx + 1),
      }))
    )
    .select('id, full_name, student_number');

  if (studentsError || !students) {
    console.error('[api/demo-provision] failed to create demo students:', studentsError?.message);
    return res.status(500).json({ error: 'Could not provision demo students' });
  }

  // ── Step 5: 활동기록(observations) 시드 ──────────────────────────────────
  const { error: obsError } = await supabaseAdmin.from('observations').insert(
    OBSERVATION_SEEDS.map(seed => ({
      teacher_id: teacherId,
      student_id: students[seed.studentIdx].id,
      week_number: seed.week,
      activity_name: seed.activity_name,
      category: seed.category,
      content: seed.content,
      status: seed.status,
      teacher_feedback: seed.teacher_feedback ?? null,
      ai_concern: seed.ai_concern ?? null,
      is_student_record: true,
    }))
  );
  if (obsError) {
    console.error('[api/demo-provision] failed to seed observations:', obsError.message);
  }

  // ── Step 6: 결과물 제출(student_results) 시드 ────────────────────────────
  const { error: resultsError } = await supabaseAdmin.from('student_results').insert(
    RESULT_SEEDS.map(seed => ({
      student_id: students[seed.studentIdx].id,
      class_id: classId,
      week_number: seed.week,
      title: seed.title,
      result_type: seed.result_type,
      text_content: seed.text_content ?? null,
      link_url: seed.link_url ?? null,
      status: seed.status,
      teacher_eval_score: seed.teacher_eval_score ?? null,
      teacher_eval_tags: seed.teacher_eval_tags ?? null,
      teacher_eval_note: seed.teacher_eval_note ?? null,
      rejection_feedback: seed.rejection_feedback ?? null,
    }))
  );
  if (resultsError) {
    console.error('[api/demo-provision] failed to seed student_results:', resultsError.message);
  }

  // ── Step 7: AI 세특 초안(student_evaluations) 시드 — 김민준은 이미 작성 완료 상태로 ──
  const { error: evalError } = await supabaseAdmin.from('student_evaluations').insert({
    student_id: students[0].id,
    class_id: classId,
    teacher_id: teacherId,
    academic_year: new Date().getFullYear(),
    achievement_level: '상',
    setech_content:
      '세포 분열과 DNA 복제 단원에서 세포 주기의 각 단계(G1기, S기, G2기, M기)를 체계적으로 이해하고, 특히 S기에 일어나는 DNA 복제 과정을 실험 영상 분석을 통해 심층적으로 파악함. 유사 분열의 전기·중기·후기·말기를 정확히 구분하여 단계별 특징을 도식화하고, 감수 분열과의 차이점을 비교표로 작성하여 제출하는 적극적인 학습 태도를 보임. 수업 중 동급생에게 핵심 개념을 자발적으로 설명하며 협력 학습을 주도하였으며, 세포 분열 단계 배열 활동에서 정확성과 신속성을 동시에 발휘함.',
    status: 'draft',
  });
  if (evalError) {
    console.error('[api/demo-provision] failed to seed student_evaluations:', evalError.message);
  }

  // ── Step 8: 비밀번호 없이 데모 교사로 실제 로그인시키기 위한 매직링크 토큰 발급 ──
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: DEMO_TEACHER_EMAIL,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[api/demo-provision] failed to generate login link:', linkError?.message);
    return res.status(500).json({ error: 'Could not provision demo login' });
  }

  return res.status(200).json({
    ok: true,
    entry_code: entryCode,
    class_id: classId,
    expires_at: expiresAtIso,
    students,
    login_token_hash: linkData.properties.hashed_token,
    login_email: DEMO_TEACHER_EMAIL,
  });
}
