import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// 우리반 보드(학생 보드 / 선생님 클래스룸 보드 / 새 탭 보드) 3곳이 함께 쓰는 공용 규칙
// - 가장 최근 제출 시각 기준 정렬, "방금 제출" 표시(10분), 개인별·조별 묶기, 검색
// - 5초마다 "새 데이터 있나?"만 아주 작게 확인하고, 바뀐 때만 전체를 다시 불러온다 (Supabase 데이터 사용량 절약)

export const RECENT_MS = 10 * 60 * 1000; // "방금" 표시를 유지하는 시간
export const LIVE_POLL_MS = 5000;        // 새 제출 확인 간격
const FRESH_MS = 8000;                   // 새로 들어온 카드 강조 유지 시간

export type BoardViewMode = 'all' | 'student' | 'group' | 'tiles';

export const postKey = (p: any): string => `${p._type}-${p.id}`;
export const postLatestAt = (p: any): string => p._latestAt || p.created_at;
const ts = (iso: string) => new Date(iso).getTime();

export const isRecentPost = (p: any, now: number): boolean => {
  const d = now - ts(postLatestAt(p));
  return d < RECENT_MS; // 기기 시계가 조금 빨라서 음수가 나와도 "방금"으로 본다
};

/** 같은 학생·주차·날짜에 여러 번 낸 제출을 한 카드로 합침 — 카드 시각은 "가장 최근 제출" 기준 */
export const mergeDaySubmissions = (subs: any[]): any => {
  const sorted = [...subs].sort((a, b) => ts(a.created_at) - ts(b.created_at));
  const ids = new Set<string>();
  const names: string[] = [];
  let groupId: string | null = null;
  let groupName: string | null = null;
  for (const s of sorted) {
    (s._memberIds || [s.student_id]).forEach((id: string, i: number) => {
      if (!ids.has(id)) { ids.add(id); names.push((s._memberNames || [s.student_name])[i] || '학생'); }
    });
    groupId = groupId || s._groupId || null;
    groupName = groupName || s._groupName || null;
  }
  return {
    ...sorted[0],
    _submissions: sorted,
    _latestAt: sorted[sorted.length - 1].created_at,
    _memberIds: [...ids],
    _memberNames: names,
    _groupId: groupId,
    _groupName: groupName,
  };
};

/** 제출 묶음(여러 행)에서 조원 정보 뽑기 */
export const boardMemberInfo = (group: any[], nameMap: Record<string, string>) => {
  const ids = [...new Set(group.map((r: any) => r.student_id))] as string[];
  return {
    _memberIds: ids,
    _memberNames: ids.map((id) => nameMap[id] || '학생'),
    _groupId: (group.find((r: any) => r.group_id)?.group_id as string | undefined) || null,
  };
};

/** 조 이름 조회 — 한 번에 모아서 가볍게. 권한이 없으면 조용히 비워 두고 조원 이름으로 대신 보여 준다 */
export const fetchGroupNameMap = async (resultRows: any[]): Promise<Record<string, string>> => {
  const ids = [...new Set(resultRows.filter((r) => r.is_group_submission && r.group_id).map((r) => r.group_id))] as string[];
  if (ids.length === 0) return {};
  try {
    const { data } = await supabase.from('class_groups').select('id, name').in('id', ids);
    return Object.fromEntries((data || []).map((g: any) => [g.id, g.name]));
  } catch {
    return {};
  }
};

export const attachGroupNames = (posts: any[], groupNames: Record<string, string>): any[] =>
  posts.map((p) => (p._groupId && groupNames[p._groupId] ? { ...p, _groupName: groupNames[p._groupId] } : p));

export const sortBoardPosts = (posts: any[]): any[] =>
  [...posts].sort((a, b) => ts(postLatestAt(b)) - ts(postLatestAt(a)));

const memberNamesOf = (p: any): string[] => (p._memberNames?.length ? p._memberNames : [p.student_name || '학생']);

/** 카드에 보일 작성자 이름 — 조별 제출은 조 이름, 없으면 "대표 외 N명" */
export const authorLabel = (p: any): string => {
  if (p._type === 'result' && p._isGroupSub) {
    const m = memberNamesOf(p);
    if (p._groupName) return p._groupName;
    if (m.length > 1) return `${m[0]} 외 ${m.length - 1}명`;
  }
  return p.student_name || '학생';
};

