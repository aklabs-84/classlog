import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './hooks/usePWAInstall'
import { registerSW } from 'virtual:pwa-register'
import { isUserTyping, showUpdateReadyToast, showUpdatingAndReload, startVersionWatch } from './lib/appUpdateNotice'

registerSW({
  onRegisteredSW(_swUrl, registration) {
    // 1시간마다 SW 업데이트 확인
    if (registration) {
      setInterval(() => registration.update(), 60 * 60 * 1000)
    }
  },
  onOfflineReady() {},
})

// 새 버전이 실제로 적용되는 순간, 열려있던 탭을 새로고침
// (이걸 안 하면 예전부터 열려있던 탭은 새로 추가된 페이지/기능을 계속 못 보게 됨)
// - 첫 방문(처음 SW가 설치되는 경우)은 이미 최신 화면이므로 새로고침하지 않음
// - 입력 중이면 새로고침 대신 "[지금 업데이트]" 알림만 띄움
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let handled = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || handled) return
    handled = true
    if (isUserTyping()) showUpdateReadyToast()
    else showUpdatingAndReload()
  })
}

startVersionWatch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
