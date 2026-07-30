import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockExt from '@tiptap/extension-code-block';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, NodeSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Suggestion from '@tiptap/suggestion';
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import type { Ref } from 'react';
import {
  Bold, Italic, List, ListOrdered, Quote, Code, Code2,
  Link2, ImageIcon, Minus, Loader2, Globe, ChevronRight, X,
  Copy, Check, Table2, Plus, Trash2, ArrowRightToLine, ArrowDownToLine,
  MonitorPlay, Palette, Lightbulb, Scissors, Lock, Unlock, ClipboardPaste,
} from 'lucide-react';

// ── 슬래시 명령어 목록 ────────────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { icon: 'H1', title: '제목 1',    description: '크고 굵은 제목',    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { icon: 'H2', title: '제목 2',    description: '중간 크기 제목',    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { icon: 'H3', title: '제목 3',    description: '소제목',            command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { icon: '•',  title: '글머리 목록', description: '순서 없는 목록',  command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { icon: '1.', title: '번호 목록', description: '순서 있는 목록',    command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { icon: '❝',  title: '인용구',    description: '인용 텍스트 블록',  command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { icon: '</>', title: '코드 블록', description: '코드 스니펫',      command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { icon: '—',  title: '구분선',    description: '슬라이드 구분선',   command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { icon: '▶',  title: '토글 블록', description: '접을 수 있는 내용', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'details', attrs: { summary: '토글 제목' }, content: [{ type: 'paragraph' }] }).run() },
  { icon: '💡', title: '콜아웃',    description: '강조 박스 (정보/주의/팁/중요)', command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertContent({ type: 'callout', attrs: { type: 'info' }, content: [{ type: 'paragraph' }] }).run() },
  { icon: '⊞',  title: '표',       description: '표 삽입 (3×3)',     command: ({ editor, range }: any) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { icon: '▶',  title: '영상 임베드', description: 'YouTube 등 영상 삽입', command: ({ editor, range }: any) => { editor.chain().focus().deleteRange(range).run(); (window as any).__openEmbedDialog?.(); } },
] as const;

type SlashItem = { icon: string; title: string; description: string; command: (p: any) => void };

// ── 슬래시 명령어 팝업 컴포넌트 ──────────────────────────────────────────────
interface CmdListHandle { onKeyDown: (p: { event: KeyboardEvent }) => boolean }

