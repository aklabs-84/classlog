// 업로드 전 이미지 압축: 긴 변을 maxSide로 줄이고 WebP로 변환한다.
// GIF(애니메이션)/SVG는 그대로 두고, 변환에 실패하거나 결과가 더 크면 원본을 그대로 반환한다.
const SKIP_TYPES = ['image/gif', 'image/svg+xml', 'image/webp'];

export async function compressImageForUpload(file: File, maxSide = 2000, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_TYPES.includes(file.type)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image load failed'));
      el.src = url;
    }).finally(() => URL.revokeObjectURL(url));

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return file; // HEIC 등 브라우저가 디코딩하지 못하는 형식은 원본 업로드
  }
}
