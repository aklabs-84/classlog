/// <reference lib="webworker" />

declare function importScripts(...urls: string[]): void;

const PYODIDE_VERSION = 'v0.26.2';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const MAX_MISSING_MODULE_RETRIES = 5;

// Pyodide가 공식 배포하는 패키지 중 자주 쓰이는 것들 — micropip보다 loadPackage가 빠르고 안정적
const KNOWN_PYODIDE_PACKAGES = [
  'numpy', 'pandas', 'matplotlib', 'scipy', 'scikit-learn', 'sympy', 'regex',
  'requests', 'pillow', 'networkx', 'beautifulsoup4', 'pytz', 'micropip',
];

// 브라우저(Pyodide) 환경에서 원천적으로 실행할 수 없는 라이브러리
const UNSUPPORTED_MODULES: Record<string, string> = {
  cv2: 'OpenCV(cv2)',
  tensorflow: 'TensorFlow',
  torch: 'PyTorch',
  tkinter: 'Tkinter(GUI)',
  turtle: 'turtle(GUI)',
  pygame: 'Pygame',
};

let pyodidePromise: Promise<any> | null = null;
let stdinQueue: string[] = [];
let stdinIndex = 0;

function extractImportedModules(code: string): string[] {
  const mods = new Set<string>();
  const importRe = /^[ \t]*import\s+([a-zA-Z0-9_., \t]+)/gm;
  const fromRe = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(code))) {
    m[1].split(',').forEach(part => {
      const name = part.trim().split(/\s+as\s+/)[0].split('.')[0];
      if (name) mods.add(name);
    });
  }
  while ((m = fromRe.exec(code))) {
    const name = m[1].split('.')[0];
    if (name) mods.add(name);
  }
  return Array.from(mods);
}

async function getPyodide() {
  if (!pyodidePromise) {
    importScripts(`${PYODIDE_CDN}pyodide.js`);
    pyodidePromise = (async () => {
      const pyodide = await (self as any).loadPyodide({ indexURL: PYODIDE_CDN });
      pyodide.setStdout({ batched: (s: string) => (self as any).postMessage({ type: 'stdout', text: s }) });
      pyodide.setStderr({ batched: (s: string) => (self as any).postMessage({ type: 'stdout', text: s }) });
      pyodide.setStdin({
        stdin: () => (stdinIndex < stdinQueue.length ? stdinQueue[stdinIndex++] : undefined),
      });
      await pyodide.runPythonAsync("import os\nos.environ['MPLBACKEND'] = 'Agg'");
      return pyodide;
    })();
  }
  return pyodidePromise;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, code, stdin } = e.data || {};
  if (type !== 'run') return;

  stdinQueue = Array.isArray(stdin) ? stdin : [];
  stdinIndex = 0;

  try {
    (self as any).postMessage({ type: 'status', text: '파이썬 실행 환경 준비 중...' });
    const pyodide = await getPyodide();

    const importedModules = extractImportedModules(code);
    const toPreload = importedModules.filter(m => KNOWN_PYODIDE_PACKAGES.includes(m));
    if (toPreload.length > 0) {
      (self as any).postMessage({ type: 'status', text: `[안내] ${toPreload.join(', ')} 불러오는 중...` });
      await pyodide.loadPackage(toPreload).catch(() => {});
    }

    let attempts = 0;
    while (true) {
      try {
        await pyodide.runPythonAsync(code);
        break;
      } catch (runErr: any) {
        const msg = runErr?.message || String(runErr);
        const missing = /ModuleNotFoundError: No module named '([^']+)'/.exec(msg);
        if (!missing || attempts >= MAX_MISSING_MODULE_RETRIES) throw runErr;
        attempts++;
        const moduleName = missing[1];
        const unsupportedLabel = UNSUPPORTED_MODULES[moduleName];
        if (unsupportedLabel) {
          throw new Error(`'${moduleName}'(${unsupportedLabel})은(는) 브라우저 실행 환경에서 지원되지 않는 라이브러리입니다.`);
        }
        (self as any).postMessage({ type: 'status', text: `[안내] '${moduleName}' 패키지를 추가로 설치하는 중...` });
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        try {
          await micropip.install(moduleName);
        } catch {
          throw new Error(`'${moduleName}' 라이브러리는 설치할 수 없습니다. 브라우저 실행 환경(Pyodide)에서 지원되지 않는 패키지일 수 있습니다.`);
        }
      }
    }

    const imagesJson = await pyodide.runPythonAsync(`
import sys, json
if 'matplotlib.pyplot' in sys.modules:
    import io, base64
    _plt = sys.modules['matplotlib.pyplot']
    _imgs = []
    for _fignum in _plt.get_fignums():
        _fig = _plt.figure(_fignum)
        _buf = io.BytesIO()
        _fig.savefig(_buf, format='png', bbox_inches='tight')
        _buf.seek(0)
        _imgs.append(base64.b64encode(_buf.read()).decode('ascii'))
    _plt.close('all')
    _result = json.dumps(_imgs)
else:
    _result = json.dumps([])
_result
`);
    (self as any).postMessage({ type: 'done', images: JSON.parse(imagesJson) });
  } catch (err: any) {
    const msg = err?.message || String(err);
    let friendly = msg;
    if (/EOFError: EOF when reading a line/.test(msg)) {
      const failedAt = stdinIndex + 1;
      const providedLines = stdinQueue.length === 1 && stdinQueue[0] === '' ? 0 : stdinQueue.length;
      friendly = `입력값이 부족합니다. 이 코드는 input()을 ${failedAt}번째 호출할 때 필요한 값을 받지 못했습니다. (현재 입력값 상자에 ${providedLines}줄 입력됨)\n'입력값' 상자에 input() 호출 순서대로 한 줄에 하나씩 값을 입력한 뒤 다시 실행해주세요.`;
    }
    (self as any).postMessage({ type: 'error', text: friendly });
  }
};
