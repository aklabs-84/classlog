// ClassLog AI — MCP 접수 창구 (1단계: 읽기 전용)
// ChatGPT/Claude 등 AI가 "AI 연결 키"로 선생님의 수업 자료·슬라이드·수업 계획서를 읽어 가는 입구.
// 흐름: Bearer 키 → sha256 지문 → mcp_auth(주인·속도 확인) → mcp_* 조회 기능 → mcp_log(기록)
// 배포: supabase functions deploy --no-verify-jwt mcp
// 외부 라이브러리 없이 MCP(Streamable HTTP)의 JSON-RPC를 직접 처리한다(상태 없음, POST만).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SERVER = { name: 'classlog-ai', version: '1.0.0' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};
const uuid = (v: unknown, required = false) => {
  if (v == null || v === '') {
    if (required) throw new Error('id가 필요합니다.');
    return null;
  }
  if (typeof v !== 'string' || !UUID.test(v)) throw new Error('id 형식이 올바르지 않습니다.');
  return v;
};

// 도구 정의: 설명(AI가 읽음) + 입력 + 실행할 DB 기능
type Tool = {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
  run: (hash: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args);

const TOOLS: Tool[] = [
  {
    name: 'list_classes',
    description: '선생님이 가르치는 반 목록을 보여 줍니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 50)' } },
    run: (h, a) => rpc('mcp_list_classes', { p_hash: h, p_limit: int(a.limit, 50, 1, 100) }),
  },
  {
    name: 'list_folders',
    description: '수업 자료 폴더 목록을 보여 줍니다.',
    properties: {},
    run: (h) => rpc('mcp_list_folders', { p_hash: h }),
  },
  {
    name: 'list_materials',
    description: '수업 자료 목록(제목·주차·글자 수)을 보여 줍니다. 본문은 get_material로 읽습니다.',
    properties: {
      folder_id: { type: 'string', description: '폴더 id (선택)' },
      class_id: { type: 'string', description: '반 id (선택)' },
      limit: { type: 'integer', description: '최대 개수 (기본 30, 최대 100)' },
      offset: { type: 'integer', description: '건너뛸 개수 (기본 0)' },
    },
    run: (h, a) => rpc('mcp_list_materials', {
      p_hash: h, p_folder: uuid(a.folder_id), p_class: uuid(a.class_id),
      p_limit: int(a.limit, 30, 1, 100), p_offset: int(a.offset, 0, 0, 100000),
    }),
  },
  {
    name: 'get_material',
    description: '수업 자료 한 건의 본문을 읽습니다. 길면 나눠서 줍니다(has_more가 true면 offset을 늘려 이어서 읽기).',
    properties: {
      id: { type: 'string', description: '자료 id' },
      offset: { type: 'integer', description: '읽기 시작 글자 위치 (기본 0)' },
      max_chars: { type: 'integer', description: '한 번에 읽을 글자 수 (기본 30000, 최대 60000)' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_material', {
      p_hash: h, p_id: uuid(a.id, true), p_offset: int(a.offset, 0, 0, 100000000), p_max: int(a.max_chars, 30000, 1000, 60000),
    }),
  },
  {
    name: 'list_slide_decks',
    description: '슬라이드 묶음 목록(제목·장 수)을 보여 줍니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 30)' } },
    run: (h, a) => rpc('mcp_list_slide_decks', { p_hash: h, p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'get_slide_deck',
    description: '슬라이드 묶음 내용을 읽습니다. 한 번에 최대 10장씩 주며, 큰 이미지는 "[이미지 생략]"으로 바뀝니다.',
    properties: {
      id: { type: 'string', description: '슬라이드 묶음 id' },
      from: { type: 'integer', description: '시작 장 번호 (0부터, 기본 0)' },
      count: { type: 'integer', description: '장 수 (기본 3, 최대 10)' },
    },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_slide_deck', {
      p_hash: h, p_id: uuid(a.id, true), p_from: int(a.from, 0, 0, 10000), p_count: int(a.count, 3, 1, 10),
    }),
  },
  {
    name: 'list_lesson_plans',
    description: '수업 계획서 목록을 보여 줍니다.',
    properties: { limit: { type: 'integer', description: '최대 개수 (기본 30)' } },
    run: (h, a) => rpc('mcp_list_lesson_plans', { p_hash: h, p_limit: int(a.limit, 30, 1, 100) }),
  },
  {
    name: 'get_lesson_plan',
    description: '수업 계획서 한 건의 전체 내용을 읽습니다.',
    properties: { id: { type: 'string', description: '수업 계획서 id' } },
    required: ['id'],
    run: (h, a) => rpc('mcp_get_lesson_plan', { p_hash: h, p_id: uuid(a.id, true) }),
  },
];

const rpcErr = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST만 지원합니다.' }, 405);

  // 1) 열쇠 확인
  const m = /^Bearer\s+(clk_[0-9a-f]{64})$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return json(rpcErr(null, -32001, 'AI 연결 키가 필요합니다. (Authorization: Bearer clk_...)'), 401);
  const hash = await sha256(m[1].toLowerCase());
  const auth = await supabase.rpc('mcp_auth', { p_hash: hash });
  if (auth.error) {
    const limited = auth.error.message.includes('rate_limited');
    return json(rpcErr(null, -32002, limited ? '요청이 너무 많습니다. 1분 뒤 다시 시도하세요.' : '인증 확인 중 오류가 났습니다.'), limited ? 429 : 500);
  }
  const row = Array.isArray(auth.data) ? auth.data[0] : auth.data;
  if (!row?.token_id) return json(rpcErr(null, -32001, '키가 올바르지 않거나 만료·폐기되었습니다.'), 401);

  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try { msg = await req.json(); } catch { return json(rpcErr(null, -32700, 'JSON을 읽을 수 없습니다.'), 400); }
  if (Array.isArray(msg)) return json(rpcErr(null, -32600, '배치 요청은 지원하지 않습니다.'), 400);
  const { id, method, params = {} } = msg;

  // 알림(응답 없음)
  if (method?.startsWith('notifications/')) return new Response(null, { status: 202, headers: cors });

  switch (method) {
    case 'initialize':
      return json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: SERVER,
          instructions: '선생님의 수업 자료·슬라이드·수업 계획서를 읽는 도구입니다. 목록(list_*)으로 id를 찾은 뒤 get_*으로 내용을 읽으세요. 학생 개인정보는 제공하지 않습니다.',
        },
      });
    case 'ping':
      return json({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return json({
        jsonrpc: '2.0', id,
        result: {
          tools: TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: { type: 'object', properties: t.properties, ...(t.required ? { required: t.required } : {}) },
            annotations: { readOnlyHint: true },
          })),
        },
      });
    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === params.name);
      if (!tool) return json(rpcErr(id, -32602, '없는 도구입니다.'));
      let ok = false;
      let text: string;
      try {
        const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<string, unknown>;
        const { data, error } = await tool.run(hash, args);
        if (error) throw new Error(error.message.includes('rate_limited') ? '요청이 너무 많습니다.' : '조회 중 오류가 났습니다.');
        text = JSON.stringify(data ?? []);
        ok = true;
      } catch (e) {
        text = (e as Error).message;
      }
      // 기록은 응답을 막지 않게 기다리지 않는다(실패해도 무시)
      supabase.rpc('mcp_log', { p_token_id: row.token_id, p_tool: tool.name, p_ok: ok }).then(() => {}, () => {});
      return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], ...(ok ? {} : { isError: true }) } });
    }
    default:
      return json(rpcErr(id, -32601, '지원하지 않는 방법입니다.'));
  }
});
