// Web Push aboneliği: izin iste, service worker üzerinden abone ol, sunucuya kaydet.
import { pushSubscribe, pushUnsubscribe } from './game'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(s)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** İzin + abonelik + sunucu kaydı. Reddedilirse 'DENIED', desteklenmiyorsa 'UNSUPPORTED' fırlatır. */
export async function enablePush(vapidPublic: string) {
  if (!pushSupported()) throw new Error('UNSUPPORTED')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('DENIED')
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    // Android Chrome'da FCM kaydı ara sıra geçici olarak düşer ("push service error"): 3 kez, artan beklemeyle dene.
    const key = b64ToBytes(vapidPublic) as BufferSource
    for (let i = 0; i < 3 && !sub; i++) {
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) }
      catch (e) {
        if (e instanceof DOMException && e.name === 'NotAllowedError') throw new Error('DENIED')
        if (i === 2) throw new Error('PUSH_SERVICE')
        await new Promise(r => setTimeout(r, 1500 * (i + 1)))
      }
    }
  }
  if (!sub) throw new Error('PUSH_SERVICE')
  const j = sub.toJSON()
  await pushSubscribe(sub.endpoint, j.keys?.p256dh ?? '', j.keys?.auth ?? '')
}

/** Abonelik düşünce nedenini ayırt etmek için kısa tanı: gerçek hata + rastgele anahtarla deneme. */
export async function pushDiag(vapidPublic: string): Promise<string> {
  const err = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  const ua = navigator.userAgent
  const browser = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /MiuiBrowser|XiaoMi/i.test(ua) ? 'Mi Browser' : /EdgA/.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox/.test(ua) ? 'Firefox' : /Chrome\/(\d+)/.test(ua) ? `Chrome ${ua.match(/Chrome\/(\d+)/)![1]}` : 'Diğer'
  const lines = [
    `Tarayıcı: ${browser}${matchMedia('(display-mode: standalone)').matches ? ' (uygulama)' : ''}`,
    `İnternet: ${navigator.onLine ? 'var' : 'yok'} · İzin: ${Notification.permission}`,
  ]
  try {
    const reg = await navigator.serviceWorker.ready
    try { const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublic) as BufferSource }); await s.unsubscribe(); lines.push('Kyron anahtarı: ÇALIŞTI') }
    catch (e) { lines.push(`Kyron anahtarı: ${err(e)}`) }
    try {
      const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw as BufferSource }); await s.unsubscribe()
      lines.push('Rastgele anahtar: ÇALIŞTI')
    } catch (e) { lines.push(`Rastgele anahtar: ${err(e)}`) }
  } catch (e) { lines.push(`Service worker: ${err(e)}`) }
  return lines.join('\n')
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (sub) { await pushUnsubscribe(sub.endpoint); await sub.unsubscribe() } else await pushUnsubscribe(null)
}
