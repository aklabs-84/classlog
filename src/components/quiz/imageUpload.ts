import { supabase } from '../../lib/supabase';

function convertToWebP(file: File, maxWidth: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas context unavailable')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('toBlob failed'));
        },
        'image/webp',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image load failed')); };
    img.src = objectUrl;
  });
}

// 문제 이미지를 WebP로 변환 후 Supabase Storage(quiz-images)에 업로드, public URL 반환
export async function uploadQuizImage(file: File): Promise<string | null> {
  const webpBlob = await convertToWebP(file, 1600, 0.85);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  const { data, error } = await supabase.storage
    .from('quiz-images')
    .upload(fileName, webpBlob, { contentType: 'image/webp', upsert: false });

  if (error || !data) return null;

  const { data: { publicUrl } } = supabase.storage
    .from('quiz-images')
    .getPublicUrl(data.path);

  return publicUrl;
}
