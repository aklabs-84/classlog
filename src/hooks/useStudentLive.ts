import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// 선생님 "학생 화면 따라 보기" (실시간)
// - 학생 쪽(broadcaster): 지금 열린 탭·스크롤·입력 중인 글을 1.5초마다 "통로"로 알린다
// - 선생님 미리보기 창(follower): 같은 통로를 듣고 같은 탭을 열고 같은 곳으로 스크롤하고 같은 글을 채운다
// - 통로 이름은 학생마다 따로 있는 비밀 열쇠(students.live_key)로 만들고, 선생님은 담당 반 학생 것만 받을 수 있다

interface LiveField { v: string; c?: boolean }
interface LiveState {
  tab: string;
  scroll: { i: number; r: number };
  fields: LiveField[];
  mat: string | null;
  t: number;
}

const FIELD_SELECTOR = 'textarea, input:not([type=hidden]):not([type=file]):not([type=password]):not([type=button]):not([type=submit]), [contenteditable="true"]';
const SCROLL_SELECTOR = '[class*="overflow-y-auto"], [class*="overflow-auto"]';
const MAX_FIELDS = 40;
const MAX_LEN = 5000;
const SEND_MS = 1500;
const OFFLINE_MS = 6000;
const WATCH_PING_MS = 4000;
const WATCHED_HOLD_MS = 9000;

const isCheckable = (el: Element) => el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

const readFields = (): LiveField[] =>
  Array.from(document.querySelectorAll(FIELD_SELECTOR)).slice(0, MAX_FIELDS).map(el => {
    if (isCheckable(el)) return { v: '', c: (el as HTMLInputElement).checked };
    if (el instanceof HTMLElement && el.isContentEditable) return { v: (el.textContent || '').slice(0, MAX_LEN) };
    return { v: ((el as HTMLInputElement | HTMLTextAreaElement).value || '').slice(0, MAX_LEN) };
  });

const applyFields = (fields: LiveField[]) => {
  const els = Array.from(document.querySelectorAll(FIELD_SELECTOR)).slice(0, MAX_FIELDS);
  fields.forEach((f, i) => {
    const el = els[i];
    if (!el) return;
    if (isCheckable(el)) {
      if ((el as HTMLInputElement).checked !== !!f.c) (el as HTMLInputElement).click();
      return;
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
      if ((el.textContent || '') !== f.v) el.textContent = f.v;
      return;
    }
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    if (input.value === f.v) return;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, f.v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const readScroll = (target: { current: EventTarget | null }) => {
  const t = target.current;
  if (t && t instanceof HTMLElement) {
    const i = Array.from(document.querySelectorAll(SCROLL_SELECTOR)).indexOf(t);
    const max = t.scrollHeight - t.clientHeight;
    if (i >= 0 && max > 0) return { i, r: t.scrollTop / max };
  }
  const root = document.scrollingElement || document.documentElement;
  const max = root.scrollHeight - root.clientHeight;
  return { i: -1, r: max > 0 ? root.scrollTop / max : 0 };
};

const applyScroll = (s: { i: number; r: number }) => {
  const el = s.i >= 0 ? document.querySelectorAll(SCROLL_SELECTOR)[s.i] : (document.scrollingElement || document.documentElement);
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max > 0) el.scrollTo({ top: s.r * max });
};

interface Options {
  session: any;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  /** 지금 전체화면으로 열려 있는 수업 자료 id (없으면 null) */
  materialId: string | null;
  /** 선생님 창에서 자료를 열거나(id) 닫는다(null). 학생 기록(열람 횟수)은 남기지 않는다 */
  openMaterialById: (id: string | null) => void;
}

/** 반환값 watched: 학생 화면에서 "선생님이 보고 있어요" 표시를 띄울지 */
export const useStudentLive = ({ session, activeTab, setActiveTab, materialId, openMaterialById }: Options) => {
  const [watched, setWatched] = useState(false);
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  const matRef = useRef(materialId);
  matRef.current = materialId;
  const openMatRef = useRef(openMaterialById);
  openMatRef.current = openMaterialById;
  const lastScrollTarget = useRef<EventTarget | null>(null);

  const followKey: string | undefined = session?.live_follow_key;
  const isPreview = !!session?.preview || !!session?.is_teacher;

  // ── 학생 쪽: 내 상태를 알린다 ──
  useEffect(() => {
    if (!session?.token || isPreview || followKey) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let watchedTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSent = '';

    const onScroll = (e: Event) => { lastScrollTarget.current = e.target instanceof HTMLElement ? e.target : null; };
    document.addEventListener('scroll', onScroll, true);

    (async () => {
      const { data: key } = await supabase.rpc('student_live_key', { p_token: session.token });
      if (cancelled || !key) return;
      channel = supabase.channel(`live:${key}`, { config: { broadcast: { self: false } } });
      const send = (force = false) => {
        const state: LiveState = { tab: tabRef.current, scroll: readScroll(lastScrollTarget), fields: readFields(), mat: matRef.current, t: Date.now() };
        const sig = JSON.stringify({ ...state, t: 0 });
        if (!force && sig === lastSent) {
          channel?.send({ type: 'broadcast', event: 'beat', payload: { t: state.t } });
          return;
        }
        lastSent = sig;
        channel?.send({ type: 'broadcast', event: 'state', payload: state });
      };
      channel
        .on('broadcast', { event: 'request' }, () => send(true))
        .on('broadcast', { event: 'watching' }, () => {
          setWatched(true);
          clearTimeout(watchedTimer);
          watchedTimer = setTimeout(() => setWatched(false), WATCHED_HOLD_MS);
        })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') timer = setInterval(() => send(), SEND_MS);
        });
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('scroll', onScroll, true);
      clearInterval(timer);
      clearTimeout(watchedTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.token, isPreview, followKey]);

  // ── 선생님 미리보기 창: 학생 상태를 따라 한다 ──
  useEffect(() => {
    if (!followKey) return;
    let lastBeat = 0;
    let lastState: LiveState | null = null;
    const report = (online: boolean) => window.parent?.postMessage({ type: 'student-live-status', online }, window.location.origin);

    const channel = supabase.channel(`live:${followKey}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        lastBeat = Date.now();
        lastState = payload as LiveState;
        if (lastState.tab && lastState.tab !== tabRef.current) setActiveTab(lastState.tab);
        if ((lastState.mat ?? null) !== matRef.current) openMatRef.current(lastState.mat ?? null);
      })
      .on('broadcast', { event: 'beat' }, () => { lastBeat = Date.now(); })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') channel.send({ type: 'broadcast', event: 'request', payload: {} });
      });

    // 탭이 바뀌어 화면이 그려진 뒤에 스크롤·글을 맞춘다
    const applyTimer = setInterval(() => {
      // 자료 목록이 늦게 불러와져 못 열었을 때를 위해 계속 맞춰 본다
      if (lastState && (lastState.mat ?? null) !== matRef.current) openMatRef.current(lastState.mat ?? null);
      if (lastState && lastState.tab === tabRef.current) {
        applyFields(lastState.fields || []);
        if (lastState.scroll) applyScroll(lastState.scroll);
      }
      report(Date.now() - lastBeat < OFFLINE_MS);
    }, 700);
    const pingTimer = setInterval(() => channel.send({ type: 'broadcast', event: 'watching', payload: {} }), WATCH_PING_MS);
    channel.send({ type: 'broadcast', event: 'watching', payload: {} });

    return () => {
      clearInterval(applyTimer);
      clearInterval(pingTimer);
      supabase.removeChannel(channel);
    };
  }, [followKey, setActiveTab]);

  return { watched, following: !!followKey };
};
