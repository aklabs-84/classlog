import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

// 브라우저 기본 confirm()/alert() 대신 쓰는 앱 공용 확인 팝업·토스트.
//   if (!(await appConfirm('이 자료를 삭제할까요?'))) return;   ← confirm 대체 (호출하는 함수는 async)
//   appToast('저장했어요.');                                     ← alert 대체 (종류는 문구로 자동 판단, 직접 지정도 가능)
// <AppDialogHost />를 앱 최상단에 한 번만 두면 어디서든 호출할 수 있다.

export type ToastKind = 'success' | 'error' | 'info';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 지정하지 않으면 문구에 삭제·지우기·해제가 있을 때 자동으로 빨간 강조 */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  message: string;
  resolve: (ok: boolean) => void;
}

interface ToastItem { id: number; message: string; kind: ToastKind }

let confirmSetter: ((s: ConfirmState | null) => void) | null = null;
let toastSetter: ((fn: (prev: ToastItem[]) => ToastItem[]) => void) | null = null;
let toastSeq = 0;

const isDanger = (m: string) => /삭제|지우|해제|버리|되돌릴 수 없|사라/.test(m);

export function appConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise(resolve => {
    // 팝업 자리가 아직 없으면(드문 경우) 기본 창으로 안전하게 대신 묻는다
    if (!confirmSetter) { resolve(window.confirm(message)); return; }
    confirmSetter({ message, ...options, resolve });
  });
}

const guessKind = (m: string): ToastKind => {
  if (/오류|실패|못했|못합|못하|없습니다|없어요|초과|올바르|잘못|이미 |불가|해 주세요|해주세요|골라 주세요|늦어야|입력/.test(m)) return 'error';
  if (/되었|됐|했습니다|했어요|완료|저장|등록|삭제|복사|성공/.test(m)) return 'success';
  return 'info';
};

export function appToast(message: string, kind?: ToastKind) {
  if (!toastSetter) { window.alert(message); return; }
  const id = ++toastSeq;
  const k = kind ?? guessKind(message);
  toastSetter(prev => [...prev.slice(-2), { id, message, kind: k }]);
  const ms = Math.min(9000, 3500 + message.length * 60);
  setTimeout(() => toastSetter?.(prev => prev.filter(t => t.id !== id)), ms);
}

const KIND_STYLE: Record<ToastKind, { bg: string; icon: ReactElement }> = {
  success: { bg: 'bg-emerald-600', icon: <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> },
  error: { bg: 'bg-red-600', icon: <XCircle size={18} className="shrink-0 mt-0.5" /> },
  info: { bg: 'bg-blue-600', icon: <Info size={18} className="shrink-0 mt-0.5" /> },
};

export const AppDialogHost = () => {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    confirmSetter = setConfirmState;
    toastSetter = setToasts;
    return () => { confirmSetter = null; toastSetter = null; };
  }, []);

  const close = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  const danger = confirmState ? (confirmState.danger ?? isDanger(confirmState.message)) : false;

  return createPortal(
    <>
      {confirmState && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 px-4"
          onClick={() => close(false)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {danger ? <AlertTriangle size={18} /> : <Info size={18} />}
              </span>
              <h2 className="text-base font-black text-on-surface">{confirmState.title ?? (danger ? '정말 진행할까요?' : '확인해 주세요')}</h2>
            </div>
            <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{confirmState.message}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="flex-1 rounded-2xl border border-on-surface/15 bg-white py-3 text-sm font-black text-on-surface hover:bg-surface-container/60 active:scale-95 transition-all"
              >
                {confirmState.cancelLabel ?? '취소'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => close(true)}
                className={`flex-1 rounded-2xl py-3 text-sm font-black text-white active:scale-95 transition-all ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {confirmState.confirmLabel ?? (/삭제|지우/.test(confirmState.message) ? '삭제하기' : /해제/.test(confirmState.message) ? '해제하기' : /버리/.test(confirmState.message) ? '버리고 이동' : '확인')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 top-4 z-[500] flex flex-col items-center gap-2 px-4">
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-bold leading-relaxed text-white shadow-xl ${KIND_STYLE[t.kind].bg}`}
          >
            {KIND_STYLE[t.kind].icon}
            <span className="flex-1 whitespace-pre-line">{t.message}</span>
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="shrink-0 rounded-full p-0.5 hover:bg-white/20"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
};
