import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Download, Loader2, Cpu, RotateCcw, Move, Zap, Compass, Sun, Mic, Thermometer, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

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

type SensorId =
  | 'accelerometerX'
  | 'accelerometerY'
  | 'accelerometerZ'
  | 'compassX'
  | 'compassY'
  | 'compassZ'
  | 'compassHeading'
  | 'lightLevel'
  | 'soundLevel'
  | 'temperature';

const SENSOR_DEFAULTS: Record<SensorId, number> = {
  accelerometerX: 0,
  accelerometerY: 0,
  accelerometerZ: 0,
  compassX: 0,
  compassY: 0,
  compassZ: 0,
  compassHeading: 0,
  lightLevel: 127,
  soundLevel: 0,
  temperature: 21,
};

const SAMPLES: { id: string; label: string; code: string }[] = [
  { id: 'default', label: '기본 (하트 표시)', code: STARTER_CODE },
  {
    id: 'accelerometer',
    label: '가속도계 사용해보기',
    code: `from microbit import *

while True:
    x = accelerometer.get_x()
    y = accelerometer.get_y()
    z = accelerometer.get_z()
    print('x=', x, 'y=', y, 'z=', z)
    if z > -200:
        display.show(Image.ARROW_N)
    else:
        display.show(Image.YES)
    sleep(300)
`,
  },
  {
    id: 'gesture',
    label: '제스처 사용해보기',
    code: `from microbit import *

while True:
    if accelerometer.was_gesture('shake'):
        display.show(Image.SURPRISED)
        print('shake!')
    elif accelerometer.was_gesture('face down'):
        display.show(Image.ASLEEP)
        print('face down')
    sleep(100)
`,
  },
  {
    id: 'compass',
    label: '나침반 사용해보기',
    code: `from microbit import *

while True:
    heading = compass.heading()
    print('heading=', heading)
    if heading < 180:
        display.show(Image.ARROW_W)
    else:
        display.show(Image.ARROW_E)
    sleep(300)
`,
  },
  {
    id: 'light',
    label: '조도 센서 사용해보기',
    code: `from microbit import *

while True:
    level = display.read_light_level()
    print('light=', level)
    if level > 128:
        display.show(Image.HAPPY)
    else:
        display.show(Image.SAD)
    sleep(300)
`,
  },
  {
    id: 'sound',
    label: '소리 센서 사용해보기',
    code: `from microbit import *

while True:
    level = microphone.sound_level()
    print('sound=', level)
    if level > 128:
        display.show(Image.HAPPY)
    else:
        display.show(Image.SAD)
    sleep(300)
`,
  },
  {
    id: 'temperature',
    label: '온도 센서 사용해보기',
    code: `from microbit import *

while True:
    t = temperature()
    print('temperature=', t)
    if t > 25:
        display.show(Image.HAPPY)
    else:
        display.show(Image.SAD)
    sleep(300)
`,
  },
];

const GESTURES: { value: string; label: string }[] = [
  { value: 'shake', label: '흔들기' },
  { value: 'up', label: '위로 기울임' },
  { value: 'down', label: '아래로 기울임' },
  { value: 'left', label: '왼쪽으로 기울임' },
  { value: 'right', label: '오른쪽으로 기울임' },
  { value: 'face up', label: '화면 위로' },
  { value: 'face down', label: '화면 아래로' },
  { value: 'freefall', label: '자유낙하' },
  { value: '3g', label: '3g' },
  { value: '6g', label: '6g' },
  { value: '8g', label: '8g' },
  { value: 'none', label: '초기화' },
];

