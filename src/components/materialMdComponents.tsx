import CodeBlock from './CodeBlock';
import { renderCallout } from './PresentationModal';

// ── 마크다운 컴포넌트 렌더러 ──────────────────────────────────────────────────
export const mdComponents: any = {
  h1: ({ children }: any) => <h1 className="text-2xl font-black mb-4 mt-6 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-black mb-3 mt-5 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-black mb-2 mt-4 text-on-surface">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 leading-relaxed text-sm text-on-surface">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
  ol: ({ children, start }: any) => <ol start={start} className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-on-surface">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-xl">
      {children}
    </blockquote>
  ),
  // 인라인 코드 (className 없는 경우)
  code: ({ children, className }: any) => {
    if (!className) {
      return <code className="bg-surface-container px-1.5 py-0.5 rounded text-sm font-mono text-primary">{children}</code>;
    }
    // 블록 코드는 pre에서 처리하므로 그대로 전달
    return <code className={className}>{children}</code>;
  },
  // 블록 코드 — CodeBlock 컴포넌트 사용
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const className = child?.props?.className || '';
    const lang = className.replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">
      {children}
    </a>
  ),
  img: ({ src, alt, title }: any) => {
    const wm = (title || '').match(/(?:^|,)width:(\d+)/);
    const style = wm ? { width: `${wm[1]}px`, maxWidth: '100%' } : undefined;
    return <img src={src} alt={alt} style={style} className="max-w-full rounded-xl my-3 shadow" />;
  },
  hr: () => <hr className="border-surface-container my-5" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-3">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-surface-container px-3 py-2">{children}</td>
  ),
  details: ({ children }: any) => (
    <details className="my-3 rounded-xl border border-surface-container overflow-hidden">
      {children}
    </details>
  ),
  summary: ({ children }: any) => (
    <summary className="px-4 py-2.5 bg-surface-container-low cursor-pointer font-black text-sm list-none flex items-center gap-2 select-none hover:bg-surface-container transition-colors">
      <span className="text-primary text-xs">▶</span> {children}
    </summary>
  ),
  div: (props: any) => renderCallout(props, false),
};
