import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUTPUT_DIR = path.resolve('Docs/instagram_cards/01_overtime_to_early_leave/rendered_story_type_a');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const STORY_SLIDES = [
  {
    slideNum: 1,
    sceneTag: '교무실 오후 6시 30분...',
    speaker: '아크 쌤',
    dialogue: '수업 준비만 2시간째... 생기부 마감은 코앞이고\n오늘도 어김없이 교무실 마지막 불을 끕니다...',
    imageFile: 'slide_01_cover.jpg',
    bottomNote: '끝없는 교안 작성과 행정 업무... 퇴근은 언제쯤?',
    footerCta: '옆자리 쌤의 비결 보기 ->',
    bubbleTheme: 'dark', // dark card with white text
  },
  {
    slideNum: 2,
    sceneTag: '컴퓨터 화면의 진실',
    speaker: '아크 쌤',
    dialogue: '교안은 노션, PPT는 캔바, 계획서는 한글...\n창 옮겨 다니다가 수업 전부터 지쳐버려요...',
    imageFile: 'slide_02_problem.jpg',
    bottomNote: '분절된 프로그램들 사이에서 낭비되는 소중한 2시간',
    footerCta: '해결책 확인하기 ->',
    bubbleTheme: 'dark',
  },
  {
    slideNum: 3,
    sceneTag: '칼퇴 비결 01. 올인원 수업도구',
    speaker: '옆자리 쌤',
    dialogue: '쌤, 엑셀 명단 복붙하면 30초 만에 반 세팅 끝나요!\n수업 중엔 AI가 판서랑 실시간 기록도 다 해주고요!',
    imageFile: 'slide_03_classroom_tools.jpg',
    bottomNote: '프로그램 전환 NO! 타이머·판서·발표 뽑기까지 한 화면에',
    footerCta: '수업 설계 비결 보기 ->',
    bubbleTheme: 'green',
  },
  {
    slideNum: 4,
    sceneTag: '칼퇴 비결 02. AI 5분 수업 설계',
    speaker: '옆자리 쌤',
    dialogue: '주제만 던지면 AI가 성취기준 교안, PPT 슬라이드,\n형성평가 퀴즈까지 5분 만에 세트로 뽑아줘요!',
    imageFile: 'slide_04_material_slides.jpg',
    bottomNote: '8종의 전문 AI 조교가 수업 준비 시간을 70% 단축',
    footerCta: '세특 마감 비결 보기 ->',
    bubbleTheme: 'blue',
  },
  {
    slideNum: 5,
    sceneTag: '칼퇴 비결 03. 원클릭 NEIS 세특',
    speaker: '옆자리 쌤',
    dialogue: '수업 때 버튼 몇 번 누른 관찰 기록으로\n500자 세특 초안이 완성돼서 나이스에 복붙만 해요!',
    imageFile: 'slide_05_seatuk_instant.jpg',
    bottomNote: '학기 말 생기부 야근 지옥을 완전히 끝내는 킬러 기능',
    footerCta: '무료로 시작하는 법 ->',
    bubbleTheme: 'purple',
  },
  {
    slideNum: 6,
    sceneTag: '선생님의 저녁이 있는 삶',
    speaker: 'ClassLog',
    dialogue: '선생님의 수업은 더 빛나고, 퇴근은 빨라지도록!\n지금 ClassLog에서 8종 AI 조교를 무료로 만나보세요.',
    imageFile: 'slide_06_cta.jpg',
    bottomNote: '선생님을 위한 올인원 AI 파트너 · https://litt.ly/aklabs',
    footerCta: '프로필 링크에서 무료 체험 ->',
    bubbleTheme: 'orange',
  },
];

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildStoryCardSvg(slide, totalSlides = 6) {
  const dialogueLines = slide.dialogue.split('\n');

  // 테마별 색상 설정
  let bubbleBg = '#0F172A';
  let bubbleBorder = '#334155';
  let speakerBg = '#F97316';
  let speakerText = '#FFFFFF';
  let dialogueColor = '#FFFFFF';
  let tagBg = '#1E293B';
  let tagText = '#94A3B8';
  let accentColor = '#EA580C';

  if (slide.bubbleTheme === 'green') {
    bubbleBg = '#064E3B';
    bubbleBorder = '#059669';
    speakerBg = '#10B981';
    tagBg = '#065F46';
    tagText = '#A7F3D0';
    accentColor = '#059669';
  } else if (slide.bubbleTheme === 'blue') {
    bubbleBg = '#1E3A8A';
    bubbleBorder = '#3B82F6';
    speakerBg = '#60A5FA';
    speakerText = '#0F172A';
    tagBg = '#1E40AF';
    tagText = '#BFDBFE';
    accentColor = '#2563EB';
  } else if (slide.bubbleTheme === 'purple') {
    bubbleBg = '#4C1D95';
    bubbleBorder = '#8B5CF6';
    speakerBg = '#A78BFA';
    speakerText = '#0F172A';
    tagBg = '#5B21B6';
    tagText = '#DDD6FE';
    accentColor = '#7C3AED';
  } else if (slide.bubbleTheme === 'orange') {
    bubbleBg = '#7C2D12';
    bubbleBorder = '#F97316';
    speakerBg = '#FB923C';
    speakerText = '#0F172A';
    tagBg = '#9A3412';
    tagText = '#FED7AA';
    accentColor = '#EA580C';
  }

  return `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
    <filter id="imgShadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- 1. 상단 헤더 (씬 태그 + 인디케이터) -->
  <g transform="translate(60, 42)">
    <!-- 씬 태그 -->
    <rect width="260" height="36" rx="10" fill="${tagBg}"/>
    <text x="130" y="23" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="800" font-size="14" fill="${tagText}" letter-spacing="0.3">
      ${escapeXml(slide.sceneTag)}
    </text>

    <!-- 슬라이드 번호 -->
    <rect x="850" y="0" width="110" height="36" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="905" y="24" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="900" font-size="16" fill="${accentColor}">
      ${slide.slideNum} <tspan fill="#94A3B8" font-weight="600">/ ${totalSlides}</tspan>
    </text>
  </g>

  <!-- 2. 상단 대형 말풍선 대사 카드 (y: 96, height: 230) -->
  <g transform="translate(60, 96)" filter="url(#cardShadow)">
    <!-- 말풍선 메인 박스 -->
    <rect width="960" height="224" rx="24" fill="${bubbleBg}" stroke="${bubbleBorder}" stroke-width="2"/>
    
    <!-- 말풍선 꼬리 (아래로 뾰족) -->
    <polygon points="460,224 500,224 480,246" fill="${bubbleBg}"/>

    <!-- 화자 이름 배지 -->
    <rect x="36" y="24" width="120" height="34" rx="17" fill="${speakerBg}"/>
    <text x="96" y="46" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="900" font-size="15" fill="${speakerText}">
      💬 ${escapeXml(slide.speaker)}
    </text>

    <!-- 대사 본문 (모바일에서 한눈에 보이는 35px 굵은 폰트) -->
    <text x="36" y="112" font-family="'Pretendard', sans-serif" font-weight="800" font-size="34" fill="${dialogueColor}" letter-spacing="-0.8" line-height="1.35">
      ${escapeXml(dialogueLines[0])}
    </text>
    ${
      dialogueLines[1]
        ? `<text x="36" y="166" font-family="'Pretendard', sans-serif" font-weight="800" font-size="34" fill="${dialogueColor}" letter-spacing="-0.8">${escapeXml(dialogueLines[1])}</text>`
        : ''
    }
  </g>

  <!-- 3. 중앙 3D 이미지 영역 (top: 360, width: 960, height: 810) - Sharp 파이프라인에서 렌더링 -->

  <!-- 4. 하단 요약 노트 바 (y: 1195, height: 56) -->
  <g transform="translate(60, 1195)">
    <rect width="960" height="54" rx="14" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="24" y="33" font-family="'Pretendard', sans-serif" font-weight="800" font-size="16" fill="#0F172A" letter-spacing="-0.3">
      ✦ ${escapeXml(slide.bottomNote)}
    </text>
  </g>

  <!-- 5. 푸터 브랜딩 (y: 1285) -->
  <g transform="translate(60, 1285)">
    <text x="0" y="24" font-family="'Pretendard', sans-serif" font-weight="900" font-size="22" fill="#0F172A" letter-spacing="-0.5">
      Class<tspan fill="#EA580C">Log</tspan>
    </text>
    <text x="115" y="23" font-family="'Pretendard', sans-serif" font-weight="600" font-size="14" fill="#94A3B8">| 선생님을 위한 올인원 AI 파트너</text>
    <text x="960" y="23" text-anchor="end" font-family="'Pretendard', sans-serif" font-weight="800" font-size="16" fill="${accentColor}">${escapeXml(slide.footerCta)}</text>
  </g>
</svg>
`;
}

