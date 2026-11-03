// 화면이 보일 때만 주기적으로 실행하는 폴링 도구 (Supabase·Vercel 요청 절약)
// - 탭이 숨겨져 있으면 멈추고, 다시 보이는 순간 한 번 바로 실행해 최신 상태로 맞춘다
// - 반환값을 호출하면 멈춘다 (useEffect cleanup 용)
export function visiblePoll(fn: () => void | Promise<void>, ms: number): () => void {
  const run = () => { if (document.visibilityState === 'visible') void fn(); };
  const timer = setInterval(run, ms);
  const onVisible = () => { if (document.visibilityState === 'visible') void fn(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
