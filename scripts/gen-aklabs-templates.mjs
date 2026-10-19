#!/usr/bin/env node
// aklabs-slides 스킬의 실제 레이아웃 코드를 돌려, 웹 슬라이드 편집기(SlideObject, 1280x720)용 데이터로 바꾼다.
// 사용: node scripts/gen-aklabs-templates.mjs bright   → src/components/slidedeck/aklabs/bright.ts
// 스킬이 바뀌어도 이 스크립트만 다시 돌리면 웹 템플릿이 따라온다 (손으로 다시 그리지 않는다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL = path.join(os.homedir(), '.claude/skills/aklabs-slides');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(SKILL, 'scripts/lib', p)).href);
const { getTemplate } = await imp('tokens.mjs');
const { buildSlide } = await imp('layouts.mjs');
const { makeMascot, autoPlace } = await imp('mascot.mjs');
const { plain } = await imp('text.mjs');
const { iconSvg, ICONS } = await imp('icons.mjs');
const { donutSvg } = await imp('html.mjs');

const id = process.argv[2] || 'bright';
const T = getTemplate(id);
const S = 1280 / 1920;
const r1 = (n) => Math.round(n * S * 10) / 10;
const mc = makeMascot(SKILL);

// ── 샘플 내용: 레이아웃마다 한 장씩 (실제 수업에서 쓸 법한 내용) ──
const deck = JSON.parse(fs.readFileSync(path.join(SKILL, 'examples/vibe-coding-90.deck.json'), 'utf8'));
const pick = (i) => deck.slides[i];
const SAMPLES = [
  { key: 'cover', label: '표지', s: pick(0) },
  { key: 'roadmap', label: '오늘의 흐름(목차)', s: pick(1) },
  { key: 'section', label: '파트 시작(시간 막대)', s: pick(12) },
  { key: 'section_divider', label: '구분 표지', s: { type: 'section', section: 'PART 2', title: '이제 직접 만들어 볼까요?', sub: '손으로 먼저 그리고, 화면으로 옮겨요' } },
  { key: 'concept', label: '개념 설명(3단계)', s: pick(2) },
  { key: 'quest', label: '활동·퀘스트', s: pick(7) },
  { key: 'compare', label: '아쉬운 예 vs 좋은 예', s: pick(3) },
  { key: 'compare_rows', label: '항목별 비교', s: pick(9) },
  { key: 'examples', label: '예시 모음', s: pick(6) },
  { key: 'rules', label: '규칙 안내', s: pick(8) },
  { key: 'rules_two', label: '두 칸 안내', s: pick(10) },
  { key: 'handoff', label: '종이에서 화면으로', s: { type: 'handoff', section: 'STEP 5', time: '5분', title: '종이에서 화면으로, 마지막 공유', analog: { title: '먼저 손으로', icon: 'pencil', items: ['기획서 종이 양식에 쓰기', '친구에게 소리 내어 설명'] }, digital: { title: '그다음 화면으로', icon: 'globe', items: ['결과물 사진 저장', '공유 게시판에 올리고 댓글 달기'] }, callout: '친구 작품에 댓글 *하나* 남기기' } },
  { key: 'checklist', label: '점검 목록', s: pick(17) },
  { key: 'wrapup', label: '마무리', s: pick(23) },
];

// 템플릿 전용 장: mint는 입력 글·혼합·강조 장, calm/shark는 안내(CTA) 마무리 장이 더 있다
const mintDeck = JSON.parse(fs.readFileSync(path.join(SKILL, 'examples/mint-sample.deck.json'), 'utf8'));
if (id === 'mint') {
  SAMPLES[1] = { key: 'roadmap', label: '오늘의 흐름(목차)', s: mintDeck.slides[1] };
  SAMPLES.push({ key: 'prompt', label: '입력 글 그대로 보여주기', s: mintDeck.slides[4] });
  SAMPLES.push({ key: 'mixed', label: '글+화면 함께', s: mintDeck.slides[5] });
  SAMPLES.push({ key: 'spotlight', label: '한 문장 강조', s: mintDeck.slides[8] });
}
if (id === 'calm' || id === 'shark') {
  SAMPLES.push({ key: 'cta', label: '다음 안내(버튼)', s: { type: 'wrapup', variant: 'cta', title: '오늘 만든 기획서, 이제 직접 써 볼까요?', button: '클래스로그 AI 열기', guide: '검색창에 "클래스로그 AI"를 입력해요', brandbox: { name: 'ClassLog AI', ko: '클래스로그 AI', sub: '수업 준비를 한 길로' } } });
}

