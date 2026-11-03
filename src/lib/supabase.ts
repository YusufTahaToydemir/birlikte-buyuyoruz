import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_KEY as string
if (!url || !key) throw new Error('VITE_SUPABASE_URL ve VITE_SUPABASE_KEY tanımlı olmalı.')

// Not: Statik PWA'da HttpOnly cookie mümkün değildir; Supabase oturumu tarayıcı deposunda tutulur.
// Çıkışta tüm yerel veri temizlenir (bkz. api.signOut).
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Kullanıcı adı -> Supabase Auth'un beklediği sentetik e-posta. Gerçek e-posta toplanmaz. */
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@birlikte.local`
