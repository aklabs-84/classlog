import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Copy, Loader2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { getUploadKey, createOrRotateUploadKey, buildUploadLink, type UploadKey } from '../../lib/galleryAssistant';

// 수업 종료 직후 "오늘 수업 사진 올리기" 안내 (보조강사 올리기 링크 복사 + 내 사진 올리기 이동)
const GalleryEndPrompt = ({ classId, onClose }: { classId: string; onClose: () => void }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [key, setKey] = useState<UploadKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getUploadKey(classId).then(k => setKey(k)).catch(() => {}).finally(() => setLoading(false));
  }, [classId]);

  const copy = async () => {
    if (!user) return;
    try {
      let k = key;
      if (!k || !k.is_active) { k = await createOrRotateUploadKey(user.id, classId); setKey(k); }
      await navigator.clipboard.writeText(buildUploadLink(k.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };

  // MainLayout의 main이 fixed를 가두므로 body로 포탈
  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400" aria-label="닫기"><X className="w-5 h-5" /></button>
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-indigo-600" />
          <p className="font-bold text-gray-900">오늘 수업 사진을 올릴까요?</p>
        </div>
        <p className="text-sm text-gray-500">수업이 끝났어요. 보조강사가 찍은 사진은 링크로 바로 받을 수 있어요.</p>
        <div className="space-y-2">
          <button onClick={copy} disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '링크를 복사했어요' : '보조강사 올리기 링크 복사'}
          </button>
          <button onClick={() => { onClose(); navigate('/gallery'); }}
            className="w-full border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-semibold">
            내 사진 올리러 가기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GalleryEndPrompt;
