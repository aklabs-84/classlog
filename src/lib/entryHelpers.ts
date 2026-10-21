// 학생 입장(입장코드·퀴즈 PIN·설문 PIN) 화면이 함께 쓰는 연결 오류 대응 도구

// 연결이 잠깐 흔들려 실패한 경우를 위해 한 번 더 시도한다.
// (진짜 "없는 코드/틀린 PIN"과 "연결·서버 문제"를 구분해서 안내하기 위함)
export const rpcWithRetry = async (call: () => PromiseLike<{ data: any; error: any }>) => {
  let res = await call();
  if (res.error) {
    await new Promise(r => setTimeout(r, 800));
    res = await call();
  }
  return res;
};

// 학생이 직접 "강제 새로고침"을 하지 않아도 되도록: 저장된 옛 화면 파일(서비스 워커·캐시)을 지우고 다시 불러온다.
// target 은 새로고침 후 돌아갈 주소(입장 코드·PIN 이 주소에 담겨 있으면 다시 입력하지 않아도 된다).
export const hardReload = async (target: string) => {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map(r => r.unregister()));
    const keys = await caches?.keys?.();
    await Promise.all((keys ?? []).map(k => caches.delete(k)));
  } catch { /* 지우기에 실패해도 그냥 새로고침은 진행 */ }
  window.location.replace(target);
};

export const CONNECTION_ERROR_MSG =
  '연결이 불안정해요. 잠시 후 다시 눌러 주세요. 계속 안 되면 아래 [새로고침하고 다시 하기]를 눌러 주세요.';