export const agoLabel = (iso: string, now: number): string => {
  const diff = now - ts(iso);
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const norm = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

const nameText = (p: any): string => norm([...memberNamesOf(p), p._groupName, p.student_name].filter(Boolean).join(' '));

const searchText = (p: any): string =>
  norm(
    [
      ...memberNamesOf(p), p._groupName, p.student_name, p.title, p.activity_name, p.content, p.feeling,
      p.text_content, p.display_name, p.link_url,
    ].filter(Boolean).join(' ')
  );

export const filterBoardPosts = (
  posts: any[],
  f: { type: 'all' | 'obs' | 'result'; week: number | 'all'; query: string }
): any[] => {
  const words = f.query.trim().split(/\s+/).map(norm).filter(Boolean);
  const base = posts.filter((p) => (f.type === 'all' || p._type === f.type) && (f.week === 'all' || p.week_number === f.week));
  if (words.length === 0) return base;
  // 이름이 맞는 사람이 있으면 그 사람(조)만, 없을 때만 제목·내용에서 찾는다 (다른 글에 이름이 언급된 것까지 섞이지 않게)
  const byName = base.filter((p) => { const t = nameText(p); return words.every((w) => t.includes(w)); });
  if (byName.length > 0) return byName;
  return base.filter((p) => { const t = searchText(p); return words.every((w) => t.includes(w)); });
};

export type BoardSection = { key: string; title: string | null; subtitle: string; isGroup: boolean; posts: any[] };

/** 보기 방식에 따라 카드를 묶는다. 전체=묶음 없음, 개인별=학생마다, 조별=조 제출만 조마다 */
export const buildBoardSections = (posts: any[], rawMode: BoardViewMode): BoardSection[] => {
  const mode = rawMode === 'tiles' ? 'student' : rawMode; // 이름 타일 = 학생별 묶음을 타일로 먼저 보여 줌
  if (mode === 'all') return [{ key: 'all', title: null, subtitle: '', isGroup: false, posts }];
  const map = new Map<string, BoardSection>();
  const add = (key: string, title: string, isGroup: boolean, p: any) => {
    let s = map.get(key);
    if (!s) { s = { key, title, subtitle: '', isGroup, posts: [] }; map.set(key, s); }
    s.posts.push(p);
  };
  for (const p of posts) {
    if (mode === 'group') {
      if (p._type !== 'result' || !p._isGroupSub) continue;
      const m = memberNamesOf(p);
      const key = p._groupId || `m_${[...(p._memberIds || [p.student_id])].sort().join('_')}`;
      add(key, p._groupName || (m.length > 1 ? `${m[0]} 외 ${m.length - 1}명` : m[0]), true, p);
    } else {
      const ids: string[] = p._memberIds?.length ? p._memberIds : [p.student_id];
      const names = memberNamesOf(p);
      ids.forEach((id, i) => add(id, names[i] || p.student_name || '학생', false, p));
    }
  }
  const list = [...map.values()];
  list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
  for (const s of list) {
    const obs = s.posts.filter((p) => p._type === 'obs').length;
    const res = s.posts.length - obs;
    s.subtitle = s.isGroup ? `조별 결과 ${res}건` : `활동 기록 ${obs}건 · 결과 ${res}건`;
  }
  return list;
};

export const useNow = (ms = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
};

/**
 * 5초마다 "마지막 제출 시각 + 개수"만 확인(데이터 수 KB)하고, 달라졌을 때만 refetch.
 * 화면이 안 보이거나(active=false, 탭 숨김) 하면 쉰다.
 */
export const useBoardLiveRefresh = (opts: {
  classId: string | null | undefined;
  active: boolean;
  refetch: () => void;
  /** 로그인 없는 화면(학생)처럼 직접 조회가 막힌 곳은 전용 창구로 "지문"을 받아 온다. 실패하면 null */
  getSignature?: () => Promise<string | null>;
}) => {
  const { classId, active, refetch } = opts;
  const getSigRef = useRef(opts.getSignature);
  getSigRef.current = opts.getSignature;
  const sigRef = useRef<string | null>(null);
  const idsRef = useRef<{ ids: string[]; at: number } | null>(null);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    sigRef.current = null;
    idsRef.current = null;
  }, [classId]);

  useEffect(() => {
    if (!classId || !active) return;
    let stopped = false;
    let busy = false;

    const check = async () => {
      if (busy || stopped || document.hidden) return;
      busy = true;
      try {
        if (getSigRef.current) {
          const sig = await getSigRef.current();
          if (sig === null) return;
          if (sigRef.current !== null && sigRef.current !== sig) refetchRef.current();
          sigRef.current = sig;
          return;
        }
        if (!idsRef.current || Date.now() - idsRef.current.at > 120_000) {
          const { data } = await supabase.from('students').select('id').eq('class_id', classId);
          idsRef.current = { ids: (data || []).map((s: any) => s.id), at: Date.now() };
        }
        const ids = idsRef.current.ids;
        if (ids.length === 0) return;
        const [r, o] = await Promise.all([
          supabase.from('student_results').select('created_at', { count: 'exact' })
            .in('student_id', ids).order('created_at', { ascending: false }).limit(1),
          supabase.from('observations').select('created_at', { count: 'exact' })
            .in('student_id', ids).eq('is_student_record', true).eq('status', 'approved')
            .order('created_at', { ascending: false }).limit(1),
        ]);
        if (r.error || o.error) return;
        const sig = `${r.count}|${r.data?.[0]?.created_at ?? ''}|${o.count}|${o.data?.[0]?.created_at ?? ''}`;
        if (sigRef.current !== null && sigRef.current !== sig) refetchRef.current();
        sigRef.current = sig;
      } catch {
        // 네트워크가 잠깐 끊겨도 다음 확인에서 다시 시도
      } finally {
        busy = false;
      }
    };

    const id = setInterval(check, LIVE_POLL_MS);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [classId, active]);
};

