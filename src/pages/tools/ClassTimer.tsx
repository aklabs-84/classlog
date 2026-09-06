import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, RotateCcw, Maximize2, Minimize2, Volume2, VolumeX, Plus, Minus, BellOff, X
} from 'lucide-react';
import { useTimer } from '../../lib/timerContext';
import { useScrollLock } from '../../hooks/useScrollLock';

const PRESETS = [
  { label: '준비', minutes: 1, seconds: 0, emoji: '✋' },
  { label: '발표', minutes: 3, seconds: 0, emoji: '🎤' },
  { label: '쉬는 시간', minutes: 5, seconds: 0, emoji: '☕' },
  { label: '모둠 활동', minutes: 10, seconds: 0, emoji: '👥' },
  { label: '수업', minutes: 45, seconds: 0, emoji: '📚' },
];

const CIRCLE_RADIUS = 120;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;


interface TimerDisplayProps {
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isFinished: boolean;
  isAlarming: boolean;
  soundEnabled: boolean;
  presentMode?: boolean;
  onToggle: () => void;
  onReset: () => void;
  onSoundToggle: () => void;
  onStopAlarm: () => void;
  onPresentMode?: () => void;
  onExitPresent?: () => void;
}

const TimerDisplay = ({
  totalSeconds, remainingSeconds, isRunning, isFinished, isAlarming, soundEnabled, presentMode,
  onToggle, onReset, onSoundToggle, onStopAlarm, onPresentMode, onExitPresent,
}: TimerDisplayProps) => {
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
  const dashOffset = CIRCLE_CIRCUMFERENCE * (1 - progress);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const color = isFinished
    ? '#ef4444'
    : progress > 0.5
    ? '#22c55e'
    : progress > 0.2
    ? '#f59e0b'
    : '#ef4444';

  const scale = presentMode ? 1.6 : 1;

  return (
    <div className={`flex flex-col items-center gap-8 ${presentMode ? 'py-12' : ''}`}>
      {/* Circle */}
      <div className="relative" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
        <svg width="280" height="280" className="-rotate-90">
          <circle
            cx="140" cy="140" r={CIRCLE_RADIUS}
            fill="none"
            stroke={presentMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}
            strokeWidth="12"
          />
          <motion.circle
            cx="140" cy="140" r={CIRCLE_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRCLE_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {isFinished ? (
              <motion.div
                key="finished"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
                className="text-6xl font-black"
                style={{ color }}
              >
                종료!
              </motion.div>
            ) : (
              <motion.div
                key="time"
                className={`font-black tabular-nums ${presentMode ? 'text-5xl text-white' : 'text-5xl text-on-surface'}`}
              >
                {timeStr}
              </motion.div>
            )}
          </AnimatePresence>
          <p className={`text-xs font-bold mt-1 ${presentMode ? 'text-white/50' : 'text-on-surface-variant'}`}>
            {isRunning ? '진행 중' : isFinished ? '' : remainingSeconds === totalSeconds ? '준비' : '일시정지'}
          </p>
        </div>
      </div>

      {/* 알림 끄기 버튼 — 알람 울리는 중일 때만 표시 */}
      {isAlarming && (
        <motion.button
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 0.6 }}
          onClick={onStopAlarm}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg ${
            presentMode
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-red-500 text-white hover:bg-red-600 shadow-red-200'
          }`}
        >
          <BellOff size={18} />
          알림 끄기
        </motion.button>
      )}

      {/* Controls */}
      <div className={`flex items-center gap-4 ${presentMode ? 'mt-8' : ''}`}>
        <button
          onClick={onSoundToggle}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            presentMode
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary'
          }`}
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        <button
          onClick={onReset}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
            presentMode
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-error/10 hover:text-error'
          }`}
        >
          <RotateCcw size={18} />
        </button>

        <button
          onClick={onToggle}
          disabled={isFinished && remainingSeconds === 0}
          className={`w-20 h-20 rounded-2xl flex items-center justify-center text-white font-black text-xl transition-all active:scale-95 shadow-lg ${
            isRunning
              ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
              : isFinished
              ? 'bg-on-surface/20 cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 shadow-primary/30'
          }`}
        >
          {isRunning ? <Pause size={28} strokeWidth={3} /> : <Play size={28} strokeWidth={3} />}
        </button>

        <div className="w-11 h-11" />

        {presentMode ? (
          <button
            onClick={onExitPresent}
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <Minimize2 size={18} />
          </button>
        ) : (
          <button
            onClick={onPresentMode}
            className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-container-low text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-all"
          >
            <Maximize2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── 전체화면 타이머 ──────────────────────────────────────────────────────────

const FLOATING_ITEMS = ['⏰', '✨', '💫', '⭐', '🌟', '🎯', '💡', '🔔'];

interface FullscreenTimerProps {
  visible: boolean;
  totalSeconds: number;
  remainingSeconds: number;
  isRunning: boolean;
  isFinished: boolean;
  isAlarming: boolean;
  soundEnabled: boolean;
  onClose: () => void;
  onToggle: () => void;
  onReset: () => void;
  onStopAlarm: () => void;
  onSoundToggle: () => void;
}

const FullscreenTimer = ({
  visible, totalSeconds, remainingSeconds, isRunning, isFinished, isAlarming,
  soundEnabled, onClose, onToggle, onReset, onStopAlarm, onSoundToggle,
}: FullscreenTimerProps) => {
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = !isFinished && progress <= 0.2;
  const isMid = !isFinished && progress > 0.2 && progress <= 0.5;

  const bgClass = isFinished
    ? 'from-red-950 via-red-900 to-slate-900'
    : isUrgent
    ? 'from-slate-900 via-red-950 to-orange-950'
    : isMid
    ? 'from-slate-900 via-amber-950 to-slate-900'
    : 'from-slate-900 via-indigo-950 to-emerald-950';

  const accentColor = isFinished || isUrgent ? '#ef4444' : isMid ? '#f59e0b' : '#22c55e';

  const radius = 160;
  const circ = 2 * Math.PI * radius;
  const dashOffset = circ * (1 - progress);

  // body 잠금 + ESC
  useScrollLock(visible);
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
          className={`bg-gradient-to-br ${bgClass} flex flex-col items-center justify-center overflow-hidden`}
        >
          {/* 떠다니는 이모지 파티클 */}
          {FLOATING_ITEMS.map((emoji, i) => (
            <motion.div
              key={i}
              className="absolute text-2xl pointer-events-none select-none"
              style={{ left: `${10 + (i * 12) % 80}%`, top: `${5 + (i * 17) % 85}%` }}
              animate={{
                y: [0, -24, 0],
                x: [0, i % 2 === 0 ? 10 : -10, 0],
                opacity: [0.15, 0.35, 0.15],
                scale: [0.8, 1.1, 0.8],
              }}
              transition={{
                duration: 3 + i * 0.5,
                repeat: Infinity,
                delay: i * 0.4,
                ease: 'easeInOut',
              }}
            >
              {emoji}
            </motion.div>
          ))}

          {/* 닫기 버튼 */}
          <div className="absolute top-6 right-6 flex items-center gap-3">
            <button
              onClick={onSoundToggle}
              className="w-10 h-10 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all flex items-center justify-center"
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 text-white hover:bg-white/25 transition-all font-black text-sm border border-white/20"
            >
              <X size={16} />
              전체화면 종료 (ESC)
            </button>
          </div>

          {/* 라벨 */}
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-white/40 text-xs font-black uppercase tracking-[0.3em] mb-10"
          >
            수업 타이머
          </motion.p>

          {/* 원형 타이머 */}
          <motion.div
            className="relative"
            animate={isUrgent && isRunning ? { scale: [1, 1.015, 1] } : { scale: 1 }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <svg width="380" height="380" className="-rotate-90">
              <circle cx="190" cy="190" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
              <motion.circle
                cx="190" cy="190" r={radius}
                fill="none"
                stroke={accentColor}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={dashOffset}
                filter={`drop-shadow(0 0 12px ${accentColor}88)`}
                style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <AnimatePresence mode="wait">
                {isFinished ? (
                  <motion.div
                    key="done"
                    animate={{ scale: [1, 1.08, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 0.7, repeat: Infinity }}
                    className="text-7xl font-black text-red-400"
                  >
                    종료!
                  </motion.div>
                ) : (
                  <motion.div
                    key="time"
                    className="text-8xl font-black tabular-nums text-white"
                    style={{ textShadow: `0 0 40px ${accentColor}66` }}
                  >
                    {timeStr}
                  </motion.div>
                )}
              </AnimatePresence>
              <p className="text-white/40 text-sm font-bold tracking-widest">
                {isRunning ? '진행 중' : isFinished ? '' : remainingSeconds === totalSeconds ? '시작 전' : '일시정지'}
              </p>
            </div>
          </motion.div>

          {/* 알림 끄기 버튼 */}
          <AnimatePresence>
            {isAlarming && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, scale: [1, 1.04, 1] }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ scale: { repeat: Infinity, duration: 0.6 } }}
                onClick={onStopAlarm}
                className="mt-8 flex items-center gap-2 px-8 py-4 rounded-2xl bg-red-500 text-white font-black text-base shadow-lg shadow-red-500/40 hover:bg-red-400 transition-all active:scale-95"
              >
                <BellOff size={20} />
                알림 끄기
              </motion.button>
            )}
          </AnimatePresence>

          {/* 컨트롤 버튼 */}
          {!isAlarming && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-5 mt-10"
            >
              <button
                onClick={onReset}
                className="w-14 h-14 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center"
              >
                <RotateCcw size={22} />
              </button>

              <motion.button
                onClick={onToggle}
                disabled={isFinished}
                whileTap={{ scale: 0.93 }}
                className={`w-24 h-24 rounded-3xl flex items-center justify-center text-white transition-all shadow-2xl ${
                  isRunning
                    ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-500/40'
                    : isFinished
                    ? 'bg-white/10 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary/80 shadow-primary/40'
                }`}
              >
                {isRunning
                  ? <Pause size={36} strokeWidth={2.5} />
                  : <Play size={36} strokeWidth={2.5} />}
              </motion.button>

              <button
                onClick={onSoundToggle}
                className="w-14 h-14 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all flex items-center justify-center"
              >
                {soundEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── 메인 타이머 ─────────────────────────────────────────────────────────────

const ClassTimer = () => {
  const {
    totalSeconds, remainingSeconds, isRunning, isFinished, isAlarming, soundEnabled,
    setIsTimerPageVisible, toggle, reset, applyTime, stopAlarm, toggleSound,
  } = useTimer();

  const [presentMode, setPresentMode] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(3);
  const [customSeconds, setCustomSeconds] = useState(0);

  // 이 페이지가 마운트되어 있는 동안 플로팅 위젯 숨김
  useEffect(() => {
    setIsTimerPageVisible(true);
    return () => setIsTimerPageVisible(false);
  }, [setIsTimerPageVisible]);

  const handleApplyTime = (mins: number, secs: number) => {
    applyTime(mins, secs);
    setCustomMinutes(mins);
    setCustomSeconds(secs);
  };

  const adjustMinutes = (delta: number) => {
    const next = Math.max(0, Math.min(99, customMinutes + delta));
    setCustomMinutes(next);
    handleApplyTime(next, customSeconds);
  };

  const adjustSeconds = (delta: number) => {
    let s = customSeconds + delta;
    let m = customMinutes;
    if (s >= 60) { s -= 60; m = Math.min(99, m + 1); }
    if (s < 0)  { s += 60; m = Math.max(0, m - 1); }
    setCustomSeconds(s);
    setCustomMinutes(m);
    handleApplyTime(m, s);
  };

  const timerProps = {
    totalSeconds, remainingSeconds, isRunning, isFinished, isAlarming, soundEnabled,
    onToggle: toggle,
    onReset: reset,
    onStopAlarm: stopAlarm,
    onSoundToggle: toggleSound,
  };

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 프리셋 */}
        <div className="glass rounded-2xl p-5 border border-white/40">
          <p className="text-xs font-black text-on-surface-variant mb-3 uppercase tracking-widest">프리셋</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const total = p.minutes * 60 + p.seconds;
              const isActive = total === totalSeconds;
              return (
                <button
                  key={p.label}
                  onClick={() => handleApplyTime(p.minutes, p.seconds)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all border ${
                    isActive
                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                      : 'border-white/40 text-on-surface hover:border-primary/30 hover:bg-primary/5'
                  }`}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                  <span className={`text-xs ${isActive ? 'text-white/70' : 'text-on-surface-variant'}`}>
                    {p.minutes > 0 ? `${p.minutes}분` : ''}{p.seconds > 0 ? `${p.seconds}초` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 시간 직접 입력 + 타이머 표시 */}
        <div className="glass rounded-2xl p-6 border border-white/40 flex flex-col items-center gap-6">
          <div className="flex items-center gap-4">
            {/* 분 */}
            <div className="flex flex-col items-center gap-1">
              <button onClick={() => adjustMinutes(1)} className="w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center justify-center">
                <Plus size={14} strokeWidth={3} />
              </button>
              <input
                type="number" min={0} max={99} value={customMinutes}
                onChange={(e) => { const v = Math.max(0, Math.min(99, Number(e.target.value))); setCustomMinutes(v); handleApplyTime(v, customSeconds); }}
                className="w-16 text-center text-2xl font-black rounded-xl border border-white/40 bg-surface-container-low/50 py-2 focus:outline-none focus:border-primary/40"
              />
              <button onClick={() => adjustMinutes(-1)} className="w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center justify-center">
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">분</span>
            </div>

            <span className="text-3xl font-black text-on-surface-variant mt-1">:</span>

            {/* 초 */}
            <div className="flex flex-col items-center gap-1">
              <button onClick={() => adjustSeconds(10)} className="w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center justify-center">
                <Plus size={14} strokeWidth={3} />
              </button>
              <input
                type="number" min={0} max={59} value={customSeconds}
                onChange={(e) => { const v = Math.max(0, Math.min(59, Number(e.target.value))); setCustomSeconds(v); handleApplyTime(customMinutes, v); }}
                className="w-16 text-center text-2xl font-black rounded-xl border border-white/40 bg-surface-container-low/50 py-2 focus:outline-none focus:border-primary/40"
              />
              <button onClick={() => adjustSeconds(-10)} className="w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center justify-center">
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">초</span>
            </div>
          </div>

          <TimerDisplay {...timerProps} onPresentMode={() => setPresentMode(true)} />
        </div>
      </div>

      {/* 전체화면 — Portal */}
      {createPortal(
        <FullscreenTimer {...timerProps} visible={presentMode} onClose={() => setPresentMode(false)} />,
        document.body
      )}
    </>
  );
};

export default ClassTimer;
