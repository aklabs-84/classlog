import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { SlideObject } from '../types';

interface Props {
  obj: SlideObject;
  isSelected: boolean;
  editable: boolean;
  fallbackColor: string;
  onSelect: () => void;
  onUpdate: (changes: Partial<SlideObject>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
}

export default function TextBlockObject({
  obj, isSelected, editable, fallbackColor, onSelect, onUpdate, onDelete, onDragStart, onResizeStart,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(obj.text ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  const startEditing = () => { setDraft(obj.text ?? ''); setEditing(true); };

  const style = obj.style ?? {};
  const isBadge = !!style.background;
  const textStyle: React.CSSProperties = {
    fontSize: style.fontSize ?? 24,
    color: style.color ?? fallbackColor,
    textAlign: style.align ?? 'left',
    fontWeight: style.bold ? 700 : 400,
    fontFamily: style.fontFamily,
    background: style.background,
    borderRadius: style.borderRadius,
    padding: isBadge ? '8px 20px' : 4,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.35,
    opacity: style.opacity ?? 1,
    boxSizing: 'border-box',
    ...(isBadge ? { display: 'table-cell', verticalAlign: 'middle' as const } : {}),
  };

  return (
    <div
      style={{
        position: 'absolute', left: obj.x, top: obj.y, width: obj.width, height: obj.height,
        zIndex: isSelected ? 9999 : obj.zIndex,
        outline: editable && isSelected ? '2px solid #3B82F6' : editable ? '1px dashed transparent' : 'none',
        cursor: editable ? 'grab' : obj.href ? 'pointer' : 'default', userSelect: 'none', boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onPointerDown={editable ? e => { onSelect(); if (!editing) onDragStart(e); } : undefined}
      onDoubleClick={editable ? startEditing : undefined}
      onClick={!editable && obj.href ? e => { e.stopPropagation(); window.open(obj.href, '_blank', 'noopener,noreferrer'); } : undefined}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onPointerDown={e => e.stopPropagation()}
          onBlur={() => { setEditing(false); onUpdate({ text: draft }); }}
          style={{
            width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
            ...textStyle, background: style.background ?? 'transparent', color: style.color ?? fallbackColor,
          }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', ...textStyle }}>
          {obj.text || (editable ? '더블클릭해서 입력하세요' : '')}
        </div>
      )}
      {editable && isSelected && !editing && (
        <>
          <button
            onPointerDown={e => { e.stopPropagation(); onDelete(); }}
            style={{ position: 'absolute', top: 4, right: 4, zIndex: 10000, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}
          >
            <X size={12} />
          </button>
          <div
            onPointerDown={e => { e.stopPropagation(); onResizeStart(e); }}
            style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, cursor: 'se-resize', background: '#3B82F6', borderRadius: '2px 0 6px 0' }}
          />
        </>
      )}
    </div>
  );
}
