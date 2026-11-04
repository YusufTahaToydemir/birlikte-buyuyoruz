// Kyron · Web Push gönderici. pg_cron her 5 dakikada bir çağırır (x-kyron-secret başlığıyla).
// Kuyruğu bb_push_queue() üretir (olaylar + akşam hatırlatması); ölü abonelikler bb_push_result ile silinir.
// Gizli değerler (Edge Function secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET. SUPABASE_URL / SERVICE_ROLE otomatik gelir.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const SECRET = Deno.env.get('PUSH_SECRET') ?? ''
const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails('mailto:kyron@example.com', VAPID_PUBLIC, VAPID_PRIVATE)

type Sub = { endpoint: string; p256dh: string; auth: string }
type Item = { user: string; title: string; body: string; tag: string; subs: Sub[] | null }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })
  if (!SECRET || req.headers.get('x-kyron-secret') !== SECRET) return new Response('forbidden', { status: 403 })
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await db.rpc('bb_push_queue')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  const items = (data ?? []) as Item[]
  const dead: string[] = [], ok: string[] = []
  let sent = 0
  for (const it of items) {
    const payload = JSON.stringify({ title: it.title, body: it.body, tag: it.tag })
    for (const s of it.subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })
        ok.push(s.endpoint); sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.endpoint)
      }
    }
  }
  if (dead.length || ok.length) await db.rpc('bb_push_result', { p_dead: dead, p_ok: ok })
  return new Response(JSON.stringify({ items: items.length, sent, dead: dead.length }), { headers: { 'Content-Type': 'application/json' } })
})
