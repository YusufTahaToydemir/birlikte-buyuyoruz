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
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublic) as BufferSource })
  const j = sub.toJSON()
  await pushSubscribe(sub.endpoint, j.keys?.p256dh ?? '', j.keys?.auth ?? '')
}

export async function disablePush() {
  const sub = await currentSubscription()
  if (sub) { await pushUnsubscribe(sub.endpoint); await sub.unsubscribe() } else await pushUnsubscribe(null)
}