// ── 요소 → SlideObject 변환 ──
const svgUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const file = (n) => `/slide-characters/${path.basename(n)}`;
const plainText = (t) => plain(String(t ?? ''));

function convert(els) {
  const out = [];
  let z = 0;
  const push = (o) => out.push({ zIndex: ++z, ...o });
  const box = (e) => ({ x: r1(e.x), y: r1(e.y), width: r1(e.w), height: r1(e.h) });
  const rectObj = (e, fill, radius) => ({
    type: 'text', ...box(e), text: '', decorative: true,
    style: { background: fill, lineHeight: 1, ...(radius ? { borderRadius: r1(radius) } : {}), ...(e.rot ? { rotate: e.rot } : {}) },
  });
  const grad = (e) => (e.grad ? `linear-gradient(${e.grad[2]}deg,${e.grad[0]},${e.grad[1]})` : e.fill);
  for (const e of els) {
    if (e.bg) continue;
    if (e.k === 'rect' || e.k === 'ellipse') {
      const rad = e.k === 'ellipse' ? 9999 : e.r || 0;
      if (e.stroke) {
        const sw = e.sw || 2;
        push(rectObj(e, e.stroke, rad));
        const inner = { ...e, x: e.x + sw, y: e.y + sw, w: e.w - sw * 2, h: e.h - sw * 2 };
        push(rectObj(inner, grad(e) || T.bg, e.k === 'ellipse' ? 9999 : Math.max(0, rad - sw)));
      } else if (grad(e)) {
        push(rectObj(e, grad(e), rad));
      }
    } else if (e.k === 'text') {
      const text = plainText(e.text);
      if (!text) continue;
      push({
        type: 'text', ...box(e), text,
        style: {
          fontSize: r1(e.size), color: e.color, align: e.align, bold: e.weight >= 600,
          lineHeight: e.lh, valign: e.valign, ...(e.ls ? { letterSpacing: r1(e.ls) } : {}),
          fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
        },
      });
    } else if (e.k === 'icon') {
      push({ type: 'image', ...box(e), src: svgUri(iconSvg(e.name, e.color, 96, e.sw)), alt: '', decorative: true, style: { fit: 'contain' } });
    } else if (e.k === 'arrow') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 24"><path d="M2 12h32M24 3l11 9-11 9" fill="none" stroke="${e.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      push({ type: 'image', ...box(e), src: svgUri(svg), alt: '', decorative: true, style: { fit: 'contain' } });
    } else if (e.k === 'blockarrow') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 64" preserveAspectRatio="none"><path d="M0 18h56V0l44 32-44 32V46H0z" fill="${e.color}"/></svg>`;
      push({ type: 'image', ...box(e), src: svgUri(svg), alt: '', decorative: true, style: { fit: 'fill' } });
    } else if (e.k === 'donut') {
      push({ type: 'image', ...box(e), src: svgUri(donutSvg(e, '')), alt: '', decorative: true, style: { fit: 'contain' } });
    } else if (e.k === 'img') {
      const mascot = String(e.src).includes('/assets/characters/');
      push({ type: 'image', ...box(e), src: mascot ? file(e.src) : e.src, alt: mascot ? '캐릭터' : '', decorative: mascot, style: { fit: e.fit === 'cover' ? 'cover' : 'contain' } });
    }
  }
  return out;
}

