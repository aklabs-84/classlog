import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SubmissionViewerModal from '../components/classroom/SubmissionViewerModal';

// 제출 결과 파일(html·zip 등)을 새 탭에서 전체 화면으로 열어 주는 페이지.
// 파일은 뷰어 안의 격리된 창(sandbox)에서만 실행되고, 우리 저장소 주소의 파일만 연다.
export default function ResultFileView() {
  const [params] = useSearchParams();
  const url = params.get('url') ?? '';
  const name = params.get('name') || '결과 파일';
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const valid = !!base && url.startsWith(base + '/storage/v1/object/');

  useEffect(() => { document.title = name; }, [name]);

  if (!valid) {
    return <p className="p-6 text-sm text-slate-600">열 수 없는 주소예요. 앞 화면으로 돌아가 다운로드로 확인해 주세요.</p>;
  }
  return (
    <SubmissionViewerModal
      isOpen
      onClose={() => { window.close(); if (!window.closed) window.history.length > 1 ? window.history.back() : (window.location.href = '/'); }}
      fileUrl={url}
      fileName={name}
    />
  );
}