/** 화면을 연 뒤 새로 들어온(또는 다시 제출된) 카드를 찾아 잠깐 강조 + "N건 새로 왔어요" 알림 */
export const useNewArrivals = (posts: any[], resetKey?: string | null) => {
  const seenRef = useRef<Map<string, string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const [newCount, setNewCount] = useState(0);

  // 다른 반으로 바꾸면 처음부터 다시 기준을 잡는다 (반이 바뀐 걸 "새 제출"로 착각하지 않게)
  useEffect(() => {
    seenRef.current = null;
    setFreshKeys(new Set());
    setNewCount(0);
  }, [resetKey]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (posts.length === 0) return;
    const cur = new Map(posts.map((p) => [postKey(p), postLatestAt(p)]));
    if (seenRef.current === null) { seenRef.current = cur; return; } // 처음 불러온 카드는 "새 카드"가 아님
    const changed = [...cur].filter(([k, t]) => seenRef.current!.get(k) !== t).map(([k]) => k);
    seenRef.current = cur;
    if (changed.length === 0) return;
    setFreshKeys(new Set(changed));
    setNewCount(changed.length);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setFreshKeys(new Set()); setNewCount(0); }, FRESH_MS);
  }, [posts]);

  return { freshKeys, newCount, dismiss: () => setNewCount(0) };
};


// ── 한 번에 많이 그리지 않기 (사진 불러오는 양을 줄이는 장치) ──
export const BOARD_PAGE = 30; // 처음에 보여 주는 카드 수. "더 보기"를 누를 때마다 이만큼 늘어남

/** 보기·검색·주차가 바뀌면 처음(30장, 열린 타일 없음)으로 돌아간다 */
export const useBoardPaging = (resetKey: string) => {
  const [limit, setLimit] = useState(BOARD_PAGE);
  const [openTile, setOpenTile] = useState<string | null>(null);
  useEffect(() => { setLimit(BOARD_PAGE); setOpenTile(null); }, [resetKey]);
  return {
    limit,
    more: () => setLimit((l) => l + BOARD_PAGE),
    openTile,
    toggleTile: (k: string) => setOpenTile((o) => (o === k ? null : k)),
  };
};

/** 묶음 순서대로 limit장까지만 남긴다 */
export const limitSections = (sections: BoardSection[], limit: number) => {
  const total = sections.reduce((n, s) => n + s.posts.length, 0);
  let left = limit;
  const out: BoardSection[] = [];
  for (const s of sections) {
    if (left <= 0) break;
    out.push(s.posts.length <= left ? s : { ...s, posts: s.posts.slice(0, left) });
    left -= s.posts.length;
  }
  return { sections: out, total, shown: Math.min(total, limit) };
};