// AI 초안이 채울 수 있는 글 칸 — 표지(cover)와 개념 설명(concept)만 (웹 편집기의 4가지 기본 구성이 이 둘로 이어진다)
// 샘플 문장과 똑같은 글상자를 찾아 칸으로 삼는다.
function fillsFor(key, s, objects) {
  const want = [];
  if (key === 'cover') want.push(['슬라이드 제목(첫 줄)', s.title, 24], ['크게 강조할 말', s.big, 8], ['부제목', s.sub, 40]);
  if (key === 'concept') {
    want.push(['슬라이드 제목', s.title, 24], ['핵심 한 줄 설명', s.lead, 44]);
    (s.steps || []).forEach((st, n) => want.push([`${n + 1}단계 이름`, st.t, 12], [`${n + 1}단계 설명`, st.d, 26]));
    want.push(['하단 요점 문장', s.callout?.text, 44]);
  }
  const fills = [];
  for (const [role, txt, maxChars] of want) {
    if (!txt) continue;
    const idx = objects.findIndex((o, i) => o.type === 'text' && o.text === plainText(txt) && !fills.some((f) => f.objectIndex === i));
    if (idx >= 0) fills.push({ objectIndex: idx, role, maxChars });
  }
  return fills;
}

// ── 샘플마다 레이아웃 실행 (render.mjs와 같은 마스코트 정책) ──
const slides = [];
const used = new Set();
// 캐릭터 정책(render.mjs와 같음): bright·shark 기본 켬, mint는 핵심 장면만, calm은 없음
const MINT_KEY = new Set(['cover', 'section', 'wrapup', 'spotlight', 'prompt']);
const mascotOn = id !== 'calm';
SAMPLES.forEach(({ key, label, s }, i) => {
  const keyScene = id !== 'mint' || (MINT_KEY.has(s.type) && !(s.type === 'section' && s.segments));
  const mood = mascotOn && keyScene ? mc.pick(s, i) : null;
  const ctx = { page: i + 1, warn: (m) => console.warn('⚠', key, m), char: (t) => (mood && t.char ? mc.file(mood) : null), pose: () => (mood ? mc.file(mood) : null), asset: (p) => p };
  let els = buildSlide(s, T, ctx);
  if (mood && !els.some((e) => e.k === 'img' && String(e.src).includes('/assets/characters/'))) {
    const m = autoPlace(els, mood, mc);
    if (m) els = [...els, m];
  }
  els.filter((e) => e.k === 'img' && String(e.src).includes('/assets/characters/')).forEach((e) => used.add(e.src));
  const objects = convert(els);
  slides.push({ key, label, type: s.type, objects, fills: fillsFor(key, s, objects) });
});

// 마스코트 PNG 복사
const pubDir = path.join(ROOT, 'public/slide-characters');
fs.mkdirSync(pubDir, { recursive: true });
for (const src of used) fs.copyFileSync(src, path.join(pubDir, path.basename(src)));

const bgEl = buildSlide(SAMPLES[0].s, T, { page: 1, warn() {}, char: () => null, pose: () => null, asset: (p) => p }).find((e) => e.bg);
const bg = bgEl?.grad ? `linear-gradient(${bgEl.grad[2]}deg,${bgEl.grad[0]},${bgEl.grad[1]})` : bgEl?.fill || T.bg;

const outDir = path.join(ROOT, 'src/components/slidedeck/aklabs');
fs.mkdirSync(outDir, { recursive: true });
const body = `// 자동 생성 파일 — 직접 고치지 마세요. (scripts/gen-aklabs-templates.mjs ${id})
import type { AklabsShowcase } from './types';

export const ${id.toUpperCase()}_SHOWCASE: AklabsShowcase = ${JSON.stringify({ id, label: T.label, bg, textColor: T.ink, accentColor: T.primary, slides }, null, 1)};
`;
fs.writeFileSync(path.join(outDir, `${id}.ts`), body);
console.log(`✓ ${id}: 슬라이드 ${slides.length}장, 요소 ${slides.reduce((a, s) => a + s.objects.length, 0)}개, 캐릭터 ${used.size}종`);
