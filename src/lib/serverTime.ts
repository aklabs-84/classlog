/**
 * 실시간 퀴즈용 서버 시계 보정.
 * 서버(DB)가 응답에 실어 주는 현재 시각(ms)과, 요청을 보내고 받은 기기 시각으로
 * "서버 시계 - 이 기기 시계" 차이를 구한다. 기기 시계가 몇 초 틀려도 now()가 서버 기준이 된다.
 * (예전 방식인 HTTP Date 헤더는 브라우저가 CORS 때문에 읽지 못해 보정이 한 번도 작동하지 않았다.)
 *
 * 왕복 시간(rtt)이 짧은 측정일수록 정확하므로, 가장 짧았던 측정을 우선 쓰되
 * 30초가 지나면 기기 시계가 흘러간 것까지 반영하도록 새 측정으로 갈아 끼운다.
 */
export class ServerClock {
  private offset = 0;
  private bestRtt = Infinity;
  private bestAt = 0;

  /** serverMs: 서버가 알려준 시각, t0/t1: 요청 보내기 직전/응답 받은 직후의 Date.now() */
  sample(serverMs: unknown, t0: number, t1: number) {
    if (typeof serverMs !== 'number' || !isFinite(serverMs) || t1 < t0) return;
    const rtt = t1 - t0;
    if (rtt > 5000) return; // 너무 느린 응답은 오차가 커서 무시
    const stale = t1 - this.bestAt > 30000;
    if (rtt <= this.bestRtt || stale) {
      this.offset = serverMs - (t0 + t1) / 2;
      this.bestRtt = rtt;
      this.bestAt = t1;
    }
  }

  /** 서버 기준 현재 시각(ms) */
  now() {
    return Date.now() + this.offset;
  }
}

/** DB가 주는 시각 문자열(마이크로초 6자리)을 사파리 등에서도 안전하게 읽도록 밀리초 3자리로 줄여 변환 */
export const parseServerTs = (iso: string) => new Date(iso.replace(/(\.\d{3})\d+/, '$1')).getTime();
