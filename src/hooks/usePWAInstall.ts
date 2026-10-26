import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'idle' | 'available' | 'ios' | 'installed' | 'dismissed';

// 설치 허용 신호는 앱이 열리자마자 한 번만 오므로, 화면이 뜨기 전에 모듈 단계에서 붙잡아 둔다
let storedPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    storedPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    storedPrompt = null;
    promptListeners.forEach((fn) => fn());
  });
}

const DISMISS_KEY = 'pwa-install-hide-until';

function isBannerHidden() {
  const until = localStorage.getItem(DISMISS_KEY);
  return until !== null && Date.now() < parseInt(until, 10);
}

export function usePWAInstall() {
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(storedPrompt);

  // 배너 숨김(하루 미루기)과 무관하게, 한 번에 설치 가능한 상태인지 (설정 화면용)
  useEffect(() => {
    const sync = () => setDeferredPrompt(storedPrompt);
    promptListeners.add(sync);
    sync();
    return () => { promptListeners.delete(sync); };
  }, []);

  useEffect(() => {
    if (isBannerHidden()) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as any).standalone === true) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      setInstallState('ios');
      return;
    }

    if (storedPrompt) setInstallState('available');
    const handler = () => { if (storedPrompt) setInstallState('available'); };
    promptListeners.add(handler);

    const installedHandler = () => setInstallState('installed');
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      promptListeners.delete(handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    storedPrompt = null;
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallState('installed');
    }
    setDeferredPrompt(null);
  };

  const dismiss = (forDay = true) => {
    if (forDay) {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    }
    setInstallState('dismissed');
  };

  return { installState, triggerInstall, dismiss, canInstallNow: !!deferredPrompt };
}
