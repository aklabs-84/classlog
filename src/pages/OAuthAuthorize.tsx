import { useEffect, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { KeyRound, ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, isAnonymousUser } from '../lib/auth';
import { saveOAuthReturn } from '../lib/oauthReturn';

// AI 연결 승인 화면: ChatGPT 같은 앱이 "내 클래스로그AI를 써도 될까요?" 하고 물을 때 선생님이 허락하는 곳
const SCOPES = [
  { id: 'read', label: '읽기만', desc: 'AI가 내 자료를 보기만 해요. 아무것도 만들거나 바꾸지 못해요. (추천)' },
  { id: 'write_create', label: '읽기 + 만들기', desc: '새 반·주차·공지·자료·설문·퀴즈·슬라이드·학교 프로젝트 틀을 만들 수 있어요. 있던 것은 못 바꿔요.' },
  { id: 'write_edit', label: '읽기 + 만들기 + 바꾸기', desc: '이미 있는 반 이름·자료 내용·공지도 고칠 수 있어요. 가장 조심해서 쓰세요.' },
] as const;

const addParams = (uri: string, params: Record<string, string | null>) => {
  const u = new URL(uri);
  Object.entries(params).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
  return u.toString();
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white rounded-3xl border border-surface-container shadow-xl p-6 sm:p-8 space-y-5">
      {children}
    </div>
  </div>
);

const OAuthAuthorize = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sp] = useSearchParams();
  const clientId = sp.get('client_id') ?? '';
  const redirectUri = sp.get('redirect_uri') ?? '';
  const state = sp.get('state');
  const challenge = sp.get('code_challenge') ?? '';
  const paramsOk = sp.get('response_type') === 'code' && sp.get('code_challenge_method') === 'S256'
    && !!clientId && !!redirectUri && /^[A-Za-z0-9_-]{43}$/.test(challenge);

  const [appName, setAppName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<string>('read');
  const [busy, setBusy] = useState(false);

  const isTeacher = !!user && !isAnonymousUser(user);

  // 로그인 안 했으면 현재 주소를 적어 두고 로그인 화면으로 (로그인 후 여기로 되돌아옴)
  useEffect(() => {
    if (!loading && !isTeacher && paramsOk) saveOAuthReturn(location.pathname + location.search);
  }, [loading, isTeacher, paramsOk, location.pathname, location.search]);

  // 앱 이름 확인 (등록된 되돌아올 주소와 같을 때만 통과)
  useEffect(() => {
    if (!isTeacher || !paramsOk) return;
    let alive = true;
    supabase.rpc('oauth_client_info', { p_client_id: clientId, p_redirect_uri: redirectUri }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e || !data) setError('이 연결 요청을 확인할 수 없어요. 앱에서 연결을 처음부터 다시 시도해 주세요.');
      else setAppName((data as { name: string }).name);
    });
    return () => { alive = false; };
  }, [isTeacher, paramsOk, clientId, redirectUri]);

  if (loading) {
    return (
      <Shell>
        <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </Shell>
    );
  }
  if (!paramsOk) {
    return (
      <Shell>
        <div className="flex items-start gap-3 text-red-600"><AlertTriangle className="w-6 h-6 shrink-0" />
          <p className="text-sm font-bold">연결 요청 정보가 올바르지 않아요. 앱에서 연결을 처음부터 다시 시도해 주세요.</p>
        </div>
      </Shell>
    );
  }
  if (!isTeacher) return <Navigate to="/login" replace />;

  const approve = async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('oauth_approve', {
      p_client_id: clientId, p_redirect_uri: redirectUri, p_code_challenge: challenge, p_scope: scope,
    });
    if (e || typeof data !== 'string') {
      setBusy(false);
      setError(e?.message.includes('rate_limited')
        ? '짧은 시간에 너무 많이 시도했어요. 잠시 뒤 다시 해 주세요.'
        : '허용 중 문제가 생겼어요. 앱에서 연결을 처음부터 다시 시도해 주세요.');
      return;
    }
    window.location.href = addParams(redirectUri, { code: data, state });
  };
  const deny = () => {
    window.location.href = addParams(redirectUri, { error: 'access_denied', state });
  };

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center"><KeyRound className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-lg font-black text-on-surface">AI 연결 허락</h1>
          <p className="text-xs text-on-surface-variant">클래스로그AI</p>
        </div>
      </div>

      {error && !appName ? (
        <div className="flex items-start gap-3 text-red-600"><AlertTriangle className="w-6 h-6 shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      ) : !appName ? (
        <div className="flex justify-center py-6"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <>
          <p className="text-sm text-on-surface leading-relaxed">
            <b>{appName}</b>이(가) 내 클래스로그AI에 연결하려고 해요. 어디까지 허락할지 골라 주세요.
          </p>
          <div role="radiogroup" aria-label="허락할 범위" className="grid gap-2">
            {SCOPES.map(o => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={scope === o.id}
                onClick={() => setScope(o.id)}
                className={`text-left p-3 rounded-xl border transition-all ${scope === o.id ? 'border-primary bg-primary/5' : 'border-surface-container bg-surface-container hover:border-primary/30'}`}
              >
                <span className="block text-sm font-bold text-on-surface">{o.label}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5 leading-relaxed">{o.desc}</span>
              </button>
            ))}
          </div>
          <div className="flex items-start gap-2 text-xs text-on-surface-variant bg-surface-container rounded-xl p-3">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
            <p className="leading-relaxed">학생 이름·제출물·평가는 어떤 경우에도 AI에게 보이지 않아요. 지우기도 못 해요. 연결은 90일 뒤 저절로 끝나고, 설정 &gt; AI 연결에서 언제든 끌 수 있어요.</p>
          </div>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={deny} disabled={busy}
              className="px-4 py-3 rounded-xl border border-surface-container text-sm font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-50">
              취소
            </button>
            <button type="button" onClick={approve} disabled={busy}
              className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}허용
            </button>
          </div>
        </>
      )}
    </Shell>
  );
};

export default OAuthAuthorize;
