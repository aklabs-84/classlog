import { FileText } from 'lucide-react';
import MaterialCoverPage from './MaterialCoverPage';

// 폴더마다 다른 파스텔 색 (Tailwind는 클래스 문자열이 코드에 그대로 있어야 해서 통째로 적어 둔다)
const TILE_COLORS = [
  { bg: 'bg-violet-50', fg: 'text-violet-600' },
  { bg: 'bg-emerald-50', fg: 'text-emerald-600' },
  { bg: 'bg-sky-50', fg: 'text-sky-600' },
  { bg: 'bg-amber-50', fg: 'text-amber-600' },
  { bg: 'bg-rose-50', fg: 'text-rose-500' },
  { bg: 'bg-teal-50', fg: 'text-teal-600' },
];

interface MaterialThumbTileProps {
  title: string;
  imageUrl?: string | null;
  /** 주차 번호 — 없으면(공통 자료함 등) 문서 아이콘을 보여준다 */
  weekNumber?: number | null;
  /** 폴더 순서 번호 — 같은 폴더끼리 같은 색. 미분류는 null */
  folderIndex?: number | null;
  /** 목록 보기용 작은 크기 */
  compact?: boolean;
}

// 목록/카드용 썸네일 — 커버 이미지가 있으면 기존 표지, 없으면 주차·폴더색 타일
export default function MaterialThumbTile({ title, imageUrl, weekNumber, folderIndex, compact = false }: MaterialThumbTileProps) {
  if (imageUrl) {
    return <MaterialCoverPage title={compact ? '' : title} subtitle={!compact && weekNumber != null ? `${weekNumber}주차` : null} imageUrl={imageUrl} thumbnail />;
  }

  const color = TILE_COLORS[folderIndex != null && folderIndex >= 0 ? folderIndex % TILE_COLORS.length : 0];

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center ${color.bg} ${color.fg}`}>
      {weekNumber != null ? (
        <>
          <span className={`font-black leading-none ${compact ? 'text-2xl' : 'text-6xl'}`}>{weekNumber}</span>
          <span className={`font-black ${compact ? 'text-[10px] mt-0.5' : 'text-sm mt-2'}`}>주차</span>
        </>
      ) : (
        <FileText size={compact ? 24 : 44} strokeWidth={1.75} />
      )}
    </div>
  );
}