const CommandListComponent = forwardRef(
  ({ items, command }: { items: readonly SlashItem[]; command: (item: SlashItem) => void }, ref: Ref<CmdListHandle>) => {
    const [sel, setSel] = useState(0);

    useEffect(() => setSel(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === 'ArrowUp')   { setSel(i => (i - 1 + items.length) % items.length); return true; }
        if (event.key === 'ArrowDown') { setSel(i => (i + 1) % items.length); return true; }
        if (event.key === 'Enter')     { if (items[sel]) command(items[sel]); return true; }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-white rounded-2xl shadow-xl border border-surface-container px-4 py-3 w-56">
          <p className="text-xs text-on-surface-variant font-bold text-center">명령어 없음</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl shadow-xl border border-surface-container overflow-hidden py-1.5 w-60 max-h-72 overflow-y-auto">
        <p className="px-3 pt-1 pb-1.5 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">블록 삽입</p>
        {(items as SlashItem[]).map((item, index) => (
          <button
            key={index}
            onMouseDown={e => e.preventDefault()}
            onClick={() => command(item)}
            className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
              index === sel ? 'bg-primary/10' : 'hover:bg-surface-container-low'
            }`}
          >
            <span className={`w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-black shrink-0 ${
              index === sel ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
            }`}>
              {item.icon}
            </span>
            <div>
              <p className={`font-black text-xs ${index === sel ? 'text-primary' : 'text-on-surface'}`}>{item.title}</p>
              <p className="text-[10px] text-on-surface-variant">{item.description}</p>
            </div>
          </button>
        ))}
      </div>
    );
  }
);
CommandListComponent.displayName = 'CommandListComponent';

// ── 슬래시 명령어 Extension ───────────────────────────────────────────────────
const SlashCommandExtension = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }: { query: string }) =>
          SLASH_COMMANDS.filter(
            item =>
              !query ||
              item.title.toLowerCase().includes(query.toLowerCase()) ||
              item.description.toLowerCase().includes(query.toLowerCase()),
          ) as unknown as SlashItem[],
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
        render: () => {
          let component: ReactRenderer;
          let container: HTMLDivElement;

          const setPos = (clientRect: (() => DOMRect | null) | null) => {
            if (!clientRect || !container) return;
            const rect = clientRect();
            if (!rect) return;
            const top = rect.bottom + 4;
            const left = rect.left;
            const menuH = 300;
            container.style.top = top + menuH > window.innerHeight
              ? `${rect.top - menuH - 4}px`
              : `${top}px`;
            container.style.left = `${Math.min(left, window.innerWidth - 260)}px`;
          };

          return {
            onStart(props: any) {
              container = document.createElement('div');
              container.style.cssText = 'position:fixed;z-index:9999;pointer-events:auto';
              document.body.appendChild(container);
              component = new ReactRenderer(CommandListComponent, { props, editor: props.editor });
              container.appendChild(component.element);
              setPos(props.clientRect);
            },
            onUpdate(props: any) {
              component.updateProps(props);
              setPos(props.clientRect);
            },
            onKeyDown(props: any) {
              if (props.event.key === 'Escape') return true;
              return (component.ref as any)?.onKeyDown(props) ?? false;
            },
            onExit() {
              container?.remove();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});

// ── 노드 삭제 헬퍼 ────────────────────────────────────────────────────────────
const deleteNodeAt = (editor: NodeViewProps['editor'], getPos: NodeViewProps['getPos'], nodeSize: number) => {
  if (typeof getPos !== 'function') return;
  const pos = getPos();
  if (typeof pos !== 'number') return;
  const tr = editor.view.state.tr.delete(pos, pos + nodeSize);
  editor.view.dispatch(tr);
};

// ── 리사이즈 가능한 이미지 NodeView ──────────────────────────────────────────
const ResizableImageView = ({ node, selected, editor, getPos }: NodeViewProps) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null);
  const [ratioLocked, setRatioLocked] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFeedback = (msg: string) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setFeedback(msg);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 1400);
  };
  useEffect(() => () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); }, []);

  const width = node.attrs.width as number | null;
  const height = node.attrs.height as number | null;

  // 너비/높이 입력창은 node.attrs로 직접 제어(controlled)하면, 20px 미만처럼
  // 아직 커밋되지 않는 중간 입력값(예: "250" 중 "2")마다 React가 값을 빈
  // 문자열로 되돌려버려 두 자리 이상 숫자를 입력할 수 없게 된다. 화면에
  // 보이는 텍스트는 별도의 draft 상태로 두고, 유효한 값이 될 때만
  // attrs에 반영한다.
  const [widthDraft, setWidthDraft] = useState(width != null ? String(width) : '');
  const [heightDraft, setHeightDraft] = useState(height != null ? String(height) : '');
  useEffect(() => { setWidthDraft(width != null ? String(width) : ''); }, [width]);
  useEffect(() => { setHeightDraft(height != null ? String(height) : ''); }, [height]);

  const getRatio = () => {
    const nat = naturalSizeRef.current;
    if (nat && nat.w && nat.h) return nat.w / nat.h;
    if (width && height) return width / height;
    return null;
  };

  // NodeView가 렌더링하는 <input>은 팝업이 `selected` prop에 의해 조건부로
  // 마운트되는데, 일반 updateAttributes()가 만드는 setNodeMarkup 트랜잭션은
  // ProseMirror가 해당 위치를 "삭제 후 재삽입"으로 매핑해 NodeSelection이
  // TextSelection으로 강등되고, 그 결과 selected가 false로 바뀌어 팝업(및
  // 포커스 중인 입력창)이 통째로 언마운트된다. 같은 트랜잭션 안에서
  // NodeSelection을 명시적으로 재설정해 이 문제를 막는다.
  const updateAttrsKeepSelected = (attrs: Record<string, unknown>) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      return true;
    }).run();
  };

  const applyWidth = (newW: number) => {
    if (!Number.isFinite(newW) || newW < 20) return;
    const w = Math.round(newW);
    if (ratioLocked) {
      const ratio = getRatio();
      if (ratio) { updateAttrsKeepSelected({ width: w, height: Math.round(w / ratio) }); return; }
    }
    updateAttrsKeepSelected({ width: w });
  };

  const applyHeight = (newH: number) => {
    if (!Number.isFinite(newH) || newH < 20) return;
    const h = Math.round(newH);
    if (ratioLocked) {
      const ratio = getRatio();
      if (ratio) { updateAttrsKeepSelected({ height: h, width: Math.round(h * ratio) }); return; }
    }
    updateAttrsKeepSelected({ height: h });
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    startX.current = e.clientX;
    startW.current = imgRef.current?.getBoundingClientRect().width ?? (node.attrs.width as number) ?? 300;

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newW = Math.max(80, Math.round(startW.current + (ev.clientX - startX.current)));
      if (ratioLocked && node.attrs.height) {
        const ratio = getRatio();
        if (ratio) { updateAttrsKeepSelected({ width: newW, height: Math.round(newW / ratio) }); return; }
      }
      updateAttrsKeepSelected({ width: newW });
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper as="span" className="relative inline-block align-top mx-1 my-1" style={{ maxWidth: '100%' }}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt ?? ''}
        onLoad={() => { if (imgRef.current) naturalSizeRef.current = { w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight }; }}
        onMouseDown={e => {
          // 인접한 이미지 사이 경계에서 브라우저의 기본 클릭 판정이 애매해지는 것을 막기 위해
          // 클릭한 이미지를 명시적으로 NodeSelection으로 지정 (엉뚱한 위치로 스크롤되는 문제도 함께 방지)
          if (typeof getPos !== 'function') return;
          e.preventDefault();
          e.stopPropagation();
          const pos = getPos();
          if (typeof pos === 'number') editor.chain().setNodeSelection(pos).focus().run();
        }}
        style={{ width: width ? `${width}px` : 'auto', height: height ? `${height}px` : 'auto', maxWidth: '100%', display: 'block' }}
        className={`rounded-xl shadow transition-all select-none ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
        draggable={false}
      />
      {selected && (
        <>
          <div
            className="absolute -top-11 left-0 flex items-center gap-1 bg-surface border border-surface-container rounded-xl shadow-lg px-1.5 py-1 z-20"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="number"
              value={widthDraft}
              onChange={e => {
                setWidthDraft(e.target.value);
                const v = parseInt(e.target.value);
                if (!Number.isNaN(v)) applyWidth(v);
              }}
              placeholder="W"
              title="너비 (px)"
              className="w-12 px-1 py-0.5 text-[11px] font-bold bg-surface-container rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-center"
            />
            <span className="text-[10px] text-on-surface-variant">×</span>
            <input
              type="number"
              value={heightDraft}
              onChange={e => {
                setHeightDraft(e.target.value);
                const v = parseInt(e.target.value);
                if (!Number.isNaN(v)) applyHeight(v);
              }}
              placeholder="H"
              title="높이 (px)"
              className="w-12 px-1 py-0.5 text-[11px] font-bold bg-surface-container rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-center"
            />
            <button
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setRatioLocked(v => !v); }}
              title={ratioLocked ? '가로세로 비율 고정됨 (클릭하여 해제)' : '비율 고정 해제됨 (클릭하여 고정)'}
              className={`p-1 rounded-md transition-colors ${ratioLocked ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
            >
              {ratioLocked ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
            <div className="w-px h-4 bg-surface-container mx-0.5" />
            <button
              onMouseDown={e => {
                e.preventDefault(); e.stopPropagation();
                (editor as any).emit('image-clipboard', { mode: 'copy', attrs: { ...node.attrs } });
                showFeedback('이미지가 복사되었습니다');
              }}
              title="이미지 복사"
              className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
            >
              <Copy size={12} />
            </button>
            <button
              onMouseDown={e => {
                e.preventDefault(); e.stopPropagation();
                (editor as any).emit('image-clipboard', { mode: 'cut', attrs: { ...node.attrs } });
                deleteNodeAt(editor, getPos, node.nodeSize);
              }}
              title="이미지 잘라내기"
              className="p-1 rounded-md text-on-surface-variant hover:bg-surface-container hover:text-red-500 transition-colors"
            >
              <Scissors size={12} />
            </button>
          </div>
          {feedback && (
            <div className="absolute -top-11 left-0 translate-y-[calc(-100%-4px)] bg-on-surface text-surface text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-lg z-30 whitespace-nowrap pointer-events-none">
              {feedback}
            </div>
          )}
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); deleteNodeAt(editor, getPos, node.nodeSize); }}
            className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center z-10 transition-colors"
            title="이미지 삭제"
          >
            <X size={12} />
          </button>
          <div
            className="absolute bottom-0 right-0 w-5 h-5 bg-primary rounded-tl-lg cursor-se-resize z-10 flex items-center justify-center"
            onMouseDown={onResizeStart}
            title="드래그하여 크기 조절"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1 8L8 1M4 8L8 4M7 8L8 7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          {(width || height) && (
            <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono pointer-events-none">
              {width ?? '자동'}×{height ?? '자동'}
            </div>
          )}
        </>
      )}
    </NodeViewWrapper>
  );
};

// ── Image 확장 (width 속성 + NodeView + markdown 직렬화) ─────────────────────
const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // alt는 커스텀 parseHTML이 없으면 tiptap 코어가 숫자로만 된 문자열을 자동으로
      // Number로 변환해버려(fromString), 순수 숫자 alt를 가진 이미지의 마크다운 직렬화가 깨짐 — 항상 문자열로 고정
      alt: {
        default: null,
        parseHTML: el => el.getAttribute('alt'),
      },
      title: {
        default: null,
        parseHTML: el => {
          const t = el.getAttribute('title') || '';
          return t.replace(/^(width:\d+)?,?(height:\d+)?$/, '').trim() || null;
        },
        renderHTML: attrs => attrs.title ? { title: attrs.title } : {},
      },
      width: {
        default: null,
        parseHTML: el => {
          const w = el.getAttribute('width');
          if (w) return parseInt(w);
          const m = (el.getAttribute('title') || '').match(/(?:^|,)width:(\d+)/);
          return m ? parseInt(m[1]) : null;
        },
        renderHTML: attrs => {
          if (!attrs.width) return {};
          return { width: attrs.width, style: `width:${attrs.width}px;max-width:100%` };
        },
      },
      height: {
        default: null,
        parseHTML: el => {
          const h = el.getAttribute('height');
          if (h) return parseInt(h);
          const m = (el.getAttribute('title') || '').match(/(?:^|,)height:(\d+)/);
          return m ? parseInt(m[1]) : null;
        },
        renderHTML: attrs => {
          if (!attrs.height) return {};
          return { height: attrs.height, style: `height:${attrs.height}px` };
        },
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const src = (node.attrs.src || '').replace(/[\(\)]/g, '\\$&');
          const alt = state.esc(String(node.attrs.alt ?? ''));
          const dims = [
            node.attrs.width ? `width:${node.attrs.width}` : null,
            node.attrs.height ? `height:${node.attrs.height}` : null,
          ].filter(Boolean);
          const titlePart = dims.length
            ? ` "${dims.join(',')}"`
            : node.attrs.title ? ` "${node.attrs.title}"` : '';
          state.write(`![${alt}](${src}${titlePart})`);
        },
        parse: {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

// ── Details (Toggle) NodeView ─────────────────────────────────────────────────
const DetailsView = ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
  const [summary, setSummary] = useState<string>(node.attrs.summary || '토글 제목');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSummary(node.attrs.summary || '토글 제목');
  }, [node.attrs.summary]);

  return (
    <NodeViewWrapper>
      <div className={`my-2 rounded-xl border-2 overflow-hidden transition-colors ${selected ? 'border-primary' : 'border-surface-container'}`}>
        <div className={`flex items-center gap-2 px-4 py-2.5 bg-surface-container-low transition-colors ${open ? 'border-b border-surface-container' : ''}`}>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            className="p-0.5 rounded hover:bg-surface-container transition-colors shrink-0"
            title={open ? '접기' : '펼치기'}
          >
            <ChevronRight
              size={14}
              className={`text-primary transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            />
          </button>
          <input
            type="text"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            onBlur={() => updateAttributes({ summary })}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="font-black text-sm flex-1 outline-none bg-transparent text-on-surface cursor-text"
            placeholder="토글 제목"
          />
          <span className="text-[10px] text-on-surface-variant/40 font-bold shrink-0">TOGGLE</span>
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); deleteNodeAt(editor, getPos, node.nodeSize); }}
            className="p-1 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
            title="토글 블록 삭제"
          >
            <X size={13} />
          </button>
        </div>
        <div className={open ? '' : 'hidden'}>
          <NodeViewContent className="px-4 py-3 min-h-[2.5rem] text-sm" />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

// ── Details (Toggle) Extension ────────────────────────────────────────────────
const DetailsExtension = Node.create({
  name: 'details',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      summary: { default: '토글 제목' },
    };
  },

  parseHTML() {
    return [{
      tag: 'details',
      getAttrs: node => ({
        summary: (node as HTMLElement).querySelector(':scope > summary')?.textContent?.trim() || '토글',
      }),
      contentElement: node => {
        const el = node as HTMLElement;
        const wrapper = document.createElement('div');
        el.childNodes.forEach(child => {
          if ((child as HTMLElement).tagName?.toLowerCase() !== 'summary') {
            wrapper.appendChild(child.cloneNode(true));
          }
        });
        return wrapper;
      },
    }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const summary = (node.attrs.summary || '토글')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          state.write(`<details>\n<summary>${summary}</summary>\n\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write('</details>\n\n');
        },
        parse: {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DetailsView);
  },
});

// ── 콜아웃(Callout) — 노션 스타일 강조 박스 ───────────────────────────────────
const CALLOUT_TYPES: Record<string, { icon: string; label: string; classes: string }> = {
  info: { icon: '💡', label: '정보', classes: 'bg-blue-50 border-blue-300' },
  warning: { icon: '⚠️', label: '주의', classes: 'bg-amber-50 border-amber-300' },
  tip: { icon: '✅', label: '팁', classes: 'bg-emerald-50 border-emerald-300' },
  important: { icon: '❗', label: '중요', classes: 'bg-red-50 border-red-300' },
};
const CALLOUT_ORDER = ['info', 'warning', 'tip', 'important'];

const CalloutView = ({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) => {
  const type = CALLOUT_TYPES[node.attrs.type] ? node.attrs.type : 'info';
  const meta = CALLOUT_TYPES[type];

  const cycleType = () => {
    const idx = CALLOUT_ORDER.indexOf(type);
    updateAttributes({ type: CALLOUT_ORDER[(idx + 1) % CALLOUT_ORDER.length] });
  };

  return (
    <NodeViewWrapper>
      <div className={`group my-2 rounded-xl border-2 flex gap-2 px-4 py-3 transition-colors ${meta.classes} ${selected ? 'ring-2 ring-primary' : ''}`}>
        <button
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); cycleType(); }}
          className="shrink-0 text-lg leading-none mt-0.5 hover:opacity-70 transition-opacity"
          title={`클릭하여 콜아웃 종류 변경 (현재: ${meta.label})`}
          contentEditable={false}
        >
          {meta.icon}
        </button>
        <NodeViewContent className="flex-1 min-w-0 text-sm [&>p]:m-0" />
        <button
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); deleteNodeAt(editor, getPos, node.nodeSize); }}
          className="shrink-0 self-start p-1 rounded-lg text-black/30 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-colors"
          title="콜아웃 삭제"
        >
          <X size={13} />
        </button>
      </div>
    </NodeViewWrapper>
  );
};

const CalloutExtension = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-callout') || 'info',
        renderHTML: (attrs: { type: string }) => ({ 'data-callout': attrs.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const type = CALLOUT_TYPES[node.attrs.type] ? node.attrs.type : 'info';
          state.write(`<div data-callout="${type}">\n\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write('</div>\n\n');
        },
        parse: {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

// ── 코드블록 NodeView (복사 버튼 포함) ───────────────────────────────────────
const CodeBlockView = ({ node }: NodeViewProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const code = node.textContent;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <NodeViewWrapper className="relative my-3 group">
      <pre className="bg-[#1e293b] rounded-xl px-5 py-4 overflow-x-auto">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <NodeViewContent as={"code" as any} className="text-[#e2e8f0] text-sm font-mono" />
      </pre>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={handleCopy}
        className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-[11px] font-bold transition-all opacity-0 group-hover:opacity-100"
        title="코드 복사"
      >
        {copied ? <><Check size={11} /> 복사됨</> : <><Copy size={11} /> 복사</>}
      </button>
    </NodeViewWrapper>
  );
};

const CustomCodeBlock = CodeBlockExt.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

// ── 구분선 자동 보정 ──────────────────────────────────────────────────────────
// "---"만 입력하면 즉시 구분선(hr)로 바뀌는 내장 입력 규칙이 한글 입력기/붙여넣기 등의
// 타이밍 이슈로 가끔 놓쳐서 "---" 글자가 그대로 남는 경우가 있음.
// 커서가 그 문단을 벗어난 뒤 "---"만 단독으로 남아있으면 자동으로 구분선으로 바꿔 보정한다.
const HR_ONLY_TEXT = new Set(['---', '___', '***', '—-']);

const AutoHorizontalRule = Extension.create({
  name: 'autoHorizontalRule',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return null;
          const cursorPos = newState.selection.from;
          let tr: Transaction | null = null;
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph') return;
            if (cursorPos > pos && cursorPos < pos + node.nodeSize) return; // 편집 중인 문단은 건드리지 않음
            if (!HR_ONLY_TEXT.has(node.textContent.trim())) return;
            if (!tr) tr = newState.tr;
            const from = tr.mapping.map(pos);
            const to = tr.mapping.map(pos + node.nodeSize);
            tr.replaceWith(from, to, newState.schema.nodes.horizontalRule.create());
          });
          return tr;
        },
      }),
    ];
  },
});

