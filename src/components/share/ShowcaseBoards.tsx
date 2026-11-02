import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Image as ImageIcon, Loader2, X } from 'lucide-react';
import WhiteboardCanvas from '../whiteboard/WhiteboardCanvas';
import type { BoardObject } from '../whiteboard/types';

/** 발표회 윗줄 — 조별 협업 보드를 보기 전용으로 보여 준다. 두 공유 화면이 함께 쓴다. */
export interface ShowcaseBoard {
  id: string;
  title: string;
  group_name?: string | null;
  group_number?: number | null;
  updated_at: string;
  object_count: number;
  image_count: number;
  cover_image?: string | null;
  snippet?: string | null;
}

interface Props {
  /** 보드 목록을 받아 온다 (서버가 공유 코드/토큰을 확인) */
  loadList: () => Promise<ShowcaseBoard[]>;
  /** 보드 하나의 내용을 받아 온다 */
  loadObjects: (boardId: string) => Promise<BoardObject[]>;
  accent: string;
}

const noop = () => {};

// 발표 모드(다른 컴포넌트)에서도 같은 보드 목록·열기 기능을 쓰도록 가벼운 공용 저장소를 둔다
let store: { boards: ShowcaseBoard[]; openId: string | null } = { boards: [], openId: null };
const listeners = new Set<() => void>();
const setStore = (patch: Partial<typeof store>) => { store = { ...store, ...patch }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getStore = () => store;

export const openShowcaseBoard = (id: string) => setStore({ openId: id });
export const useShowcaseBoardState = () => useSyncExternalStore(subscribe, getStore);

/** 조 이름이 같으면 그 보드, 아니면 조 순서(1번째 조=1조 보드)로 짝짓는다 */
export const findBoardForGroup = (boards: ShowcaseBoard[], owner: string, order?: number) =>
  boards.find(b => b.group_name === owner) || (order ? boards.find(b => b.group_number === order) : undefined) || null;

const ShowcaseBoards = ({ loadList, loadObjects, accent }: Props) => {
  const { boards: storeBoards, openId } = useShowcaseBoardState();
  const [loaded, setLoaded] = useState(false);
  const boards = loaded ? storeBoards : null;
  const setOpenId = (id: string | null) => setStore({ openId: id });
  const [objects, setObjects] = useState<BoardObject[] | null>(null);
  const [failed, setFailed] = useState(false);

  // 발표회 탭이 열릴 때 한 번만 목록을 받는다
  useEffect(() => {
    let dead = false;
    loadList().then(r => { if (!dead) { setStore({ boards: r }); setLoaded(true); } }).catch(() => { if (!dead) { setStore({ boards: [] }); setLoaded(true); } });
    return () => { dead = true; setStore({ boards: [], openId: null }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openId) return;
    let dead = false;
    setObjects(null);
    setFailed(false);
    loadObjects(openId).then(r => { if (!dead) setObjects(r); }).catch(() => { if (!dead) setFailed(true); });
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpenId(null); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { dead = true; window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!boards || boards.length === 0) return null;
  const cur = boards.find(b => b.id === openId) || null;

  return (
    <section className="space-y-3 print:hidden" data-tour="showcase-boards">
      <div>
        <h2 className="text-xl font-black text-gray-900">조별 협업 보드</h2>
        <p className="text-[15px] font-bold text-gray-500">조가 함께 만든 과정이에요 · 누르면 크게 볼 수 있어요 (보기만 가능)</p>
      </div>
      <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {boards.map(b => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setOpenId(b.id)}
              className="w-full text-left bg-white rounded-2xl border border-gray-200 overflow-hidden hover:border-gray-400 transition-colors"
              aria-label={`${b.group_name || b.title} 협업 보드 크게 보기`}
            >
              <div className="aspect-[16/10] bg-gray-50 flex items-center justify-center overflow-hidden">
                {b.cover_image ? (
                  <img src={b.cover_image} alt="" loading="lazy" className="w-full h-full object-cover" />
                ) : b.snippet ? (
                  <p className="p-3 text-[14px] font-bold text-gray-500 line-clamp-4 break-words">{b.snippet}</p>
                ) : (
                  <ImageIcon size={28} className="text-gray-300" aria-hidden />
                )}
              </div>
              <div className="p-3">
                <p className="text-lg font-black leading-snug text-gray-900 truncate">{b.group_name || b.title}</p>
                <p className="text-[13px] font-bold" style={{ color: accent }}>
                  {b.object_count > 0 ? `조각 ${b.object_count}개${b.image_count > 0 ? ` · 사진 ${b.image_count}` : ''}` : '아직 비어 있어요'}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {cur && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col print:hidden" role="dialog" aria-modal="true" aria-label={`${cur.group_name || cur.title} 협업 보드`}>
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 shrink-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-[14px] font-black text-white/80"><Eye size={14} aria-hidden /> 보기 전용</span>
            <p className="text-lg font-black truncate">{cur.group_name || cur.title}</p>
            <button type="button" onClick={() => setOpenId(null)} className="ml-auto w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center" aria-label="보드 닫기">
              <X size={22} aria-hidden />
            </button>
          </div>
          <div className="flex-1 relative bg-gray-100 text-gray-900 overflow-hidden">
            {failed ? (
              <p className="absolute inset-0 flex items-center justify-center text-[16px] font-bold text-gray-500">보드를 불러오지 못했어요. 닫고 다시 눌러 주세요.</p>
            ) : !objects ? (
              <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" aria-label="불러오는 중" /></div>
            ) : (
              <div data-canvas="true" style={{ width: '100%', height: '100%' }}>
                <WhiteboardCanvas
                  boardId={cur.id}
                  objects={objects}
                  activeTool="select"
                  selectedId={null}
                  isViewer
                  remoteCursors={{}}
                  onToolChange={noop}
                  onSelectObject={noop}
                  onAddObject={noop}
                  onUpdateObject={noop}
                  onDeleteObject={noop}
                  onCursorMove={noop}
                />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
};

export default ShowcaseBoards;