export default function MicrobitPythonLab() {
  const [code, setCode] = useState(STARTER_CODE);
  const [pendingSampleId, setPendingSampleId] = useState<string | null>(null);
  const [simReady, setSimReady] = useState(false);
  // 시뮬레이터는 iframe 내부의 재생 버튼을 실제로 클릭해야만 오디오 컨텍스트를
  // 생성한다(브라우저 자동재생 정책). 이 클릭이 한 번도 없으면 postMessage로
  // flash를 보내도 시뮬레이터 내부에서 오디오 초기화 오류가 나므로, 그 전까지는
  // 우리 쪽 실행 버튼에서 직접 flash를 보내지 않는다.
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [running, setRunning] = useState(false);
  const [serialLog, setSerialLog] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [sensors, setSensors] = useState<Record<SensorId, number>>(SENSOR_DEFAULTS);
  const [selectedGesture, setSelectedGesture] = useState('shake');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tiltPadRef = useRef<HTMLDivElement>(null);

  const toggleRow = useCallback((key: string) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // 코드에 실제로 쓰인 센서 관련 명령어가 있을 때만 해당 조작 UI를 보여준다.
  const usedSensors = useMemo(() => ({
    accelerometer: /accelerometer/.test(code),
    gesture: /gesture/.test(code),
    compass: /compass/.test(code),
    light: /light_level/.test(code),
    sound: /microphone|sound_level/.test(code),
    temperature: /temperature/.test(code),
  }), [code]);
  const anySensorUsed = Object.values(usedSensors).some(Boolean);

  const sendToSimulator = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const updateSensor = useCallback((id: SensorId, value: number) => {
    setSensors(prev => ({ ...prev, [id]: value }));
    sendToSimulator({ kind: 'set_value', id, value });
  }, [sendToSimulator]);

  const triggerGesture = useCallback((gesture: string) => {
    sendToSimulator({ kind: 'set_value', id: 'gesture', value: gesture });
  }, [sendToSimulator]);

  // 패드 중심에서 벗어난 정도(nx, ny, -1~1)를 실제 중력 벡터처럼 X/Y/Z에 분배한다.
  // 중앙(0,0)일 때 평평하게 눕혀둔 상태(Z=-1000mg), 끝까지 기울이면 Z=0이 되도록 계산.
  const updateAccelFromTilt = useCallback((nx: number, ny: number) => {
    const mag = Math.hypot(nx, ny);
    const scale = mag > 1 ? 1 / mag : 1;
    const cx = nx * scale;
    const cy = ny * scale;
    const x = Math.round(cx * 1000);
    const y = Math.round(cy * 1000);
    const z = Math.round(-1000 * Math.sqrt(Math.max(0, 1 - cx * cx - cy * cy)));
    setSensors(prev => ({ ...prev, accelerometerX: x, accelerometerY: y, accelerometerZ: z }));
    sendToSimulator({ kind: 'set_value', id: 'accelerometerX', value: x });
    sendToSimulator({ kind: 'set_value', id: 'accelerometerY', value: y });
    sendToSimulator({ kind: 'set_value', id: 'accelerometerZ', value: z });
  }, [sendToSimulator]);

  const handleTiltPointer = useCallback((clientX: number, clientY: number) => {
    const pad = tiltPadRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const nx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ny = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    updateAccelFromTilt(nx, ny);
  }, [updateAccelFromTilt]);

  const handleTiltPadDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleTiltPointer(e.clientX, e.clientY);
  };
  const handleTiltPadMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    handleTiltPointer(e.clientX, e.clientY);
  };
  const handleTiltPadUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleSensorReset = useCallback(() => {
    setSensors(SENSOR_DEFAULTS);
    (Object.keys(SENSOR_DEFAULTS) as SensorId[]).forEach(id => {
      sendToSimulator({ kind: 'set_value', id, value: SENSOR_DEFAULTS[id] });
    });
  }, [sendToSimulator]);

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
        setAudioUnlocked(true);
        flashCode();
      } else if (kind === 'serial_output') {
        setSerialLog(prev => (prev + (data || '')).slice(-4000));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [flashCode]);

  // 최신 줄이 위로 오도록 뒤집어서 보여준다(줄바꿈 기준). 스크롤 없이 최신값을 바로 볼 수 있게 하기 위함.
  const serialLogDisplay = useMemo(() => {
    const lines = serialLog.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.reverse().join('\n');
  }, [serialLog]);

  const handleRunClick = () => {
    if (!audioUnlocked) return;
    flashCode();
  };

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
          <div className="flex items-center gap-2">
            <label className="text-xs font-black text-on-surface-variant shrink-0">예제 불러오기</label>
            <select
              value=""
              onChange={e => {
                const sample = SAMPLES.find(s => s.id === e.target.value);
                if (!sample) return;
                if (code.trim() !== '' && code !== sample.code) {
                  setPendingSampleId(sample.id);
                  return;
                }
                setCode(sample.code);
              }}
              className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-bold text-on-surface bg-white focus:outline-none focus:border-primary"
            >
              <option value="" disabled>예제를 선택하세요</option>
              {SAMPLES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            className="w-full h-72 lg:h-96 p-4 rounded-2xl border border-neutral-200 bg-neutral-900 text-neutral-100 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRunClick}
              disabled={!simReady || !audioUnlocked}
              title={simReady && !audioUnlocked ? '오른쪽 시뮬레이터 화면의 ▶ 버튼을 먼저 한 번 눌러주세요' : undefined}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-black hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {!simReady ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {!simReady ? '시뮬레이터 로딩 중' : audioUnlocked ? '실행' : '실행 (▶ 먼저 눌러주세요)'}
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
          {simReady && !audioUnlocked && (
            <p className="text-xs font-bold text-amber-600">
              브라우저 오디오 정책 때문에 처음 한 번은 오른쪽 시뮬레이터 화면의 ▶ 버튼을 직접 눌러 시작해주세요. 이후에는 "실행" 버튼으로 바로 재실행할 수 있어요.
            </p>
          )}
          <div className="bg-neutral-900 rounded-xl p-3 h-64 overflow-y-auto">
            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-wide mb-1">시리얼 출력 (최신 값이 위에 표시돼요)</p>
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">{serialLogDisplay || '(출력 없음)'}</pre>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-white" style={{ aspectRatio: '1 / 1' }}>
            <iframe
              ref={iframeRef}
              src={SIMULATOR_URL}
              title="마이크로비트 시뮬레이터"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>

          <div className={`rounded-2xl border border-neutral-200 bg-white p-4 transition-opacity ${!simReady ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-wide">센서 조작 (코드에서 쓴 센서만 여기 나타나요)</p>
              {anySensorUsed && (
                <button
                  onClick={handleSensorReset}
                  className="text-[11px] font-bold text-primary hover:underline shrink-0"
                >
                  기본값으로
                </button>
              )}
            </div>

            {!anySensorUsed && (
              <p className="text-[11px] font-medium text-on-surface-variant py-2">
                코드에서 accelerometer, compass, microphone, temperature, display.read_light_level() 같은 센서 명령어를 사용하면 여기에 조작할 수 있는 UI가 나타나요.
              </p>
            )}

            <div className="divide-y divide-neutral-100">
              {usedSensors.accelerometer && (
                <div className="py-2.5 first:pt-0">
                  <div className="flex items-center gap-3">
                    <Move size={16} className="text-primary shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-3 text-[11px] font-mono text-on-surface-variant">
                      <span>X {sensors.accelerometerX}</span>
                      <span>Y {sensors.accelerometerY}</span>
                      <span>Z {sensors.accelerometerZ}</span>
                      <span className="text-neutral-400">mg</span>
                    </div>
                    <button
                      onClick={() => toggleRow('accel')}
                      className="shrink-0 p-1 text-neutral-400 hover:text-on-surface transition-colors"
                    >
                      {expandedRows.accel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {expandedRows.accel && (
                    <div className="mt-3 pl-7 flex items-center gap-4">
                      <div
                        ref={tiltPadRef}
                        onPointerDown={handleTiltPadDown}
                        onPointerMove={handleTiltPadMove}
                        onPointerUp={handleTiltPadUp}
                        className="relative w-24 h-24 rounded-full bg-neutral-100 border-2 border-neutral-200 shrink-0 touch-none cursor-grab active:cursor-grabbing"
                      >
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-200 -translate-x-1/2" />
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-neutral-200 -translate-y-1/2" />
                        <div
                          className="absolute w-5 h-5 rounded-full bg-primary shadow-md"
                          style={{
                            left: `calc(50% + ${Math.max(-1, Math.min(1, sensors.accelerometerX / 1000)) * 50}%)`,
                            top: `calc(50% + ${Math.max(-1, Math.min(1, sensors.accelerometerY / 1000)) * 50}%)`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      </div>
                      <p className="text-[11px] font-medium text-on-surface-variant">드래그해서 기울여보세요</p>
                    </div>
                  )}
                </div>
              )}

              {usedSensors.gesture && (
                <div className="py-2.5">
                  <div className="flex items-center gap-3">
                    <Zap size={16} className="text-primary shrink-0" />
                    <select
                      value={selectedGesture}
                      onChange={e => setSelectedGesture(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-neutral-200 text-[11px] font-bold text-on-surface bg-white focus:outline-none focus:border-primary"
                    >
                      {GESTURES.map(g => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => triggerGesture(selectedGesture)}
                      title="실행"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 transition-colors"
                    >
                      <Play size={11} fill="currentColor" />
                    </button>
                    <button
                      onClick={() => toggleRow('gesture')}
                      className="shrink-0 p-1 text-neutral-400 hover:text-on-surface transition-colors"
                    >
                      {expandedRows.gesture ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {expandedRows.gesture && (
                    <div className="mt-3 pl-7 flex flex-wrap gap-1.5">
                      {GESTURES.map(g => (
                        <button
                          key={g.value}
                          onClick={() => { setSelectedGesture(g.value); triggerGesture(g.value); }}
                          className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-primary/10 hover:text-primary text-[11px] font-bold text-on-surface-variant transition-colors"
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {usedSensors.compass && (
                <div className="py-2.5">
                  <div className="flex items-center gap-3">
                    <Compass size={16} className="text-primary shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={sensors.compassHeading}
                      onChange={e => updateSensor('compassHeading', Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="w-10 text-right text-[11px] font-mono text-on-surface-variant shrink-0">{sensors.compassHeading}°</span>
                    <button
                      onClick={() => toggleRow('compass')}
                      className="shrink-0 p-1 text-neutral-400 hover:text-on-surface transition-colors"
                    >
                      {expandedRows.compass ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {expandedRows.compass && (
                    <div className="mt-3 pl-7 flex items-center gap-3">
                      {(['compassX', 'compassY', 'compassZ'] as const).map((id, i) => (
                        <label key={id} className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant">
                          {['X', 'Y', 'Z'][i]}
                          <input
                            type="number"
                            value={sensors[id]}
                            onChange={e => updateSensor(id, Number(e.target.value) || 0)}
                            className="w-16 px-1.5 py-0.5 rounded-md border border-neutral-200 font-mono text-[11px] focus:outline-none focus:border-primary"
                          />
                        </label>
                      ))}
                      <span className="text-[10px] text-on-surface-variant">nT (고급)</span>
                    </div>
                  )}
                </div>
              )}

              {usedSensors.light && (
                <div className="py-2.5 flex items-center gap-3">
                  <Sun size={16} className="text-primary shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={sensors.lightLevel}
                    onChange={e => updateSensor('lightLevel', Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-8 text-right text-[11px] font-mono text-on-surface-variant shrink-0">{sensors.lightLevel}</span>
                </div>
              )}

              {usedSensors.sound && (
                <div className="py-2.5 flex items-center gap-3">
                  <Mic size={16} className="text-primary shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={sensors.soundLevel}
                    onChange={e => updateSensor('soundLevel', Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-8 text-right text-[11px] font-mono text-on-surface-variant shrink-0">{sensors.soundLevel}</span>
                </div>
              )}

              {usedSensors.temperature && (
                <div className="py-2.5 flex items-center gap-3">
                  <Thermometer size={16} className="text-primary shrink-0" />
                  <input
                    type="range"
                    min={-5}
                    max={50}
                    value={sensors.temperature}
                    onChange={e => updateSensor('temperature', Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-12 text-right text-[11px] font-mono text-on-surface-variant shrink-0">{sensors.temperature}°C</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingSampleId && createPortal(
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setPendingSampleId(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle size={17} className="text-amber-600" />
              </div>
              <p className="font-black text-sm text-on-surface">예제 코드 불러오기</p>
            </div>
            <p className="text-xs font-medium text-on-surface-variant leading-relaxed mb-5">
              현재 작성한 코드가 예제 코드로 덮어씌워집니다.<br />계속할까요?
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setPendingSampleId(null)}
                className="px-4 py-2 rounded-xl bg-neutral-100 text-on-surface text-sm font-black hover:bg-neutral-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const sample = SAMPLES.find(s => s.id === pendingSampleId);
                  if (sample) setCode(sample.code);
                  setPendingSampleId(null);
                }}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-black hover:bg-primary/90 transition-colors"
              >
                덮어쓰기
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