// ── 색상 프리셋 ───────────────────────────────────────────────────────────────
const TABLE_COLORS = [
  { label: '기본', hex: null },
  { label: '파랑', hex: '#dbeafe' },
  { label: '하늘', hex: '#e0f2fe' },
  { label: '초록', hex: '#dcfce7' },
  { label: '민트', hex: '#ccfbf1' },
  { label: '보라', hex: '#ede9fe' },
  { label: '분홍', hex: '#fce7f3' },
  { label: '주황', hex: '#ffedd5' },
  { label: '노랑', hex: '#fef9c3' },
  { label: '회색', hex: '#f3f4f6' },
];

const TEXT_COLORS = [
  { label: '기본', hex: null },
  { label: '빨강', hex: '#ef4444' },
  { label: '주황', hex: '#f97316' },
  { label: '노랑', hex: '#ca8a04' },
  { label: '초록', hex: '#16a34a' },
  { label: '하늘', hex: '#0284c7' },
  { label: '파랑', hex: '#2563eb' },
  { label: '보라', hex: '#7c3aed' },
  { label: '분홍', hex: '#db2777' },
  { label: '회색', hex: '#6b7280' },
];

// ── 셀 → HTML 텍스트 변환 (색상 보존 직렬화용) ────────────────────────────────
const cellToHtml = (cellNode: any): string => {
  const renderInline = (node: any): string => {
    if (node.type.name === 'text') {
      let t = (node.text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      for (const mark of (node.marks || [])) {
        if (mark.type.name === 'bold') t = `<strong>${t}</strong>`;
        else if (mark.type.name === 'italic') t = `<em>${t}</em>`;
        else if (mark.type.name === 'code') t = `<code>${t}</code>`;
        else if (mark.type.name === 'link') t = `<a href="${mark.attrs.href}">${t}</a>`;
      }
      return t;
    }
    if (node.type.name === 'hardBreak') return '<br>';
    let s = '';
    node.forEach?.((child: any) => { s += renderInline(child); });
    return s;
  };
  let html = '';
  cellNode.forEach((block: any) => {
    if (block.type.name === 'paragraph') {
      block.forEach((inline: any) => { html += renderInline(inline); });
    }
  });
  return html;
};

// ── 색상 지원 표 확장 ─────────────────────────────────────────────────────────
const ColorableTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      headerBgColor: {
        default: null,
        parseHTML: (el) => {
          const m = (el.getAttribute('style') || '').match(/--table-header-bg:\s*([^;]+)/);
          return m ? m[1].trim() : null;
        },
        renderHTML: (attrs) => attrs.headerBgColor
          ? { style: `--table-header-bg:${attrs.headerBgColor}` }
          : {},
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { headerBgColor } = node.attrs;
          const tableStyle = headerBgColor ? ` style="--table-header-bg:${headerBgColor}"` : '';
          state.write(`<table${tableStyle}>\n<tbody>\n`);
          node.forEach((row: any) => {
            state.write('<tr>');
            row.forEach((cell: any) => {
              const isHeader = cell.type.name === 'tableHeader';
              const tag = isHeader ? 'th' : 'td';
              const bg: string | null = cell.attrs?.backgroundColor ?? null;
              const cellStyle = bg ? ` style="background-color:${bg}"` : '';
              state.write(`<${tag}${cellStyle}>${cellToHtml(cell)}</${tag}>`);
            });
            state.write('</tr>\n');
          });
          state.write('</tbody>\n</table>\n\n');
        },
        parse: {},
      },
    };
  },
});

const ColorableTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.style.backgroundColor || null,
        renderHTML: (attrs) => attrs.backgroundColor
          ? { style: `background-color:${attrs.backgroundColor}` }
          : {},
      },
    };
  },
});

const ColorableTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (el) => el.style.backgroundColor || null,
        renderHTML: (attrs) => attrs.backgroundColor
          ? { style: `background-color:${attrs.backgroundColor}` }
          : {},
      },
    };
  },
});

// ── 표 색상 피커 팝오버 ───────────────────────────────────────────────────────
const TableColorModal = ({
  title,
  presets = TABLE_COLORS,
  defaultHex = '#dbeafe',
  onSelect,
  onClose,
}: {
  title: string;
  presets?: { label: string; hex: string | null }[];
  defaultHex?: string;
  onSelect: (color: string | null) => void;
  onClose: () => void;
}) => {
  const [customHex, setCustomHex] = useState(defaultHex);
  const [preview, setPreview] = useState<string | null>(null);

  const applyColor = (color: string | null) => {
    onSelect(color);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-[420px] p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-primary" />
            <h3 className="font-black text-base">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-neutral-100 text-neutral-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 프리셋 색상 */}
        <div>
          <p className="text-[11px] font-black text-neutral-400 mb-3">프리셋 색상</p>
          <div className="grid grid-cols-5 gap-2">
            {presets.map(color => (
              <button
                key={color.label ?? 'default'}
                title={color.label}
                onClick={() => {
                  if (color.hex) {
                    setCustomHex(color.hex);
                    setPreview(color.hex);
                  } else {
                    setPreview(null);
                  }
                }}
                className={[
                  'group relative h-10 rounded-xl border-2 transition-all hover:scale-105 hover:shadow-md',
                  preview === color.hex || (!color.hex && preview === null)
                    ? 'border-primary ring-2 ring-primary/30 scale-105'
                    : 'border-neutral-200',
                  !color.hex ? 'bg-white' : '',
                ].join(' ')}
                style={color.hex ? { backgroundColor: color.hex } : {}}
              >
                {!color.hex && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="text-neutral-300">
                      <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="20" y1="4" x2="4" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                )}
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-black text-neutral-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {color.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 직접 입력 */}
        <div>
          <p className="text-[11px] font-black text-neutral-400 mb-3">직접 입력</p>
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer shrink-0">
              <input
                type="color"
                value={customHex}
                onChange={e => { setCustomHex(e.target.value); setPreview(e.target.value); }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div
                className="w-10 h-10 rounded-xl border-2 border-neutral-200 shadow-sm"
                style={{ backgroundColor: customHex }}
              />
            </label>
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-neutral-400">#</span>
              <input
                type="text"
                value={customHex.replace('#', '')}
                maxLength={6}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '');
                  const full = `#${raw}`;
                  setCustomHex(full);
                  if (raw.length === 6) setPreview(full);
                }}
                placeholder="dbeafe"
                className="w-full pl-7 pr-3 py-2.5 bg-neutral-50 rounded-xl text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary/30 border border-neutral-200 font-mono"
              />
            </div>
            <button
              onClick={() => { setPreview(customHex); }}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-neutral-100 text-xs font-black text-neutral-600 hover:bg-neutral-200 transition-colors"
            >
              미리보기
            </button>
          </div>
        </div>

        {/* 미리보기 바 */}
        <div>
          <p className="text-[11px] font-black text-neutral-400 mb-2">미리보기</p>
          <div
            className="w-full h-12 rounded-xl border border-neutral-200 flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: preview ?? '#ffffff' }}
          >
            <span className="text-xs font-black text-neutral-500 mix-blend-multiply">
              {preview ? '선택된 색상' : '색 없음 (기본)'}
            </span>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => applyColor(null)}
            className="px-4 py-2.5 rounded-xl font-bold text-sm text-neutral-500 hover:bg-neutral-100 transition-colors border border-neutral-200"
          >
            색 지우기
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-neutral-500 hover:bg-neutral-100 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => applyColor(preview)}
            className="px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 표 삽입 그리드 피커 ───────────────────────────────────────────────────────
const TableGridPicker = ({ onSelect, onClose }: { onSelect: (rows: number, cols: number) => void; onClose: () => void }) => {
  const [hovered, setHovered] = useState<[number, number]>([0, 0]);
  const MAX = 6;

  return (
    <div
      className="absolute top-full left-0 mt-1 z-50 bg-white rounded-2xl shadow-xl border border-surface-container p-3"
      onMouseLeave={() => setHovered([0, 0])}
    >
      <p className="text-[10px] font-black text-on-surface-variant mb-2 text-center">
        {hovered[0] > 0 ? `${hovered[0]} × ${hovered[1]} 표` : '표 크기 선택'}
      </p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${MAX}, 1.5rem)` }}>
        {Array.from({ length: MAX * MAX }, (_, i) => {
          const r = Math.floor(i / MAX) + 1;
          const c = (i % MAX) + 1;
          const active = r <= hovered[0] && c <= hovered[1];
          return (
            <button
              key={i}
              className={`w-6 h-6 rounded transition-colors border ${
                active
                  ? 'bg-primary/20 border-primary'
                  : 'bg-surface-container-low border-surface-container hover:bg-surface-container'
              }`}
              onMouseEnter={() => setHovered([r, c])}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(r, c); onClose(); }}
            />
          );
        })}
      </div>
    </div>
  );
};

// ── 임베드 URL 자동 변환 ─────────────────────────────────────────────────────
interface EmbedInfo { embedUrl: string; label: string }

const EMBED_RULES: Array<{ pattern: RegExp; toEmbed: (m: RegExpMatchArray) => string; label: string }> = [
  {
    pattern: /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    toEmbed: m => `https://www.youtube.com/embed/${m[1]}?rel=0`,
    label: 'YouTube',
  },
  {
    pattern: /docs\.google\.com\/presentation\/d\/([^/?\s]+)/,
    toEmbed: m => `https://docs.google.com/presentation/d/${m[1]}/embed?start=false&loop=false&delayms=3000`,
    label: 'Google 슬라이드',
  },
  {
    pattern: /docs\.google\.com\/document\/d\/([^/?\s]+)/,
    toEmbed: m => `https://docs.google.com/document/d/${m[1]}/pub?embedded=true`,
    label: 'Google 문서',
  },
  {
    pattern: /docs\.google\.com\/spreadsheets\/d\/([^/?\s]+)/,
    toEmbed: m => `https://docs.google.com/spreadsheets/d/${m[1]}/htmlview?widget=true`,
    label: 'Google 스프레드시트',
  },
  {
    pattern: /docs\.google\.com\/forms\/d\/([^/?\s]+)/,
    toEmbed: m => `https://docs.google.com/forms/d/${m[1]}/viewform?embedded=true`,
    label: 'Google 설문',
  },
];

