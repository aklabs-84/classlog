import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUTPUT_DIR = path.resolve('Docs/instagram_cards/01_overtime_to_early_leave/rendered_4_5');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 6개 슬라이드 데이터 정의 (4:5 비율: 1080 x 1350 px)
const SLIDES = [
  {
    slideNum: 1,
    tag: '선생님 칼퇴 치트키',
    title: '아직도 3개 사이트\n띄우고 수업하세요?',
    subtitle: '수업 준비 1시간 -> 3분으로 줄이는 올인원 파트너',
    imageFile: 'slide_01_cover.jpg',
    bottomBox: {
      type: 'highlight',
      badge: '선생님의 고민',
      text: '교안 따로, PPT 따로, 계획서 따로... 매일 늦어지는 퇴근 시간',
    },
    ctaText: '옆으로 넘겨서 해결하기 ->',
  },
  {
    slideNum: 2,
    tag: '수업 준비의 현실',
    title: '수업 1개 준비하는데\n반나절이 걸리는 이유',
    subtitle: '브라우저 탭만 10개 열려있는 선생님의 컴퓨터 화면',
    imageFile: 'slide_02_problem.jpg',
    bottomBox: {
      type: 'list',
      items: [
        '[교안] 한글/노션에서 따로 타이핑 (1시간)',
        '[PPT] 발표 템플릿 찾고 디자인 (2시간)',
        '[계획서] 행정 제출용 양식 복붙 (1시간)',
      ],
    },
    ctaText: '이제 이렇게 바뀝니다 ->',
  },
  {
    slideNum: 3,
    tag: 'SOLUTION 01',
    title: '30초 반 개설 &\n필수 수업도구 올인원',
    subtitle: '화면 전환 스트레스 없이 칠판 위에 바로 띄우는 스마트 도구',
    imageFile: 'slide_03_classroom_tools.jpg',
    bottomBox: {
      type: 'list',
      items: [
        '✦ 엑셀 명단 복붙으로 30초 만에 반 개설 & 모둠 편성',
        '✦ 말하는 대로 텍스트화되는 실시간 AI 음성 전사',
        '✦ 교실 대형 타이머 & 실시간 협업 화이트보드 탑재',
      ],
    },
    ctaText: '교안과 PPT도 3분 컷 ->',
  },
  {
    slideNum: 4,
    tag: 'SOLUTION 02',
    title: '타자만 치면 교안과\n슬라이드가 3분 완성!',
    subtitle: '마크다운 에디터에서 원클릭으로 PPT 덱 & 정식 지도안 변환',
    imageFile: 'slide_04_material_slides.jpg',
    bottomBox: {
      type: 'list',
      items: [
        '✦ 마크다운으로 깔끔하게 교안 실시간 미리보기',
        '✦ [슬라이드 제작기] 클릭 한 번에 고화질 PPT 변환',
        '✦ 2022 개정 성취기준 계획서 한글(HWP)/Word 1초 복사',
      ],
    },
    ctaText: '생기부 야근도 끝납니다 ->',
  },
  {
    slideNum: 5,
    tag: 'SOLUTION 03',
    title: '학기 말 생기부 야근도\n이제 끝! 500자 세특',
    subtitle: '수업 중 기록된 관찰 데이터로 1초 만에 팩트 기반 세특 도출',
    imageFile: 'slide_05_seatuk_instant.jpg',
    bottomBox: {
      type: 'list',
      items: [
        '✦ 세특 비서 [클레어]의 2026 성취기준 1:1 맞춤형 생성',
        '✦ 나이스 500자(1,500Byte) 규격 무손실 AI 스마트 압축',
        '✦ 나이스 일괄 업로드용 표준 엑셀(.xlsx) 원클릭 다운로드',
      ],
    },
    ctaText: '마지막 혜택 확인하기 ->',
  },
  {
    slideNum: 6,
    tag: '선생님을 위한 약속',
    title: '선생님의 수업은 빛나고\n퇴근은 빨라져야 합니다',
    subtitle: '지금 바로 클래스로그와 함께 여유로운 하루를 시작하세요!',
    imageFile: 'slide_06_cta.jpg',
    bottomBox: {
      type: 'cta',
      title: '지금 프로필 링크에서 무료로 시작해 보세요!',
      desc: 'https://litt.ly/aklabs',
      sub: '저장해 두고 이번 학기에 꼭 활용해 보세요!',
    },
    ctaText: 'ClassLog by AKLABS',
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

// SVG 오버레이 템플릿 생성 함수 (1080 x 1350)
function buildCardSvg(slide, totalSlides = 6) {
  const isFirst = slide.slideNum === 1;
  const isLast = slide.slideNum === totalSlides;
  const titleLines = slide.title.split('\n');

  let bottomBoxContent = '';
  if (slide.bottomBox.type === 'highlight') {
    bottomBoxContent = `
      <rect x="60" y="1110" width="960" height="130" rx="24" fill="#FFF7ED" stroke="#FFEDD5" stroke-width="2"/>
      <rect x="88" y="1134" width="130" height="32" rx="10" fill="#EA580C"/>
      <text x="153" y="1156" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="800" font-size="15" fill="#FFFFFF">${escapeXml(slide.bottomBox.badge)}</text>
      <text x="234" y="1157" font-family="'Pretendard', sans-serif" font-weight="700" font-size="18" fill="#9A3412">${escapeXml(slide.bottomBox.text)}</text>
      <text x="88" y="1205" font-family="'Pretendard', sans-serif" font-weight="800" font-size="19" fill="#EA580C">👉 ${escapeXml(slide.ctaText)}</text>
    `;
  } else if (slide.bottomBox.type === 'list') {
    const listSvg = slide.bottomBox.items
      .map((item, idx) => `<text x="90" y="${1145 + idx * 36}" font-family="'Pretendard', sans-serif" font-weight="700" font-size="18" fill="#1E293B">${escapeXml(item)}</text>`)
      .join('\n');
    bottomBoxContent = `
      <rect x="60" y="1090" width="960" height="150" rx="24" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" filter="drop-shadow(0 4px 16px rgba(0,0,0,0.04))"/>
      ${listSvg}
    `;
  } else if (slide.bottomBox.type === 'cta') {
    bottomBoxContent = `
      <rect x="60" y="1080" width="960" height="160" rx="28" fill="url(#ctaGrad)" filter="drop-shadow(0 8px 24px rgba(234,88,12,0.25))"/>
      <text x="540" y="1132" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="900" font-size="24" fill="#FFFFFF">${escapeXml(slide.bottomBox.title)}</text>
      <text x="540" y="1172" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="800" font-size="18" fill="#FEF08A">${escapeXml(slide.bottomBox.desc)}</text>
      <text x="540" y="1210" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="700" font-size="15" fill="#FFEDD5">${escapeXml(slide.bottomBox.sub)}</text>
    `;
  }

  return `
<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgCanvas" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#EFF6FF"/>
    </linearGradient>
    
    <linearGradient id="ctaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F97316"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </linearGradient>

    <linearGradient id="tagGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EA580C"/>
      <stop offset="100%" stop-color="#C2410C"/>
    </linearGradient>

    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="20" flood-color="#0F172A" flood-opacity="0.08"/>
    </filter>
  </defs>

  <!-- 배경 캔버스 (4:5) -->
  <rect width="1080" height="1350" fill="url(#bgCanvas)"/>

  <!-- 1. 헤더 영역 (로고 배지 + 슬라이드 인디케이터) -->
  <g transform="translate(60, 50)">
    <!-- 태그 배지 -->
    <rect width="180" height="38" rx="12" fill="url(#tagGrad)"/>
    <text x="90" y="25" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="900" font-size="15" fill="#FFFFFF" letter-spacing="0.5">${escapeXml(slide.tag)}</text>

    <!-- 슬라이드 번호 (인디케이터) -->
    <rect x="850" y="0" width="110" height="38" rx="19" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="905" y="25" text-anchor="middle" font-family="'Pretendard', sans-serif" font-weight="900" font-size="16" fill="#EA580C">
      ${slide.slideNum} <tspan fill="#94A3B8" font-weight="600">/ ${totalSlides}</tspan>
    </text>
  </g>

  <!-- 2. 메인 타이틀 & 서브타이틀 -->
  <g transform="translate(60, 140)">
    <text x="0" y="44" font-family="'Pretendard', sans-serif" font-weight="900" font-size="46" fill="#0F172A" line-height="1.25" letter-spacing="-1">
      ${escapeXml(titleLines[0])}
    </text>
    ${titleLines[1] ? `<text x="0" y="100" font-family="'Pretendard', sans-serif" font-weight="900" font-size="46" fill="#0F172A" letter-spacing="-1">${escapeXml(titleLines[1])}</text>` : ''}
    <text x="0" y="${titleLines[1] ? 144 : 92}" font-family="'Pretendard', sans-serif" font-weight="700" font-size="20" fill="#64748B" letter-spacing="-0.3">
      ${escapeXml(slide.subtitle)}
    </text>
  </g>

  <!-- 3. 중앙 3D 이미지 영역 (1:1 정사각형 720 x 720 또는 클리핑 카드) -->
  <!-- 이미지는 Sharp 파이프라인에서 x: 60, y: 310, width: 960, height: 740 영역에 합성 -->

  <!-- 4. 하단 포인트 박스 & CTA -->
  ${bottomBoxContent}

  <!-- 푸터 브랜딩 워터마크 -->
  <g transform="translate(60, 1285)">
    <text x="0" y="24" font-family="'Pretendard', sans-serif" font-weight="900" font-size="20" fill="#0F172A" letter-spacing="-0.5">
      Class<tspan fill="#EA580C">Log</tspan>
    </text>
    <text x="110" y="24" font-family="'Pretendard', sans-serif" font-weight="600" font-size="14" fill="#94A3B8">| 선생님을 위한 올인원 AI 파트너</text>
    <text x="960" y="24" text-anchor="end" font-family="'Pretendard', sans-serif" font-weight="800" font-size="15" fill="#EA580C">${escapeXml(slide.ctaText)}</text>
  </g>
</svg>
`;
}

async function renderAllCards() {
  console.log('🚀 인스타그램 4:5 카드뉴스 6장 렌더링 시작...');

  for (const slide of SLIDES) {
    const inputImagePath = path.resolve('Docs/instagram_cards/01_overtime_to_early_leave', slide.imageFile);
    const outputImagePath = path.join(OUTPUT_DIR, `card_slide_0${slide.slideNum}.jpg`);

    const svgString = buildCardSvg(slide, SLIDES.length);
    const svgBuffer = Buffer.from(svgString);

    // 1. 3D 이미지를 960 x 740 크기로 둥근 사각형 리사이즈 & 크롭
    const roundedImageBuffer = await sharp(inputImagePath)
      .resize(960, 740, { fit: 'cover', position: 'center' })
      .composite([
        {
          input: Buffer.from(`
            <svg width="960" height="740">
              <rect width="960" height="740" rx="32" fill="#FFFFFF"/>
            </svg>
          `),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();

    // 2. 1080 x 1350 배경 캔버스에 SVG 텍스트 레이아웃과 3D 이미지를 정밀 합성
    await sharp(svgBuffer)
      .composite([
        {
          input: roundedImageBuffer,
          top: 310,
          left: 60,
        },
      ])
      .jpeg({ quality: 95 })
      .toFile(outputImagePath);

    console.log(`✅ [${slide.slideNum}/6] ${outputImagePath} 생성 완료!`);
  }

  console.log('🎉 모든 카드뉴스 4:5 완성본 이미지가 성공적으로 생성되었습니다!');
}

renderAllCards().catch(console.error);
