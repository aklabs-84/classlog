import { useRef, useState, type DragEvent } from 'react';

// 파일을 끌어다 놓으면 onFiles로 넘겨 주는 공용 훅.
// 쓰는 법: const { over, dropProps } = useFileDrop(files => ..., { accept: '.hwpx,.hwp', multiple: false })
//         <div {...dropProps} className={over ? '강조' : ''}>
// accept는 input의 accept와 같은 형식(확장자·MIME·image/*)이고, 맞지 않는 파일은 걸러 낸다.
interface Options {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

function matches(file: File, accept?: string): boolean {
  if (!accept || accept === '*') return true;
  const name = file.name.toLowerCase();
  return accept.split(',').map(a => a.trim().toLowerCase()).filter(Boolean).some(a => {
    if (a.startsWith('.')) return name.endsWith(a);
    if (a.endsWith('/*')) return file.type.toLowerCase().startsWith(a.slice(0, -1));
    return file.type.toLowerCase() === a;
  });
}

export function useFileDrop(onFiles: (files: File[]) => void, opts: Options = {}) {
  const [over, setOver] = useState(false);
  // 자식 요소를 지날 때 dragleave가 번갈아 터지므로 들어온 횟수를 센다
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const dropProps = {
    onDragEnter: (e: DragEvent) => {
      if (opts.disabled || !hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (opts.disabled || !hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (opts.disabled || !hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (opts.disabled || !hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer.files).filter(f => matches(f, opts.accept));
      if (files.length === 0) return;
      onFiles(opts.multiple ? files : files.slice(0, 1));
    },
  };
  return { over, dropProps };
}

// input의 onChange만 받는 기존 함수에 끌어다 놓은 파일을 그대로 넘기기 위한 가짜 변경 이벤트
export function asChangeEvent(files: File[]) {
  return { target: { files, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

// 훅을 쓸 수 없는 곳(반복문·즉시 실행 함수 안의 화면 조각)용. 상태 대신 data-over 속성으로 강조하니
// 스타일은 Tailwind의 data-[over=true]:... 로 준다.
export function plainDrop(onFiles: (files: File[]) => void, opts: Options = {}) {
  const isFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const mark = (e: DragEvent, on: boolean) => { (e.currentTarget as HTMLElement).dataset.over = on ? 'true' : 'false'; };
  return {
    onDragEnter: (e: DragEvent) => { if (!opts.disabled && isFiles(e)) { e.preventDefault(); mark(e, true); } },
    onDragOver: (e: DragEvent) => { if (!opts.disabled && isFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; mark(e, true); } },
    onDragLeave: (e: DragEvent) => {
      // 안쪽 자식으로 옮겨 가는 경우는 유지
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) mark(e, false);
    },
    onDrop: (e: DragEvent) => {
      if (opts.disabled || !isFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      mark(e, false);
      const files = Array.from(e.dataTransfer.files).filter(f => matches(f, opts.accept));
      if (files.length > 0) onFiles(opts.multiple ? files : files.slice(0, 1));
    },
  };
}