async function renderStoryCards() {
  console.log('🚀 [개선안 A: 상단 대형 말풍선 + 대형 3D 비주얼] 4:5 카드뉴스 렌더링 시작...');

  for (const slide of STORY_SLIDES) {
    const inputImagePath = path.resolve('Docs/instagram_cards/01_overtime_to_early_leave', slide.imageFile);
    const outputImagePath = path.join(OUTPUT_DIR, `story_slide_0${slide.slideNum}.jpg`);

    // 1. 3D 배경 이미지를 960 x 750 크기로 부드러운 사각형으로 크롭
    const roundedImageBuffer = await sharp(inputImagePath)
      .resize(960, 750, { fit: 'cover', position: 'center' })
      .composite([
        {
          input: Buffer.from(`
            <svg width="960" height="750">
              <rect width="960" height="750" rx="28" fill="#FFFFFF"/>
            </svg>
          `),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();

    // 2. SVG 텍스트 & 말풍선 오버레이 생성
    const svgString = buildStoryCardSvg(slide, STORY_SLIDES.length);
    const svgBuffer = Buffer.from(svgString);

    // 3. 베이스 SVG 캔버스 + 3D 이미지 + 말풍선 오버레이 정밀 합성
    // 3D 이미지를 먼저 캔버스에 깔고, 그 위에 SVG(말풍선 포함)를 얹어서 렌더링
    const baseCanvas = await sharp({
      create: {
        width: 1080,
        height: 1350,
        channels: 4,
        background: { r: 248, g: 250, b: 252, alpha: 1 },
      },
    })
      .composite([
        {
          input: roundedImageBuffer,
          top: 290,
          left: 60,
        },
        {
          input: svgBuffer,
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 96 })
      .toFile(outputImagePath);

    console.log(`✅ [${slide.slideNum}/6] ${outputImagePath} 생성 완료!`);
  }

  console.log('🎉 [타입 A. 공감 스토리텔링형] 카드뉴스 6장이 성공적으로 완성되었습니다!');
}

renderStoryCards().catch(console.error);
