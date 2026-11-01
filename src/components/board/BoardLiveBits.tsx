import { Search, X } from 'lucide-react';
import {
  agoLabel, authorLabel, isRecentPost, postKey, postLatestAt, BOARD_PAGE,
  type BoardSection, type BoardViewMode,
} from '../../lib/boardLive';

// 우리반 보드 3곳(학생 보드 / 선생님 클래스룸 보드 / 새 탭 보드)이 함께 쓰는 화면 부품

/** 카드 이름 옆 "방금 제출" 표시 — 10분이 지나면 저절로 사라진다 */
export const RecentBadge = ({ post, now }: { post: any; now: number }) => {
  if (post._type !== 'result' && post._type !== 'obs') return null;
  if (!isRecentPost(post, now)) return null;
  const again = post._type === 'result' && post._submissions?.length > 1;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-black px-2.5 py-1 rounded-full bg-rose-500 text-white shadow-sm animate-pulse">
      {again ? '🔄 다시 제출' : '🆕 방금 제출'}
    </span>
  );
};

/** 새로 들어온 카드를 잠깐 도드라지게 하는 클래스 */
export const freshCardClass = (fresh: boolean) => (fresh ? 'ring-4 ring-rose-400/70 shadow-xl' : '');

/** 보드 맨 위: 방금(10분 안) 제출한 사람을 한 줄로 모아 보여 준다 */
export const RecentStrip = ({ posts, now, onOpen }: { posts: any[]; now: number; onOpen: (p: any) => void }) => {
  const recent = posts.filter((p) => isRecentPost(p, now)).slice(0, 12);
  if (recent.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border-2 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700/50 px-4 py-3">
      <p className="text-[14px] font-black text-rose-700 dark:text-rose-300 mb-2">🆕 방금 제출한 친구 {recent.length}명 · 눌러서 바로 보기</p>
      <div className="flex flex-wrap gap-2">
        {recent.map((p) => (
          <button
            key={postKey(p)}
            type="button"
            onClick={() => onOpen(p)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-700/50 text-[14px] font-bold text-slate-700 dark:text-slate-200 hover:border-rose-400 hover:bg-rose-100/60 transition-colors"
          >
            <span>{p._type === 'obs' ? '📝' : '📁'}</span>
            <span className="font-black">{authorLabel(p)}</span>
            <span className="text-rose-600 dark:text-rose-300">{agoLabel(postLatestAt(p), now)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** "🆕 N건 새로 왔어요" 알림 — 스크롤을 내려 보고 있어도 놓치지 않게 */
export const NewArrivalToast = ({ count, onClose }: { count: number; onClose: () => void }) =>
  count > 0 ? (
    <button
      type="button"
      onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); onClose(); }}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[300] px-5 py-3 rounded-2xl bg-rose-600 text-white text-[15px] font-black shadow-2xl hover:bg-rose-700 transition-colors"
    >
      🆕 {count}건 새로 왔어요 · 눌러서 맨 위로
    </button>
  ) : null;

export const BoardSearchBox = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <div className="relative w-full sm:w-60">
    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="학생·조 이름, 내용 검색"
      aria-label="학생 이름이나 내용으로 검색"
      className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-bold text-slate-700 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="검색 지우기"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 flex items-center justify-center"
      >
        <X size={12} />
      </button>
    )}
  </div>
);

export const BoardViewToggle = ({ value, onChange }: { value: BoardViewMode; onChange: (v: BoardViewMode) => void }) => (
  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1" role="group" aria-label="보기 방식">
    {([
      { key: 'all', label: '전체' },
      { key: 'student', label: '👤 개인별' },
      { key: 'group', label: '👥 조별' },
      { key: 'tiles', label: '🔤 이름만' },
    ] as { key: BoardViewMode; label: string }[]).map((v) => (
      <button
        key={v.key}
        type="button"
        onClick={() => onChange(v.key)}
        className={`px-3 py-1.5 rounded-lg text-[14px] font-bold whitespace-nowrap transition-all ${
          value === v.key ? 'bg-white dark:bg-slate-600 text-indigo-700 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-300'
        }`}
      >
        {v.label}
      </button>
    ))}
  </div>
);

/** 개인별·조별 보기에서 묶음마다 붙는 제목 줄 */
export const BoardSectionHeader = ({ section }: { section: BoardSection }) =>
  section.title ? (
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">
      <span className="text-lg">{section.isGroup ? '👥' : '👤'}</span>
      <h3 className="text-[17px] font-black text-slate-800 dark:text-slate-100">{section.title}</h3>
      <span className="text-[14px] font-bold text-slate-500 dark:text-slate-400">{section.subtitle}</span>
    </div>
  ) : null;

/** 불러오기가 잠깐 실패했을 때 — 보던 게시물은 그대로 두고 알려 준다 */
export const BoardConnBanner = ({ show, onRetry }: { show: boolean; onRetry: () => void }) =>
  show ? (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
      <p className="text-[15px] font-black text-amber-800 dark:text-amber-200">⚠️ 연결이 잠깐 끊겼어요. 지금 보이는 게시물은 마지막으로 불러온 내용이에요.</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[14px] font-black hover:bg-amber-600 transition-colors"
      >
        다시 불러오기
      </button>
    </div>
  ) : null;

/** 검색·보기 결과가 없을 때 */
export const BoardNoMatch = ({ query, mode }: { query: string; mode: BoardViewMode }) => (
  <div className="flex flex-col items-center py-20 space-y-2 text-center">
    <p className="text-lg font-black text-slate-600 dark:text-slate-300">
      {query.trim() ? `"${query.trim()}"에 맞는 게시물이 없어요` : mode === 'group' ? '조별로 제출한 결과물이 아직 없어요' : '보여줄 게시물이 없어요'}
    </p>
    <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
      {query.trim() ? '이름 일부만 써도 찾아져요. 다른 글자로 다시 찾아보세요.' : '위의 보기 방식을 "전체"로 바꿔 보세요.'}
    </p>
  </div>
);

/** "이름만" 보기: 사진은 하나도 불러오지 않고 이름 타일만. 타일을 누르면 그 친구의 카드가 열린다 */
export const BoardNameTiles = ({ sections, now, openKey, onToggle }: {
  sections: BoardSection[]; now: number; openKey: string | null; onToggle: (key: string) => void;
}) => (
  <div className="mb-6">
    <p className="text-[14px] font-bold text-slate-500 dark:text-slate-400 mb-3">이름을 누르면 그 친구의 사진·글이 열려요 (누르기 전에는 사진을 불러오지 않아요)</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {sections.map((s) => {
        const fresh = s.posts.some((p) => isRecentPost(p, now));
        const latest = s.posts.map(postLatestAt).sort().pop() || '';
        const open = openKey === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            aria-pressed={open}
            className={`text-left rounded-2xl border-2 px-4 py-3 transition-colors ${
              open ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                : fresh ? 'border-rose-300 bg-rose-50 dark:bg-rose-900/20 hover:border-rose-400'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300'
            }`}
          >
            <p className="text-[17px] font-black text-slate-900 dark:text-slate-100 truncate">{s.title}</p>
            <p className="text-[14px] font-bold text-slate-500 dark:text-slate-400">{s.posts.length}건{latest ? ` · ${agoLabel(latest, now)}` : ''}</p>
            {fresh && <span className="inline-block mt-1 text-[13px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white">🆕 방금</span>}
          </button>
        );
      })}
    </div>
  </div>
);

/** 30장씩 끊어 보여 주는 "더 보기" 버튼 */
export const BoardMoreButton = ({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) =>
  total > shown ? (
    <div className="flex flex-col items-center gap-2 py-6">
      <p className="text-[14px] font-bold text-slate-500 dark:text-slate-400">{total}장 중 {shown}장을 보고 있어요</p>
      <button
        type="button"
        onClick={onMore}
        className="px-6 py-3 rounded-2xl bg-indigo-600 text-white text-[15px] font-black hover:bg-indigo-700 transition-colors"
      >
        {Math.min(BOARD_PAGE, total - shown)}장 더 보기
      </button>
    </div>
  ) : null;
