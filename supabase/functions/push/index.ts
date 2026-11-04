// Kyron · Web Push gönderici. pg_cron her 5 dakikada bir çağırır (x-kyron-secret başlığıyla).
// Kuyruğu bb_push_queue() üretir (olaylar + akşam hatırlatması); ölü abonelikler bb_push_result ile silinir.
// VAPID anahtarları ve paylaşılan sır veritabanındaki app_secrets tablosundan (bb_push_secrets, yalnızca service_role) okunur.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY Edge Function ortamına otomatik gelir.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type Sub = { endpoint: string; p256dh: string; auth: string }
type Item = { user: string; title: string; body: string; tag: string; subs: Sub[] | null }
type Secrets = { vapidPublic: string | null; vapidPrivate: string | null; pushSecret: string | null }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: sec, error: secErr } = await db.rpc('bb_push_secrets')
  const s = (sec ?? {}) as Secrets
  if (secErr || !s.pushSecret || !s.vapidPublic || !s.vapidPrivate) return new Response(JSON.stringify({ error: 'secrets missing' }), { status: 500 })
  if (req.headers.get('x-kyron-secret') !== s.pushSecret) return new Response('forbidden', { status: 403 })
  webpush.setVapidDetails('mailto:kyron@example.com', s.vapidPublic, s.vapidPrivate)

  const { data, error } = await db.rpc('bb_push_queue')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  const items = (data ?? []) as Item[]
  const dead: string[] = [], ok: string[] = []
  let sent = 0
  for (const it of items) {
    const payload = JSON.stringify({ title: it.title, body: it.body, tag: it.tag })
    for (const sub of it.subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 })
        ok.push(sub.endpoint); sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(sub.endpoint)
      }
    }
  }
  if (dead.length || ok.length) await db.rpc('bb_push_result', { p_dead: dead, p_ok: ok })
  return new Response(JSON.stringify({ items: items.length, sent, dead: dead.length }), { headers: { 'Content-Type': 'application/json' } })
})
