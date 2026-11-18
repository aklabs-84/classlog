import { useMemo } from 'react';

// 가이드 글 속 "그림 설명 칸"(```visual 코드 상자)을 격리된 작은 방(iframe)에 그려 준다.
// 보안: sandbox="" 라서 스크립트·폼·팝업·부모 페이지 접근이 전부 막히고, CSP로 바깥 연결도 막는다(글·그림·색·CSS 애니메이션만 허용).
export const VISUAL_LANG_RE = /^visual(?:-(\d{1,2})x(\d{1,2}))?$/;
const MAX_HTML_CHARS = 16000; // 한 칸 약 8~16KB 한도(한글은 글자당 3바이트라 글자 수 기준)

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
const BASE_CSS = 'html,body{margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:#1f2937;background:#fff;line-height:1.5;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}';

export const parseVisualRatio = (lang: string): [number, number] | null => {
  const m = VISUAL_LANG_RE.exec(lang);
  if (!m) return null;
  const w = m[1] ? Number(m[1]) : 16;
  const h = m[2] ? Number(m[2]) : 9;
  return w > 0 && h > 0 ? [w, h] : [16, 9];
};

const VisualBlock = ({ html, ratio }: { html: string; ratio: [number, number] }) => {
  const tooBig = html.length > MAX_HTML_CHARS;
  const srcDoc = useMemo(
    () => (tooBig ? '' : `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}</style></head><body>${html}</body></html>`),
    [html, tooBig],
  );
  if (tooBig) {
    return <p className="my-3 rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">그림 설명 칸이 너무 커서 보여 줄 수 없어요. 내용을 줄여 주세요.</p>;
  }
  return (
    <div className="my-4 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ aspectRatio: `${ratio[0]} / ${ratio[1]}` }}>
      <iframe
        title="그림 설명"
        sandbox=""
        srcDoc={srcDoc}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block h-full w-full border-0"
      />
    </div>
  );
};

export default VisualBlock;
