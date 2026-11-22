import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// 끌어서 순서 바꾸기용 한 줄 (손잡이만 끌 수 있어 클릭·입력과 안 섞임)
export default function SortablePlanRow({ id, children }: { id: string; children: (h: { attributes: any; listeners: any; setActivatorNodeRef: (el: HTMLElement | null) => void }) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 10 : undefined }}
      className={isDragging ? 'bg-surface-container-lowest shadow-lg opacity-90' : ''}>
      {children({ attributes, listeners, setActivatorNodeRef })}
    </div>
  );
}