const parseEmbedUrl = (raw: string): EmbedInfo => {
  const url = raw.trim();
  for (const { pattern, toEmbed, label } of EMBED_RULES) {
    const m = url.match(pattern);
    if (m) return { embedUrl: toEmbed(m), label };
  }
  return { embedUrl: url, label: '임베드' };
};

// ── EmbedNodeView ─────────────────────────────────────────────────────────────
const EMBED_SIZE_PRESETS = [
  { label: '소', pct: 35 },
  { label: '중', pct: 55 },
  { label: '대', pct: 75 },
  { label: '전체', pct: 100 },
];

const EmbedNodeView = ({ node, selected, editor, getPos }: NodeViewProps) => {
  const { src, label, widthPercent } = node.attrs as { src: string; label: string; widthPercent: number };
  const [dragging, setDragging] = useState(false);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const currentWidth = liveWidth ?? widthPercent ?? 70;

  const commitWidth = (pct: number) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined || pos === null) return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, widthPercent: Math.round(pct) });
    editor.view.dispatch(tr);
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startPct = currentWidth;
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      const parentW = wrapperRef.current?.parentElement?.offsetWidth ?? 600;
      const dx = ev.clientX - startX;
      const newPct = Math.min(100, Math.max(20, startPct + (dx / parentW) * 100));
      setLiveWidth(newPct);
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragging(false);
      const parentW = wrapperRef.current?.parentElement?.offsetWidth ?? 600;
      const dx = ev.clientX - startX;
      const newPct = Math.min(100, Math.max(20, startPct + (dx / parentW) * 100));
      setLiveWidth(null);
      commitWidth(newPct);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <NodeViewWrapper className="my-4">
      <div
        ref={wrapperRef}
        style={{ width: `${currentWidth}%`, transition: dragging ? 'none' : 'width 0.15s' }}
        className="relative"
      >
        <div className={`rounded-2xl overflow-hidden border-2 transition-colors bg-black/5 ${selected ? 'border-primary' : 'border-surface-container'}`}>
          {/* 헤더 */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low border-b border-surface-container">
            <MonitorPlay size={13} className="text-primary shrink-0" />
            <span className="text-[11px] font-black text-on-surface-variant flex-1 truncate">{label || '임베드'}</span>
            {selected && (
              <>
                {/* 사이즈 프리셋 */}
                <div className="flex items-center gap-0.5 ml-1">
                  {EMBED_SIZE_PRESETS.map(p => (
                    <button
                      key={p.label}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); commitWidth(p.pct); }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-colors ${
                        Math.abs(currentWidth - p.pct) < 5
                          ? 'bg-primary text-white'
                          : 'text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] font-mono text-on-surface-variant/60 mx-1">{Math.round(currentWidth)}%</span>
                <button
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); deleteNodeAt(editor, getPos, node.nodeSize); }}
                  className="p-1 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="임베드 삭제"
                >
                  <X size={13} />
                </button>
              </>
            )}
          </div>
          {/* iframe 16:9 */}
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
            <iframe
              src={src}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>

        {/* 우측 드래그 핸들 */}
        {selected && (
          <div
            onMouseDown={onResizeStart}
            className="absolute right-0 top-0 bottom-0 w-3 flex items-center justify-center cursor-col-resize z-10 translate-x-1.5"
            title="드래그하여 크기 조절"
          >
            <div className={`w-1 h-10 rounded-full transition-colors ${dragging ? 'bg-primary' : 'bg-primary/50 hover:bg-primary'}`} />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// ── EmbedExtension ────────────────────────────────────────────────────────────
const EmbedExtension = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      src:          { default: '' },
      label:        { default: '임베드' },
      widthPercent: { default: 70 },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed]',
        getAttrs: el => {
          const iframe = (el as HTMLElement).querySelector('iframe');
          const styleW = (el as HTMLElement).style.width;
          const parsed = styleW ? parseInt(styleW) : NaN;
          return {
            src:          iframe?.getAttribute('src') || '',
            label:        (el as HTMLElement).getAttribute('data-label') || '임베드',
            widthPercent: isNaN(parsed) ? 70 : parsed,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const w = HTMLAttributes.widthPercent ?? 70;
    return ['div', mergeAttributes({ 'data-embed': true, 'data-label': HTMLAttributes.label, style: `width:${w}%` }),
      ['iframe', { src: HTMLAttributes.src, allowfullscreen: true, style: 'width:100%;aspect-ratio:16/9;border:0' }]];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { src, label, widthPercent } = node.attrs;
          const w = widthPercent ?? 70;
          state.write(
            `<div data-embed data-label="${label}" style="width:${w}%">\n` +
            `<iframe src="${src}" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0" loading="lazy"></iframe>\n` +
            `</div>\n\n`
          );
        },
        parse: {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedNodeView);
  },
});

// ── File → base64 변환 헬퍼 ──────────────────────────────────────────────────
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ── RichEditor ────────────────────────────────────────────────────────────────
interface RichEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
  onUploadingChange?: (uploading: boolean) => void;
  uploading?: boolean;
  minHeight?: string;
}

