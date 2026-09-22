import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

registerSW({
  onRegisteredSW(_swUrl, registration) {
    // 1시간마다 SW 업데이트 확인
    if (registration) {
      setInterval(() => registration.update(), 60 * 60 * 1000)
    }
  },
  onOfflineReady() {},
})

// 새 버전이 실제로 적용되는 순간, 열려있던 탭을 한 번 자동 새로고침
// (이걸 안 하면 예전부터 열려있던 탭은 새로 추가된 페이지/기능을 계속 못 보게 됨)
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
