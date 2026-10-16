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
