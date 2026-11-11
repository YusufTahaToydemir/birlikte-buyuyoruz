// Kyron · service worker push ekleri (workbox'ın ürettiği sw.js bunu importScripts ile yükler)
self.addEventListener('push', (event) => {
  let data = { title: 'Kyron', body: 'Yeni bir şey oldu', tag: 'kyron' }
  try { data = { ...data, ...event.data.json() } } catch { /* metin ya da boş */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, renotify: true,
    icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    data: { url: self.registration.scope },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus() }
    return self.clients.openWindow(target)
  }))
})
