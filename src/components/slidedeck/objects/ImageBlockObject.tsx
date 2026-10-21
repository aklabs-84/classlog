import { useRef, useState } from 'react';
import { X, ImageIcon, Loader2 } from 'lucide-react';
import type { SlideObject } from '../types';
import { uploadSlideImage } from '../utils/imageUpload';
import { plainDrop } from '../../../hooks/useFileDrop';

interface Props {
  obj: SlideObject;
  isSelected: boolean;
  editable: boolean;
  onSelect: () => void;
  onUpdate: (changes: Partial<SlideObject>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
}

export default function ImageBlockObject({
  obj, isSelected, editable, onSelect, onUpdate, onDelete, onDragStart, onResizeStart,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    const publicUrl = await uploadSlideImage(file);
    setUploading(false);
    if (publicUrl) onUpdate({ src: publicUrl });
  };

  const style = obj.style ?? {};
  const frame = style.frame ?? 'none';

  const frameRadius = frame === 'circle' ? '50%' : frame === 'rounded' ? 24 : frame === 'full' ? 0 : (style.borderRadius ?? 8);
  const framePadding = frame === 'polaroid' ? 16 : 0;

  return (
    <div
      style={{
        position: 'absolute', left: obj.x, top: obj.y, width: obj.width, height: obj.height,
        zIndex: isSelected ? 9999 : obj.zIndex,
        transform: style.rotate ? `rotate(${style.rotate}deg)` : undefined,
        cursor: editable ? 'grab' : obj.href ? 'pointer' : 'default', userSelect: 'none', boxSizing: 'border-box',
      }}
      onPointerDown={editable ? e => { onSelect(); onDragStart(e); } : undefined}
      onClick={!editable && obj.href ? e => { e.stopPropagation(); window.open(obj.href, '_blank', 'noopener,noreferrer'); } : undefined}
    >
      <div
        style={{
          width: '100%', height: '100%',
          border: editable && isSelected ? '2px solid #3B82F6' : frame === 'polaroid' ? '1px solid #e5e7eb' : '1px solid transparent',
          borderRadius: frameRadius, overflow: 'hidden', background: frame === 'polaroid' ? '#fff' : style.fit ? 'transparent' : '#f2f2f2',
          boxSizing: 'border-box', padding: framePadding,
          boxShadow: frame === 'polaroid' ? '0 6px 18px rgba(0,0,0,0.18)' : undefined,
          display: 'flex', flexDirection: 'column',
          opacity: style.opacity ?? 1,
        }}
      >
      {editable && <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />}
      {uploading ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6B7280' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 12 }}>업로드 중...</span>
        </div>
      ) : obj.src ? (
        <img src={obj.src} alt={obj.alt ?? ''} draggable={false}
          style={{ width: '100%', height: '100%', objectFit: style.fit === 'contain' ? 'contain' : style.fit === 'fill' ? 'fill' : 'cover', display: 'block', pointerEvents: 'none' }} />
      ) : (
        <div
          className="data-[over=true]:bg-primary/10 data-[over=true]:outline data-[over=true]:outline-2 data-[over=true]:outline-dashed data-[over=true]:outline-primary"
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#9CA3AF', cursor: editable ? 'pointer' : 'default' }}
          onClick={editable ? () => fileRef.current?.click() : undefined}
          {...plainDrop(files => handleFile(files[0]), { accept: 'image/*', disabled: !editable })}
        >
          <ImageIcon size={32} />
          {editable && <span style={{ fontSize: 13 }}>클릭하거나 끌어다 놓아 이미지 추가</span>}
        </div>
      )}
      </div>
      {editable && isSelected && (
        <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 10000, display: 'flex', gap: 4 }}>
          <button onPointerDown={e => { e.stopPropagation(); fileRef.current?.click(); }}
            style={{ background: '#1e1e1e', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 11 }}>
            이미지 변경
          </button>
          <button onPointerDown={e => { e.stopPropagation(); onDelete(); }}
            style={{ background: '#EF4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}>
            <X size={12} />
          </button>
        </div>
      )}
      {editable && isSelected && (
        <div
          onPointerDown={e => { e.stopPropagation(); onResizeStart(e); }}
          style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, cursor: 'se-resize', background: '#3B82F6', borderRadius: '2px 0 6px 0' }}
        />
      )}
    </div>
  );
}
