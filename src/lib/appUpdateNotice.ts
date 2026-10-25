// 앱 새 버전 적용 안내 (React와 무관하게 동작하도록 순수 DOM으로 구성)
// - 입력 중이면 새로고침하지 않고 작은 알림만 띄운다
// - 입력 중이 아니면 "업데이트 중" 화면을 잠깐 보여준 뒤 새로고침한다

const STYLE_ID = 'app-update-notice-style'
const PRIMARY = '#6366f1'

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes app-update-spin { to { transform: rotate(360deg); } }
    @keyframes app-update-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes app-update-rise { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
  `
  document.head.appendChild(style)
}

// 지금 글자를 입력하고 있는지 (입력칸에 커서가 있는지)
export function isUserTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['button', 'submit', 'checkbox', 'radio', 'range', 'file', 'color', 'reset', 'image'].includes(type)
  }
  return el.isContentEditable
}

// "앱을 업데이트하고 있어요" 화면을 보여준 뒤 새로고침
export function showUpdatingAndReload() {
  ensureStyle()
  document.getElementById('app-update-toast')?.remove()

  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'status')
  overlay.setAttribute('aria-live', 'polite')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
    'background:rgba(255,255,255,0.94);backdrop-filter:blur(4px);animation:app-update-fade .25s ease-out;font-family:inherit;'

  const spinner = document.createElement('div')
  spinner.style.cssText =
    `width:44px;height:44px;border-radius:50%;border:4px solid #e0e7ff;border-top-color:${PRIMARY};animation:app-update-spin .9s linear infinite;`

  const title = document.createElement('div')
  title.textContent = '앱을 새 버전으로 업데이트하고 있어요'
  title.style.cssText = 'font-size:18px;font-weight:700;color:#1e1b4b;text-align:center;padding:0 24px;'

  const sub = document.createElement('div')
  sub.textContent = '잠시만 기다려 주세요. 곧 자동으로 다시 열려요.'
  sub.style.cssText = 'font-size:15px;color:#6b7280;text-align:center;padding:0 24px;'

  overlay.append(spinner, title, sub)
  document.body.appendChild(overlay)

  setTimeout(() => window.location.reload(), 1500)
}

// 입력 중일 때: 새로고침 대신 작은 알림만 표시
export function showUpdateReadyToast() {
  if (document.getElementById('app-update-toast')) return
  ensureStyle()

  const toast = document.createElement('div')
  toast.id = 'app-update-toast'
  toast.setAttribute('role', 'status')
  toast.style.cssText =
    'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483646;display:flex;align-items:center;gap:12px;' +
    `max-width:calc(100vw - 32px);padding:12px 14px 12px 18px;border-radius:14px;background:#1e1b4b;color:#fff;font-size:15px;line-height:1.5;` +
    'box-shadow:0 8px 24px rgba(0,0,0,.25);animation:app-update-rise .3s ease-out;font-family:inherit;'

  const text = document.createElement('span')
  text.textContent = '새 버전이 준비됐어요. 입력을 마치고 눌러 주세요.'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = '지금 업데이트'
  btn.style.cssText =
    `flex-shrink:0;border:0;border-radius:10px;padding:8px 14px;background:${PRIMARY};color:#fff;font-size:15px;font-weight:700;cursor:pointer;`
  btn.addEventListener('click', showUpdatingAndReload)

  toast.append(text, btn)
  document.body.appendChild(toast)
}

// 서비스워커·캐시를 비우고 최신 화면을 새로 불러온다 (Ctrl+Shift+R 과 같은 효과)
async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // 지우기에 실패해도 새로고침은 진행
  }
  window.location.reload()
}

// 화면 가운데 "앱이 업데이트됐어요" 안내창 (자동 새로고침이 안 되는 기기용)
export function showUpdateModal() {
  if (document.getElementById('app-update-modal')) return
  ensureStyle()

  const overlay = document.createElement('div')
  overlay.id = 'app-update-modal'
  overlay.setAttribute('role', 'alertdialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'app-update-modal-title')
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;' +
    'background:rgba(30,27,75,0.45);backdrop-filter:blur(3px);animation:app-update-fade .25s ease-out;font-family:inherit;'

  const box = document.createElement('div')
  box.style.cssText =
    'width:100%;max-width:380px;background:#fff;border-radius:20px;padding:28px 24px 22px;text-align:center;' +
    'box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;align-items:center;gap:12px;'

  const icon = document.createElement('div')
  icon.textContent = '✨'
  icon.style.cssText = 'font-size:36px;line-height:1;'

  const title = document.createElement('div')
  title.id = 'app-update-modal-title'
  title.textContent = '앱이 새로워졌어요'
  title.style.cssText = 'font-size:20px;font-weight:700;color:#1e1b4b;'

  const sub = document.createElement('div')
  sub.textContent = '아래 버튼을 눌러야 새 기능과 수정된 화면이 보여요. 작성 중인 내용이 있다면 먼저 저장해 주세요.'
  sub.style.cssText = 'font-size:15px;line-height:1.6;color:#4b5563;'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = '지금 업데이트'
  btn.style.cssText =
    `margin-top:6px;width:100%;border:0;border-radius:12px;padding:14px;background:${PRIMARY};color:#fff;font-size:16px;font-weight:700;cursor:pointer;`
  btn.addEventListener('click', () => {
    btn.disabled = true
    btn.textContent = '업데이트 중...'
    void hardReload()
  })

  const later = document.createElement('button')
  later.type = 'button'
  later.textContent = '나중에'
  later.style.cssText = 'border:0;background:none;color:#6b7280;font-size:14px;padding:6px 12px;cursor:pointer;'
  later.addEventListener('click', () => overlay.remove())

  box.append(icon, title, sub, btn, later)
  overlay.append(box)
  document.body.appendChild(overlay)
  btn.focus()
}

// 새 버전이 배포됐는지 확인한다 (version.json 의 번호가 지금 화면의 번호와 다른지)
let lastPromptedId = ''
export async function checkForNewVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { id?: string }
    if (!data.id || data.id === __APP_BUILD_ID__ || data.id === lastPromptedId) return
    lastPromptedId = data.id
    document.getElementById('app-update-toast')?.remove()
    showUpdateModal()
  } catch {
    // 오프라인·일시 오류는 조용히 넘기고 다음 확인 때 다시 시도
  }
}

// 앱을 열 때 / 다른 화면에서 돌아왔을 때 / 켜 둔 채 5분마다 확인 (백그라운드 탭은 건너뜀)
export function startVersionWatch() {
  if (import.meta.env.DEV) return
  const check = () => {
    if (document.visibilityState === 'visible') void checkForNewVersion()
  }
  check()
  document.addEventListener('visibilitychange', check)
  setInterval(check, 5 * 60 * 1000)
}
