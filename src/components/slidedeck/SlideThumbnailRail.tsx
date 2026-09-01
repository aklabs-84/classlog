import { useState } from 'react';
import { Plus, Trash2, Copy, BookmarkPlus } from 'lucide-react';
import type { DeckSlide } from './types';
import SlideStage from './SlideStage';

interface Props {
  slides: DeckSlide[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: (afterIndex?: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onSaveToLibrary?: (index: number) => void;
}

export default function SlideThumbnailRail({ slides, activeIndex, onSelect, onAdd, onDuplicate, onDelete, onReorder, onSaveToLibrary }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const resetDrag = () => { setDragIndex(null); setOverIndex(null); };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, width: 168, flexShrink: 0,
      overflowY: 'auto', padding: '4px 2px',
      height: '100%', minHeight: 320,
    }}>
      {slides.map((slide, i) => (
        <div key={slide.id}>
          {overIndex === i && dragIndex !== null && dragIndex !== i && (
            <div style={{ height: 2, background: '#3B82F6', borderRadius: 1, marginBottom: 8 }} />
          )}
          <div style={{ position: 'relative', opacity: dragIndex === i ? 0.4 : 1 }}>
            <div
              draggable
              onClick={() => onSelect(i)}
              onDragStart={() => setDragIndex(i)}
              onDragOver={e => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) setOverIndex(i); }}
              onDrop={e => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i);
                resetDrag();
              }}
              onDragEnd={resetDrag}
              style={{
                border: i === activeIndex ? '2px solid #3B82F6' : '1px solid #e5e7eb',
                borderRadius: 8, overflow: 'hidden', cursor: 'grab',
              }}
            >
              <SlideStage slide={slide} editable={false} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{i + 1}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {onSaveToLibrary && (
                  <button onClick={() => onSaveToLibrary(i)} title="보관함에 담기" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                    <BookmarkPlus size={13} />
                  </button>
                )}
                <button onClick={() => onDuplicate(i)} title="복제" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}>
                  <Copy size={13} />
                </button>
                {slides.length > 1 && (
                  <button onClick={() => onDelete(i)} title="삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
          {i === activeIndex && (
            <button
              onClick={() => onAdd(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', marginTop: 8,
                border: '1px dashed #3B82F6', borderRadius: 8, padding: '6px 0', color: '#3B82F6',
                background: 'none', cursor: 'pointer', fontSize: 11,
              }}
            >
              <Plus size={12} /> 이 위치에 추가
            </button>
          )}
        </div>
      ))}
      <button
        onClick={() => onAdd()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          border: '1px dashed #cbd5e1', borderRadius: 8, padding: '10px 0', color: '#64748b',
          background: 'none', cursor: 'pointer', fontSize: 12,
        }}
      >
        <Plus size={14} /> 슬라이드 추가
      </button>
    </div>
  );
}