const RichEditor = ({ value, onChange, onUploadImage, onUploadingChange, uploading, minHeight = '440px' }: RichEditorProps) => {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrlDialogOpen, setImageUrlDialogOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageAltInput, setImageAltInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [colorModalType, setColorModalType] = useState<'header' | 'cell' | 'text' | null>(null);
  const lastInTablePosRef = useRef<number>(-1); // 표 안에 커서가 있을 때 실시간으로 갱신
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [embedUrlInput, setEmbedUrlInput] = useState('');
  const [embedPreview, setEmbedPreview] = useState<EmbedInfo | null>(null);
  const [pendingImage, setPendingImage] = useState<{ mode: 'copy' | 'cut'; attrs: Record<string, unknown> } | null>(null);
  const pendingImageRef = useRef<{ mode: 'copy' | 'cut'; attrs: Record<string, unknown> } | null>(null);
  pendingImageRef.current = pendingImage;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMarkdownRef = useRef(value);
  const uploadFnRef = useRef<((file: File) => Promise<void>) | null>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);
  const pendingUploadsRef = useRef(0); // 진행 중인 업로드 수
  const onUploadingChangeRef = useRef(onUploadingChange);
  useEffect(() => { onUploadingChangeRef.current = onUploadingChange; }, [onUploadingChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      CustomCodeBlock,
      SlashCommandExtension,
      AutoHorizontalRule,
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: '-',
        transformPastedText: true,
        transformCopiedText: false,
      }),
      LinkExtension.configure({ openOnClick: false }),
      ResizableImage.configure({ inline: true }),
      DetailsExtension,
      CalloutExtension,
      ColorableTable.configure({ resizable: true, HTMLAttributes: { class: 'rich-table' } }),
      TableRow,
      ColorableTableHeader,
      ColorableTableCell,
      TextStyle,
      Color,
      EmbedExtension,
      Placeholder.configure({
        placeholder: '내용을 입력하세요...',
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown();
      lastMarkdownRef.current = md;
      onChange(md);
    },
    onSelectionUpdate: ({ editor }) => {
      if (editor.isActive('table')) {
        lastInTablePosRef.current = editor.state.selection.from;
      }
    },
    editorProps: {
      attributes: { class: 'rich-editor-content outline-none' },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (imgItem) {
          event.preventDefault();
          const file = imgItem.getAsFile();
          if (file && uploadFnRef.current) {
            uploadFnRef.current(file);
          }
          return true;
        }
        // OS 클립보드에 이미지가 없으면, 에디터 내부에서 복사/잘라내기한 이미지(pendingImage)를 붙여넣기
        const pending = pendingImageRef.current;
        if (pending) {
          event.preventDefault();
          editor?.chain().focus().setImage({ ...pending.attrs } as any).run();
          if (pending.mode === 'cut') setPendingImage(null);
          return true;
        }
        // HTML 붙여넣기(엑셀/구글시트 표 포함)는 TipTap 기본 처리에 위임
        return false;
      },
    },
  });

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다.'); return; }

    // ① base64로 즉시 표시 (업로드 전 미리보기)
    const base64 = await fileToBase64(file);
    const tempAlt = `__uploading_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor?.chain().focus().setImage({ src: base64, alt: tempAlt } as any).run();

    if (!onUploadImage) return;

    // ② 업로드 카운터 증가 → 부모에게 업로드 시작 알림
    pendingUploadsRef.current += 1;
    if (pendingUploadsRef.current === 1) onUploadingChangeRef.current?.(true);

    try {
      const url = await onUploadImage(file);

      // ③ 업로드 완료 → 에디터에서 base64를 실제 URL로 교체
      // descendants 콜백 내부에서 dispatch하면 iteration 중 ProseMirror 상태가 변경되어
      // Selection 생성자가 잘못된 position을 받는 오류가 발생하므로 루프 밖에서 dispatch
      if (editor) {
        let imgPos = -1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let imgAttrs: any = null;
        editor.state.doc.descendants((node, pos) => {
          if (imgPos === -1 && node.type.name === 'image' && node.attrs.alt === tempAlt) {
            imgPos = pos;
            imgAttrs = node.attrs;
            return false;
          }
          return true;
        });
        if (imgPos !== -1 && imgAttrs) {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(imgPos, undefined, {
              ...imgAttrs,
              src: url,
              alt: file.name.replace(/\.[^.]+$/, ''),
            })
          );
        }
      }
    } catch {
      // 업로드 실패 시 임시 이미지 제거 (루프 밖에서 dispatch)
      if (editor) {
        let deleteFrom = -1, deleteTo = -1;
        editor.state.doc.descendants((node, pos) => {
          if (deleteFrom === -1 && node.type.name === 'image' && node.attrs.alt === tempAlt) {
            deleteFrom = pos;
            deleteTo = pos + node.nodeSize;
            return false;
          }
          return true;
        });
        if (deleteFrom !== -1) {
          editor.view.dispatch(editor.state.tr.delete(deleteFrom, deleteTo));
        }
      }
    } finally {
      // ④ 업로드 카운터 감소 → 0이면 부모에게 완료 알림
      pendingUploadsRef.current -= 1;
      if (pendingUploadsRef.current === 0) onUploadingChangeRef.current?.(false);
    }
  };

  uploadFnRef.current = handleImageFile;

  useEffect(() => {
    if (!editor) return;
    if (value !== lastMarkdownRef.current) {
      editor.commands.setContent(value);
      lastMarkdownRef.current = value;
    }
  }, [value, editor]);

  // 슬래시 명령어에서 임베드 다이얼로그 열기
  useEffect(() => {
    (window as any).__openEmbedDialog = () => setEmbedDialogOpen(true);
    return () => { delete (window as any).__openEmbedDialog; };
  }, []);

  // 이미지 노드뷰에서 복사/잘라내기한 이미지를 받아 대기시킴
  useEffect(() => {
    if (!editor) return;
    const handler = (payload: { mode: 'copy' | 'cut'; attrs: Record<string, unknown> }) => setPendingImage(payload);
    (editor as any).on('image-clipboard', handler);
    return () => { (editor as any).off('image-clipboard', handler); };
  }, [editor]);

  const handlePasteImageHere = () => {
    if (!pendingImage || !editor) return;
    editor.chain().focus().setImage({ ...pendingImage.attrs } as any).run();
    if (pendingImage.mode === 'cut') setPendingImage(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (linkDialogOpen) { setLinkDialogOpen(false); setLinkText(''); setLinkUrl(''); }
      else if (imageUrlDialogOpen) { setImageUrlDialogOpen(false); setImageUrlInput(''); setImageAltInput(''); }
      else if (tablePickerOpen) { setTablePickerOpen(false); }
      else if (embedDialogOpen) { setEmbedDialogOpen(false); setEmbedUrlInput(''); setEmbedPreview(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [linkDialogOpen, imageUrlDialogOpen, tablePickerOpen, embedDialogOpen]);

  // 표 피커 외부 클릭 닫기
  useEffect(() => {
    if (!tablePickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target as HTMLElement)) {
        setTablePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tablePickerOpen]);

  const handleInsertLink = () => {
    if (!editor || !linkUrl.trim()) return;
    editor.chain().focus().setLink({ href: linkUrl.trim() }).insertContent(linkText.trim() || linkUrl.trim()).run();
    setLinkDialogOpen(false); setLinkText(''); setLinkUrl('');
  };

  const handleInsertImageUrl = () => {
    if (!editor || !imageUrlInput.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.chain().focus().setImage({ src: imageUrlInput.trim(), alt: imageAltInput.trim() } as any).run();
    setImageUrlDialogOpen(false); setImageUrlInput(''); setImageAltInput('');
  };

  const handleInsertToggle = () => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'details',
      attrs: { summary: '토글 제목' },
      content: [{ type: 'paragraph' }],
    }).run();
  };

  const handleInsertCallout = () => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'callout',
      attrs: { type: 'info' },
      content: [{ type: 'paragraph' }],
    }).run();
  };

  const handleInsertTable = (rows: number, cols: number) => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  };

  const handleEmbedUrlChange = (url: string) => {
    setEmbedUrlInput(url);
    if (url.trim()) {
      setEmbedPreview(parseEmbedUrl(url));
    } else {
      setEmbedPreview(null);
    }
  };

  const handleInsertEmbed = () => {
    if (!editor || !embedUrlInput.trim()) return;
    const { embedUrl, label } = parseEmbedUrl(embedUrlInput);
    editor.chain().focus().insertContent({
      type: 'embed',
      attrs: { src: embedUrl, label },
    }).run();
    setEmbedDialogOpen(false);
    setEmbedUrlInput('');
    setEmbedPreview(null);
  };

  if (!editor) return null;

  const isActive = (name: string, attrs?: object) => editor.isActive(name, attrs);
  const btnCls = (active: boolean) =>
    `p-1.5 rounded-lg transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'}`;
  const textBtnCls = (active: boolean) =>
    `px-2 py-1 rounded-lg text-xs font-black transition-colors ${active ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container hover:text-primary'}`;
  const sep = <div className="w-px h-4 bg-surface-container mx-1" />;
  const tableBtnCls = 'flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors';

  return (
    <div className="relative">
      {/* ── 툴바 ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-surface-container bg-surface-container-low/30">
        <button onClick={() => editor.chain().focus().toggleBold().run()} title="굵게 (Ctrl+B)" className={btnCls(isActive('bold'))}><Bold size={15} /></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임 (Ctrl+I)" className={btnCls(isActive('italic'))}><Italic size={15} /></button>
        {/* 글자색 버튼 */}
        <button
          onClick={() => setColorModalType('text')}
          title="글자 색상"
          className={btnCls(false) + ' relative'}
        >
          <span className="flex flex-col items-center gap-0 leading-none">
            <span className="text-[11px] font-black" style={{ color: editor.getAttributes('textStyle').color || 'currentColor' }}>A</span>
            <span
              className="block h-[3px] w-[14px] rounded-full mt-[1px]"
              style={{ backgroundColor: editor.getAttributes('textStyle').color || '#1e293b' }}
            />
          </span>
        </button>
        {sep}
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="제목 1" className={textBtnCls(isActive('heading', { level: 1 }))}>H1</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="제목 2" className={textBtnCls(isActive('heading', { level: 2 }))}>H2</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="제목 3" className={textBtnCls(isActive('heading', { level: 3 }))}>H3</button>
        {sep}
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} title="글머리 목록" className={btnCls(isActive('bulletList'))}><List size={15} /></button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} title="번호 목록" className={btnCls(isActive('orderedList'))}><ListOrdered size={15} /></button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} title="인용구" className={btnCls(isActive('blockquote'))}><Quote size={15} /></button>
        <button onClick={() => editor.chain().focus().toggleCode().run()} title="인라인 코드" className={btnCls(isActive('code'))}><Code size={15} /></button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="코드 블록" className={btnCls(isActive('codeBlock'))}><Code2 size={15} /></button>
        {sep}
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선 (슬라이드 구분)" className={btnCls(false)}><Minus size={15} /></button>
        <button onClick={() => setLinkDialogOpen(true)} title="링크 삽입" className={btnCls(isActive('link'))}><Link2 size={15} /></button>
        {sep}
        <button onClick={() => fileInputRef.current?.click()} title={uploading ? '업로드 중...' : '이미지 파일 업로드 (자동 WebP 변환, 클립보드 붙여넣기 가능)'} disabled={uploading} className={btnCls(false) + ' disabled:opacity-50'}>
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
        </button>
        <button onClick={() => setImageUrlDialogOpen(true)} title="이미지 URL로 추가" className={btnCls(false)}><Globe size={15} /></button>
        {pendingImage && (
          <>
            <button
              onClick={handlePasteImageHere}
              title={`${pendingImage.mode === 'cut' ? '잘라낸' : '복사한'} 이미지를 커서 위치에 붙여넣기 (Ctrl+V도 가능)`}
              className={btnCls(false) + ' text-primary animate-pulse ring-2 ring-primary/50'}
            >
              <ClipboardPaste size={15} />
            </button>
            <button onClick={() => setPendingImage(null)} title="붙여넣기 대기 취소" className={btnCls(false)}>
              <X size={15} />
            </button>
          </>
        )}
        {sep}
        <button onClick={handleInsertToggle} title="토글 블록 삽입" className={btnCls(isActive('details'))}>
          <ChevronRight size={15} />
        </button>
        <button onClick={handleInsertCallout} title="콜아웃 삽입 (강조 박스)" className={btnCls(isActive('callout'))}>
          <Lightbulb size={15} />
        </button>
        {sep}
        {/* 표 삽입 버튼 */}
        <div className="relative" ref={tablePickerRef}>
          <button
            onClick={() => setTablePickerOpen(o => !o)}
            title="표 삽입"
            className={btnCls(isActive('table') || tablePickerOpen)}
          >
            <Table2 size={15} />
          </button>
          {tablePickerOpen && (
            <TableGridPicker
              onSelect={handleInsertTable}
              onClose={() => setTablePickerOpen(false)}
            />
          )}
        </div>
        {/* 임베드 버튼 */}
        <button
          onClick={() => setEmbedDialogOpen(true)}
          title="영상·슬라이드 임베드 (YouTube, Google 슬라이드 등)"
          className={btnCls(isActive('embed'))}
        >
          <MonitorPlay size={15} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleImageFile(f); e.target.value = ''; } }} />
        <span className="ml-auto text-[10px] text-on-surface-variant font-bold opacity-60">/ 입력 → 블록 삽입</span>
      </div>

      {/* ── 표 편집 플로팅 메뉴 (커서가 표 안에 있을 때, 표 근처에 표시) ── */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: ed }) => ed.isActive('table')}
        className="flex flex-wrap items-center gap-1 bg-white rounded-xl shadow-xl border border-surface-container p-1.5 max-w-[min(90vw,480px)]"
      >
        <span className="text-[10px] font-black text-primary mr-1 pl-1">표 편집</span>
        <button onClick={() => editor.chain().focus().addRowBefore().run()} className={tableBtnCls} title="위에 행 추가">
          <Plus size={11} /><ArrowDownToLine size={11} className="rotate-180" />위 행
        </button>
        <button onClick={() => editor.chain().focus().addRowAfter().run()} className={tableBtnCls} title="아래에 행 추가">
          <Plus size={11} /><ArrowDownToLine size={11} />아래 행
        </button>
        <button onClick={() => editor.chain().focus().addColumnBefore().run()} className={tableBtnCls} title="왼쪽에 열 추가">
          <Plus size={11} /><ArrowRightToLine size={11} className="rotate-180" />왼쪽 열
        </button>
        <button onClick={() => editor.chain().focus().addColumnAfter().run()} className={tableBtnCls} title="오른쪽에 열 추가">
          <Plus size={11} /><ArrowRightToLine size={11} />오른쪽 열
        </button>
        <div className="w-px h-4 bg-surface-container mx-0.5" />
        <button onClick={() => editor.chain().focus().toggleHeaderRow().run()} className={tableBtnCls} title="헤더 행 토글">
          헤더
        </button>
        <div className="w-px h-4 bg-surface-container mx-0.5" />
        {/* 헤더 색상 */}
        <button
          onClick={() => setColorModalType('header')}
          className={tableBtnCls}
          title="헤더 전체 배경색 변경"
        >
          <Palette size={11} />헤더색
        </button>
        {/* 셀 색상 */}
        <button
          onClick={() => setColorModalType('cell')}
          className={tableBtnCls}
          title="현재 셀 배경색 변경"
        >
          <Palette size={11} />셀색
        </button>
        <div className="w-px h-4 bg-surface-container mx-0.5" />
        <button
          onClick={() => editor.chain().focus().deleteRow().run()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors"
          title="현재 행 삭제"
        >
          <Trash2 size={11} />행 삭제
        </button>
        <button
          onClick={() => editor.chain().focus().deleteColumn().run()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-red-500 hover:bg-red-50 transition-colors"
          title="현재 열 삭제"
        >
          <Trash2 size={11} />열 삭제
        </button>
        <button
          onClick={() => editor.chain().focus().deleteTable().run()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors ml-1"
          title="표 전체 삭제"
        >
          <Trash2 size={11} />표 삭제
        </button>
      </BubbleMenu>

      {/* ── 선택 영역 플로팅 툴바 ── */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: ed, state }) => {
          const { selection } = state;
          if (selection instanceof NodeSelection) return false; // 이미지/표/임베드는 자체 UI 사용
          if (ed.isActive('codeBlock')) return false;
          return !selection.empty;
        }}
        className="flex items-center gap-0.5 bg-white rounded-xl shadow-xl border border-surface-container p-1"
      >
        <button onClick={() => editor.chain().focus().toggleBold().run()} title="굵게 (Ctrl+B)" className={btnCls(isActive('bold'))}><Bold size={14} /></button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임 (Ctrl+I)" className={btnCls(isActive('italic'))}><Italic size={14} /></button>
        <button onClick={() => editor.chain().focus().toggleCode().run()} title="인라인 코드" className={btnCls(isActive('code'))}><Code size={14} /></button>
        <div className="w-px h-4 bg-surface-container mx-0.5" />
        <button onClick={() => setColorModalType('text')} title="글자 색상" className={btnCls(false) + ' relative'}>
          <span className="flex flex-col items-center gap-0 leading-none">
            <span className="text-[10px] font-black" style={{ color: editor.getAttributes('textStyle').color || 'currentColor' }}>A</span>
            <span
              className="block h-[2px] w-[12px] rounded-full mt-[1px]"
              style={{ backgroundColor: editor.getAttributes('textStyle').color || '#1e293b' }}
            />
          </span>
        </button>
        <button onClick={() => setLinkDialogOpen(true)} title="링크 삽입" className={btnCls(isActive('link'))}><Link2 size={14} /></button>
      </BubbleMenu>

      {/* ── 에디터 본문 ── */}
      <div
        style={{ minHeight }}
        className={`relative transition-colors cursor-text ${isDragging ? 'bg-primary/5 ring-2 ring-primary ring-inset' : ''}`}
        onClick={() => editor.commands.focus()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async e => {
          e.preventDefault(); setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) await handleImageFile(file);
        }}
      >
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-primary/10 rounded-2xl px-8 py-5 font-black text-primary text-sm border-2 border-dashed border-primary">
              📷 이미지를 여기에 놓으세요
            </div>
          </div>
        )}
        <EditorContent editor={editor} className="p-6" />
      </div>

      {/* ── 링크 삽입 다이얼로그 ── */}
      {linkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setLinkDialogOpen(false); setLinkText(''); setLinkUrl(''); }}>
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-base">🔗 링크 삽입</h3>
            <div className="space-y-2">
              <input type="text" value={linkText} onChange={e => setLinkText(e.target.value)} placeholder="표시할 텍스트 (선택)" className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none" autoFocus />
              <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..." className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none" onKeyDown={e => e.key === 'Enter' && handleInsertLink()} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setLinkDialogOpen(false); setLinkText(''); setLinkUrl(''); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">취소</button>
              <button onClick={handleInsertLink} className="flex-1 py-2.5 btn-gradient rounded-xl font-black text-sm text-white">삽입</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이미지 URL 다이얼로그 ── */}
      {imageUrlDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setImageUrlDialogOpen(false); setImageUrlInput(''); setImageAltInput(''); }}>
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-96 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-base">🖼️ 이미지 URL로 추가</h3>
            <p className="text-xs text-on-surface-variant font-bold">외부 이미지 주소를 입력하면 직접 삽입됩니다.</p>
            <div className="space-y-2">
              <input type="url" value={imageUrlInput} onChange={e => setImageUrlInput(e.target.value)} placeholder="https://example.com/image.png" className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none" autoFocus onKeyDown={e => e.key === 'Enter' && handleInsertImageUrl()} />
              <input type="text" value={imageAltInput} onChange={e => setImageAltInput(e.target.value)} placeholder="이미지 설명 (선택)" className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none" onKeyDown={e => e.key === 'Enter' && handleInsertImageUrl()} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setImageUrlDialogOpen(false); setImageUrlInput(''); setImageAltInput(''); }} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">취소</button>
              <button onClick={handleInsertImageUrl} className="flex-1 py-2.5 btn-gradient rounded-xl font-black text-sm text-white">삽입</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 임베드 다이얼로그 ── */}
      {embedDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => { setEmbedDialogOpen(false); setEmbedUrlInput(''); setEmbedPreview(null); }}>
          <div className="bg-white rounded-3xl p-6 shadow-2xl w-[480px] space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <MonitorPlay size={18} className="text-primary" />
              <h3 className="font-black text-base">영상 · 슬라이드 임베드</h3>
            </div>
            <p className="text-xs text-on-surface-variant font-bold leading-relaxed">
              URL을 붙여넣으면 자동으로 변환됩니다.<br />
              YouTube · Google 슬라이드 · Google 문서 · Google 설문 지원
            </p>
            <input
              type="url"
              value={embedUrlInput}
              onChange={e => handleEmbedUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleInsertEmbed()}
            />
            {/* 변환 결과 미리보기 */}
            {embedPreview && (
              <div className="bg-primary/5 rounded-xl px-4 py-3 space-y-1">
                <p className="text-[11px] font-black text-primary">{embedPreview.label} 감지됨</p>
                <p className="text-[10px] text-on-surface-variant break-all font-mono">{embedPreview.embedUrl}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setEmbedDialogOpen(false); setEmbedUrlInput(''); setEmbedPreview(null); }}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleInsertEmbed}
                disabled={!embedUrlInput.trim()}
                className="flex-1 py-2.5 btn-gradient rounded-xl font-black text-sm text-white disabled:opacity-50"
              >
                삽입
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 표 헤더 색상 모달 ── */}
      {colorModalType === 'header' && (
        <TableColorModal
          title="헤더 배경색"
          presets={TABLE_COLORS}
          onSelect={(color) => {
            if (!editor) return;
            const refPos = lastInTablePosRef.current;
            if (refPos < 0) return;

            editor.chain().command(({ tr, state }) => {
              // refPos를 포함하는 table 노드를 doc에서 탐색
              let tableAbsPos = -1;
              let tableNode: any = null;
              state.doc.nodesBetween(0, state.doc.content.size, (n: any, pos: number) => {
                if (tableAbsPos >= 0) return false;
                if (n.type.name === 'table') {
                  if (pos <= refPos && pos + n.nodeSize > refPos) {
                    tableAbsPos = pos;
                    tableNode = n;
                  }
                  return false; // table 안을 재귀 탐색하지 않음
                }
                return true;
              });
              if (tableAbsPos < 0 || !tableNode) return false;

              // table content start = tableAbsPos + 1 (table 열림 토큰 이후)
              const contentStart = tableAbsPos + 1;
              // tableNode.descendants에서 relPos = 노드의 table content 내 오프셋
              tableNode.descendants((n: any, relPos: number) => {
                if (n.type.name === 'tableHeader') {
                  tr.setNodeMarkup(contentStart + relPos, undefined, {
                    ...n.attrs,
                    backgroundColor: color,
                  });
                  return false; // header 내부는 재귀 불필요
                }
                return true;
              });
              return true;
            }).run();
          }}
          onClose={() => setColorModalType(null)}
        />
      )}
      {/* ── 표 셀 색상 모달 ── */}
      {colorModalType === 'cell' && (
        <TableColorModal
          title="셀 배경색"
          presets={TABLE_COLORS}
          onSelect={(color) => {
            if (!editor) return;
            const refPos = lastInTablePosRef.current;
            if (refPos < 0) return;

            editor.chain().command(({ tr, state }) => {
              // 셀 색상은 현재 셀에만 적용 — refPos 기준 셀 찾기
              let cellAbsPos = -1;
              let cellNode: any = null;
              state.doc.nodesBetween(0, state.doc.content.size, (n: any, pos: number) => {
                if (cellAbsPos >= 0) return false;
                if ((n.type.name === 'tableCell' || n.type.name === 'tableHeader') &&
                    pos <= refPos && pos + n.nodeSize > refPos) {
                  cellAbsPos = pos;
                  cellNode = n;
                  return false;
                }
                return true;
              });
              if (cellAbsPos < 0 || !cellNode) return false;
              tr.setNodeMarkup(cellAbsPos, undefined, { ...cellNode.attrs, backgroundColor: color });
              return true;
            }).run();
          }}
          onClose={() => setColorModalType(null)}
        />
      )}
      {/* ── 글자 색상 모달 ── */}
      {colorModalType === 'text' && (
        <TableColorModal
          title="글자 색상"
          presets={TEXT_COLORS}
          defaultHex="#ef4444"
          onSelect={(color) => {
            if (color) {
              editor?.chain().focus().setColor(color).run();
            } else {
              editor?.chain().focus().unsetColor().run();
            }
          }}
          onClose={() => setColorModalType(null)}
        />
      )}
    </div>
  );
};

export default RichEditor;
