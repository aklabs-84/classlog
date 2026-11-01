import { ExternalLink, MonitorOff } from 'lucide-react';
import LinkSaveTip from './LinkSaveTip';

/** 학생 컴퓨터 안의 파일 경로(file:///C:/..., C:\...)는 다른 사람이 열 수 없다 */
export const isLocalPath = (url: string) => /^(file:|[a-z]:[\\/]|\\\\|\/(Users|home)\/)/i.test(url.trim());

const localFileName = (url: string) => {
  const last = url.trim().split(/[\\/]/).filter(Boolean).pop() || '';
  try { return decodeURIComponent(last); } catch { return last; }
};

/** 결과물 한 건의 링크들: 같은 주소는 한 번만, 열 수 있는 링크는 버튼 + 안내 1회, 내 컴퓨터 경로는 안내 문구 한 줄 */
const ResultLinks = ({ urls, size = 'md' }: { urls: string[]; size?: 'md' | 'lg' }) => {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const openable = unique.filter((u) => !isLocalPath(u));
  const local = unique.filter(isLocalPath);
  if (unique.length === 0) return null;
  const btn = size === 'lg' ? 'px-4 py-3 rounded-2xl' : 'px-4 py-2.5 rounded-xl';
  return (
    <>
      {openable.length > 0 && (
        <div>
          {openable.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={`${i === 0 ? 'mt-2' : 'mt-1.5'} flex items-center justify-center gap-2 text-base font-black text-white bg-indigo-500 hover:bg-indigo-600 ${btn} transition-colors shadow-sm`}>
              <ExternalLink size={14} /> {openable.length > 1 ? `링크 열기 ${i + 1}` : '링크 열기'}
            </a>
          ))}
          <LinkSaveTip />
        </div>
      )}
      {local.length > 0 && (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] leading-relaxed text-rose-800">
          <p className="flex items-center gap-1.5 font-black"><MonitorOff size={14} className="shrink-0" /> 열 수 없는 링크예요</p>
          <p className="mt-0.5">학생 컴퓨터 안의 파일 위치라 선생님 화면에서는 열리지 않아요. 학생에게 파일로 다시 올리거나, 인터넷 주소로 내도록 안내해 주세요.</p>
          <p className="mt-1 text-rose-600 break-all">파일: {[...new Set(local.map(localFileName))].join(', ')}</p>
        </div>
      )}
    </>
  );
};

export default ResultLinks;
