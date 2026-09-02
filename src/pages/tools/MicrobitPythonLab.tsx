import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Square, Download, Loader2, Cpu, RotateCcw } from 'lucide-react';

const SIMULATOR_URL = 'https://python-simulator.usermbit.org/v/0.1/simulator.html';
const FIRMWARE_V1_URL = '/microbit-firmware/microbit-micropython-v1.hex';
const FIRMWARE_V2_URL = '/microbit-firmware/microbit-micropython-v2.hex';

const STARTER_CODE = `from microbit import *

while True:
    display.show(Image.HEART)
    sleep(500)
    display.clear()
    sleep(500)
`;

let firmwareCache: { v1: string; v2: string } | null = null;

export default function MicrobitPythonLab() {
  const [code, setCode] = useState(STARTER_CODE);
  const [simReady, setSimReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [serialLog, setSerialLog] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sendToSimulator = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const flashCode = useCallback(() => {
    sendToSimulator({
      kind: 'flash',
      filesystem: { 'main.py': new TextEncoder().encode(code) },
    });
    setRunning(true);
    setSerialLog('');
  }, [code, sendToSimulator]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const { kind, data } = event.data as { kind?: string; data?: string };
      if (kind === 'ready') {
        setSimReady(true);
      } else if (kind === 'request_flash') {
        flashCode();
      } else if (kind === 'serial_output') {
        setSerialLog(prev => (prev + (data || '')).slice(-4000));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [flashCode]);

  const handleStop = () => {
    sendToSimulator({ kind: 'stop' });
    setRunning(false);
  };

  const handleReset = () => {
    sendToSimulator({ kind: 'reset' });
    setRunning(false);
    setSerialLog('');
  };

  const handleDownloadHex = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const [{ MicropythonFsHex, microbitBoardId }] = await Promise.all([
        import('@microbit/microbit-fs'),
      ]);

      if (!firmwareCache) {
        const [v1, v2] = await Promise.all([
          fetch(FIRMWARE_V1_URL).then(r => r.text()),
          fetch(FIRMWARE_V2_URL).then(r => r.text()),
        ]);
        firmwareCache = { v1, v2 };
      }

      const fs = new MicropythonFsHex([
        { hex: firmwareCache.v1, boardId: microbitBoardId.V1 },
        { hex: firmwareCache.v2, boardId: microbitBoardId.V2 },
      ]);
      fs.write('main.py', code);
      const universalHex = fs.getUniversalHex();

      const blob = new Blob([universalHex], { type: 'text/plain' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'microbit-program.hex';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      console.error('hex 생성 오류:', err);
      setDownloadError('hex 파일 생성에 실패했습니다. 코드를 확인 후 다시 시도해주세요.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-black text-on-surface flex items-center gap-2">
          <Cpu size={20} className="text-primary" />마이크로비트 파이썬 실습
        </h2>
        <p className="text-xs font-medium text-on-surface-variant mt-1">
          MicroPython 코드를 작성하고 화면에서 바로 시뮬레이션한 뒤, 실제 마이크로비트에 넣을 수 있는 .hex 파일로 다운로드할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-72 lg:h-96 p-4 rounded-2xl border border-neutral-200 bg-neutral-900 text-neutral-100 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={flashCode}
              disabled={!simReady}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-black hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {simReady ? <Play size={15} /> : <Loader2 size={15} className="animate-spin" />}
              {simReady ? '실행' : '시뮬레이터 로딩 중'}
            </button>
            <button
              onClick={handleStop}
              disabled={!running}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 text-on-surface text-sm font-black hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Square size={14} />정지
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 text-on-surface text-sm font-black hover:bg-neutral-200 transition-colors"
            >
              <RotateCcw size={14} />리셋
            </button>
            <button
              onClick={handleDownloadHex}
              disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-primary text-primary text-sm font-black hover:bg-primary/5 disabled:opacity-40 transition-colors ml-auto"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              .hex 다운로드
            </button>
          </div>
          {downloadError && (
            <p className="text-xs font-bold text-red-500">{downloadError}</p>
          )}
          <div className="bg-neutral-900 rounded-xl p-3 h-28 overflow-y-auto">
            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-wide mb-1">시리얼 출력</p>
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">{serialLog || '(출력 없음)'}</pre>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white" style={{ aspectRatio: '1 / 1' }}>
          <iframe
            ref={iframeRef}
            src={SIMULATOR_URL}
            title="마이크로비트 시뮬레이터"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
