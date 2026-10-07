// 링크를 화면에 열 때 http/https 주소만 허용한다 (javascript: 같은 위험한 주소 차단)
export const safeHttpUrl = (u: string | null | undefined): string | undefined => {
  const t = (u || '').trim();
  return /^https?:\/\//i.test(t) ? t : undefined;
};

export const isUuid = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
