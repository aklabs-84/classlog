// 설정 > "AI 연결" 칸: ChatGPT·Claude 등 AI가 내 수업 자료를 읽을 수 있게 하는 "AI 연결 키" 발급·폐기.
// 열쇠 원본은 만들 때 딱 한 번만 보여 준다(서버에는 지문만 저장).
import { useCallback, useEffect, useState } from 'react';
import { Plug, Copy, Check, Loader2, Trash2, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { appConfirm, appToast } from '../lib/appDialog';

const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`;

type TokenRow = {
  id: string; name: string; last4: string; scope: string;
  expires_at: string; revoked_at: string | null; last_used_at: string | null; created_at: string;
};

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '-');

const CopyBtn = ({ text, label = '복사' }: { text: string; label?: string }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }
        catch { appToast('복사하지 못했어요. 직접 드래그해서 복사해 주세요.'); }
      }}
      className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all"
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? '복사됨' : label}
    </button>
  );
};

// 복사할 값 한 줄 (이름 + 값 + 복사 버튼). value가 없으면 안내 문구만 보여 준다.
const CopyRow = ({ label, value, emptyHint }: { label: string; value: string | null; emptyHint?: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-bold text-on-surface-variant">{label}</p>
    {value ? (
      <div className="flex gap-2 items-start">
        <code className="flex-1 min-w-0 px-3 py-2.5 bg-surface-container rounded-xl text-sm font-mono break-all select-all">{value}</code>
        <CopyBtn text={value} />
      </div>
    ) : (
      <p className="px-3 py-2.5 bg-surface-container rounded-xl text-xs text-on-surface-variant">{emptyHint}</p>
    )}
  </div>
);

const Tip = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs leading-relaxed px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-on-surface">💡 {children}</p>
);

const Shot = ({ src, alt, caption, width }: { src: string; alt: string; caption: string; width: number }) => (
  <figure className="space-y-1" style={{ maxWidth: width }}>
    <a href={src} target="_blank" rel="noreferrer" title="눌러서 크게 보기">
      <img src={src} alt={alt} loading="lazy" className="w-full rounded-xl border border-surface-container-highest" />
    </a>
    <figcaption className="text-[11px] text-on-surface-variant leading-snug">{caption}</figcaption>
  </figure>
);

type StepDef = { short: string; title: string; body: React.ReactNode };

// 한 번에 한 단계만 크게 보여 주는 안내. 위쪽 칩으로 전체 흐름을 보고 누르면 이동한다.
const Stepper = ({ steps }: { steps: StepDef[] }) => {
  const [cur, setCur] = useState(0);
  const last = steps.length - 1;
  const s = steps[cur];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {steps.map((st, i) => (
          <button
            key={st.short}
            type="button"
            onClick={() => setCur(i)}
            className={`flex-1 min-w-[44%] sm:min-w-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-left transition-all ${
              i === cur ? 'bg-primary text-white' : i < cur ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${i === cur ? 'bg-white/25' : 'bg-black/5'}`}>
              {i < cur ? <Check size={12} /> : i + 1}
            </span>
            <span className="min-w-0 break-keep">{st.short}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-primary">{cur + 1} / {steps.length} 단계</p>
        <h4 className="text-base font-bold leading-snug break-keep">{s.title}</h4>
        <div className="space-y-3 text-sm leading-relaxed">{s.body}</div>
      </div>

      <div className="flex gap-2 pt-1">
        {cur > 0 && (
          <button type="button" onClick={() => setCur(cur - 1)} className="px-4 py-2.5 rounded-xl bg-surface-container text-xs font-bold hover:bg-surface-container-high">← 이전</button>
        )}
        {cur < last ? (
          <button type="button" onClick={() => setCur(cur + 1)} className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all">다음 단계 →</button>
        ) : (
          <p className="px-1 py-2 text-sm font-bold text-primary">🎉 여기까지 하면 연결 끝이에요!</p>
        )}
      </div>
    </div>
  );
};

const TABS = [
  { id: 'claude', label: '클로드 (웹·앱)' },
  { id: 'code', label: '클로드 코드' },
  { id: 'gemini', label: '제미나이 CLI' },
  { id: 'chatgpt', label: '챗GPT' },
] as const;
type TabId = typeof TABS[number]['id'];

const ConnectGuide = ({ newKey }: { newKey: string | null }) => {
  const [tab, setTab] = useState<TabId>('claude');
  const bearer = newKey ? `Bearer ${newKey}` : null;
  const noKey = '위에서 열쇠를 먼저 만들면 여기에 나와요. (열쇠는 만든 직후에만 볼 수 있어요)';
  const cli = (head: string) => (newKey ? `${head} classlog ${MCP_URL} --header "Authorization: Bearer ${newKey}"` : null);

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">어디에 연결하나요?</p>
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${tab === t.id ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 rounded-2xl border border-surface-container-highest space-y-4">
        {tab === 'claude' && (
          <div className="space-y-4">
            <p className="text-xs text-on-surface-variant">claude.ai 웹이나 클로드 앱에서 연결해요. <b>4단계, 약 3분</b>이면 끝나요. 무료 계정도 되지만 커넥터는 1개까지예요.</p>
            <Stepper
              key="claude"
              steps={[
                {
                  short: '커넥터 열기',
                  title: '클로드 설정 → 커넥터에서 "+ 추가"를 누르세요',
                  body: (
                    <>
                      <p>설정 왼쪽 메뉴의 <b>커넥터</b>를 누르고, 오른쪽 위 <b>+ 추가</b> → <b>커스텀 커넥터 추가</b>를 고르세요.</p>
                      <Shot src="/ai-connect/claude-1-connectors.png" alt="클로드 커넥터 화면, 오른쪽 위 추가 버튼" caption="오른쪽 위의 검은색 + 추가 버튼이에요." width={460} />
                      <p className="text-xs text-on-surface-variant">영어 화면이면 Customize → Connectors → Add custom connector 예요.</p>
                    </>
                  ),
                },
                {
                  short: '주소 넣기',
                  title: '이름은 아무거나, 주소는 아래를 붙여 넣으세요',
                  body: (
                    <>
                      <p>이름 칸에는 <b>클래스로그</b>처럼 알아볼 이름을, 주소 칸에는 아래 주소를 넣어요.</p>
                      <CopyRow label="연결 주소" value={MCP_URL} />
                    </>
                  ),
                },
                {
                  short: '로그인 없음 + 열쇠',
                  title: '인증은 "로그인 없음", 열쇠는 헤더 칸에 넣으세요',
                  body: (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <p className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30">✗ <b>지금 로그인</b><br /><span className="text-on-surface-variant">처음에 이게 골라져 있어요. 이대로면 연결이 안 돼요.</span></p>
                        <p className="px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30">✓ <b>로그인 없음</b><br /><span className="text-on-surface-variant">이걸 고르세요.</span></p>
                      </div>
                      <p>아래쪽 <b>요청 헤더</b>에는 이름 칸과 값 칸에 각각 이걸 넣어요.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <CopyRow label="① 이름 칸 (목록 검색칸에 붙여 넣으면 편해요)" value="authorization" />
                        <CopyRow label="② 값 칸 (Bearer + 한 칸 + 열쇠)" value={bearer} emptyHint={noKey} />
                      </div>
                      <Tip>열쇠만 넣으면 안 돼요. 앞에 <b>Bearer</b>와 띄어쓰기 한 칸이 꼭 있어야 해요. 저장하면 값을 다시 볼 수 없으니, 틀렸으면 헤더를 지우고 다시 넣으세요.</Tip>
                      <Shot src="/ai-connect/claude-3-auth-header.png" alt="인증 로그인 없음 선택과 요청 헤더 입력 칸" caption="🔍 눌러서 크게 보기 — 인증은 로그인 없음, 헤더 이름은 authorization을 고르고 값 칸에 Bearer 열쇠를 넣어요." width={460} />
                    </>
                  ),
                },
                {
                  short: '물어보기',
                  title: '저장하고, 새 대화에서 물어보세요',
                  body: (
                    <>
                      <p>아래 문장을 새 대화에 붙여 넣어 보세요. 도구 사용 허락 창이 뜨면 <b>허용</b>을 누르면 돼요.</p>
                      <CopyRow label="시험 문장" value="클래스로그에서 내 수업 자료 목록 보여줘" />
                    </>
                  ),
                },
              ]}
            />
          </div>
        )}

        {tab === 'code' && (
          <div className="space-y-4">
            <p className="text-xs text-on-surface-variant">컴퓨터에 클로드 코드가 설치되어 있는 분용이에요. <b>2단계</b>면 끝나요.</p>
            <Stepper
              key="code"
              steps={[
                {
                  short: '터미널에 붙여 넣기',
                  title: '평소 쓰는 터미널 창에 아래 한 줄을 붙여 넣고 엔터',
                  body: (
                    <>
                      <p>클로드 코드(<code>claude</code>)를 켜기 <b>전에</b>, 그냥 터미널 창에서 실행하세요.</p>
                      <CopyRow label="터미널에 붙여 넣기" value={cli('claude mcp add -t http -s user')} emptyHint={noKey} />
                      <Tip>맨 끝의 <code>-s user</code> 덕분에 어느 폴더에서 클로드 코드를 켜도 연결돼 있어요. (없으면 명령을 실행한 그 폴더에서만 보여요)</Tip>
                    </>
                  ),
                },
                {
                  short: '물어보기',
                  title: '클로드 코드를 켜고 물어보세요',
                  body: (
                    <>
                      <p><code>claude</code>로 클로드 코드를 켠 뒤 아래 문장을 물어보세요.</p>
                      <CopyRow label="시험 문장" value="클래스로그에서 내 수업 자료 목록 보여줘" />
                    </>
                  ),
                },
              ]}
            />
          </div>
        )}

        {tab === 'gemini' && (
          <>
            <p className="text-xs text-on-surface-variant">터미널에 설치해서 쓰는 <b>제미나이 CLI</b> 전용이에요. 제미나이 웹·앱(gemini.google.com)에는 아직 연결할 수 없어요.</p>
            <Tip>제미나이 앱의 "사용자 지정 앱" 기능은 미국 지역·영어 설정·개인 계정에서만 열리고, 열쇠 붙여넣기를 지원하는지도 공식 문서에 없어요. 그래서 안내하지 않아요. 제미나이 CLI도 화면과 안내가 영어예요.</Tip>
            <CopyRow label="터미널에 붙여 넣기 (제미나이 CLI를 켜기 전에)" value={cli('gemini mcp add --transport http')} emptyHint={noKey} />
            <Tip>열쇠가 설정 파일에 글자 그대로 저장돼요. 그 파일을 남에게 보내지 마세요.</Tip>
          </>
        )}

        {tab === 'chatgpt' && (
          <div className="space-y-2 text-sm leading-relaxed">
            <p className="font-bold">챗GPT는 아직 준비 중이에요.</p>
            <p className="text-on-surface-variant">챗GPT는 열쇠를 붙여 넣는 방식이 없고 "로그인 후 허용" 방식만 받아요. 안전하게 쓰려면 그 방식을 따로 만들어야 해서 준비하고 있어요. 그때까지는 클로드를 이용해 주세요.</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-on-surface-variant">안내 확인일: 2026-11-13 · 각 AI 앱의 화면은 바뀔 수 있어요.</p>
    </div>
  );
};

const AiConnectSection = () => {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_ai_connect_tokens');
    if (!error) setRows((data ?? []) as TokenRow[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = rows.filter(r => !r.revoked_at && new Date(r.expires_at) > new Date());
  const past = rows.filter(r => !active.includes(r));

  const create = async () => {
    if (!name.trim()) { appToast('어디에 쓸 열쇠인지 이름을 적어 주세요. (예: 클로드 코드)'); return; }
    setCreating(true);
    const { data, error } = await supabase.rpc('create_ai_connect_token', { p_name: name.trim(), p_days: 90 });
    setCreating(false);
    if (error) {
      appToast(error.message.includes('too_many_tokens') ? '열쇠는 동시에 5개까지 쓸 수 있어요. 안 쓰는 열쇠를 먼저 폐기해 주세요.' : '열쇠를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setNewKey(row?.token ?? null);
    setName('');
    load();
  };

  const revoke = async (r: TokenRow) => {
    if (!(await appConfirm(`"${r.name}" 열쇠를 폐기할까요? 이 열쇠를 쓰던 AI는 바로 연결이 끊기고, 되돌릴 수 없어요.`))) return;
    const { error } = await supabase.rpc('revoke_ai_connect_token', { p_id: r.id });
    if (error) appToast('폐기하지 못했어요. 다시 시도해 주세요.');
    else { appToast('열쇠를 폐기했어요.'); load(); }
  };

  return (
    <div className="surface-card shadow-ambient overflow-hidden">
      <div className="px-5 md:px-10 py-4 md:py-6 border-b border-surface-container bg-surface-container-low/30 flex items-center gap-3">
        <Plug size={22} className="text-primary shrink-0" />
        <div>
          <h3 className="text-lg font-bold">AI 연결 (베타)</h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            열쇠를 만들어 AI에게 주면, AI가 내 수업 자료·슬라이드·수업 계획서를 읽을 수 있어요 (읽기 전용 · 학생 정보는 제외)
          </p>
        </div>
      </div>

      <div className="px-5 md:px-10 py-6 space-y-6">
        {/* 새 열쇠 만들기 */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-on-surface-variant">새 열쇠 이름 (어디에 쓸지 적어 두세요)</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={40}
              placeholder="예: 클로드 코드, 챗GPT"
              className="flex-1 min-w-0 px-4 py-3 bg-surface-container rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30"
            />
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="shrink-0 flex items-center justify-center gap-1.5 px-5 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              열쇠 만들기
            </button>
          </div>
          <p className="text-[11px] text-on-surface-variant">열쇠는 90일 동안 쓸 수 있고, 동시에 5개까지 만들 수 있어요.</p>
        </div>

        {/* 방금 만든 열쇠: 한 번만 보임 */}
        {newKey && (
          <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold">열쇠가 만들어졌어요. 지금 복사해 두세요!</p>
              <button type="button" onClick={() => setNewKey(null)} aria-label="닫기" className="text-on-surface-variant hover:text-on-surface">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-error font-bold">이 창을 닫으면 열쇠를 다시 볼 수 없어요. 잃어버리면 폐기하고 새로 만들어야 해요. 남에게 보여 주지 마세요.</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 min-w-0 px-3 py-2.5 bg-surface-container rounded-xl text-xs font-mono break-all select-all">{newKey}</code>
              <CopyBtn text={newKey} label="열쇠 복사" />
            </div>
            <p className="text-xs text-on-surface-variant">👇 아래 "어디에 연결하나요?"에서 쓰는 AI를 골라 순서대로 따라 하세요.</p>
          </div>
        )}

        {/* 연결 안내 */}
        <ConnectGuide newKey={newKey} />

        {/* 열쇠 목록 */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-on-surface-variant">내 열쇠 {active.length}개 사용 중</p>
          {loading ? (
            <div className="py-4 flex justify-center"><Loader2 size={18} className="animate-spin text-on-surface-variant" /></div>
          ) : active.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-2">아직 만든 열쇠가 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {active.map(r => (
                <li key={r.id} className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{r.name} <span className="font-mono text-xs text-on-surface-variant font-normal">…{r.last4}</span></p>
                    <p className="text-[11px] text-on-surface-variant">
                      만료 {fmt(r.expires_at)} · 마지막 사용 {r.last_used_at ? fmt(r.last_used_at) : '아직 없음'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => revoke(r)}
                    className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-error text-xs font-bold hover:bg-error-container/30 active:scale-95 transition-all"
                  >
                    <Trash2 size={14} /> 폐기
                  </button>
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <p className="text-[11px] text-on-surface-variant">폐기·만료된 열쇠 {past.length}개는 더 이상 쓸 수 없어요.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiConnectSection;
