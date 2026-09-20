import { useRef, useState } from 'react';
import { X, ImageIcon, Loader2 } from 'lucide-react';
import type { BoardObject } from '../types';
import { uploadBoardImage } from '../utils/imageUtils';

interface Props {
  obj: BoardObject;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (changes: Partial<BoardObject>) => void;
  onDelete: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}

export default function ImageCard({ obj, isSelected, onSelect, onUpdate, onDelete, onDragStart }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const url = obj.content.url as string | undefined;

  const handleFile = async (file: File) => {
    // 업로드가 끝나기 전에도 올리는 사람 화면에는 바로 미리보기를 보여준다
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    const publicUrl = await uploadBoardImage(file);
    setUploading(false);
    setPreview(null);
    URL.revokeObjectURL(localUrl);
    if (publicUrl) {
      onUpdate({ content: { ...obj.content, url: publicUrl } });
    }
  };

  return (
    <div
      style={{
        position: 'absolute', left: obj.x, top: obj.y,
        width: obj.width, height: obj.height,
        zIndex: isSelected ? 9999 : obj.z_index,
        border: isSelected ? '2px solid #3B82F6' : '1px solid #e0e0e0',
        borderRadius: 8, overflow: 'hidden', background: '#f9fafb',
        cursor: 'grab', userSelect: 'none',
      }}
      onPointerDown={e => { onSelect(); onDragStart(e); }}
      onPaste={e => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) { const f = item.getAsFile(); if (f) handleFile(f); }
      }}
      tabIndex={0}
    >
      {isSelected && (
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
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      {uploading ? (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6B7280' }}>
          {preview && <img src={preview} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.5, pointerEvents: 'none' }} />}
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', position: 'relative' }} />
          <span style={{ fontSize: 12, position: 'relative' }}>업로드 중...</span>
        </div>
      ) : url ? (
        <img
          src={url} alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }}
        />
      ) : (
        <div
          style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#9CA3AF', cursor: 'pointer' }}
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon size={32} />
          <span style={{ fontSize: 13 }}>클릭하여 이미지 추가</span>
          <span style={{ fontSize: 11 }}>또는 Ctrl+V 로 붙여넣기</span>
        </div>
      )}
      {isSelected && (
        <div
          onPointerDown={e => {
            e.stopPropagation();
            const startX = e.clientX, startY = e.clientY, startW = obj.width, startH = obj.height;
            const onMove = (ev: PointerEvent) => onUpdate({ width: Math.max(100, startW + ev.clientX - startX), height: Math.max(80, startH + ev.clientY - startY) });
            const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
            window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
          }}
          style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, cursor: 'se-resize', background: '#3B82F6', borderRadius: '2px 0 6px 0' }}
        />
      )}
    </div>
  );
}
