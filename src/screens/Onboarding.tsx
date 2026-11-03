import { useEffect, useState } from 'react'
import { errorText, finishOnboarding, getMyGoals, type AvatarConfig, type GoalRow, type Me } from '../lib/api'
import { Avatar, HAIR_COLORS, SKIN_TONES } from '../components/Avatar'
import { Button, Card, Field, Spinner, toast } from '../components/ui'

const DAY_XP_LIMIT = 200

export function Onboarding({ me, onDone }: { me: Me; onDone: () => Promise<void> | void }) {
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(me.displayName)
  const [avatar, setAvatar] = useState<AvatarConfig>({ type: 'lady', skin: 0, hair: 0, hairColor: 0, outfit: 'outfit_starter', ...me.profile.avatar })
  const [goals, setGoals] = useState<GoalRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { getMyGoals().then(setGoals).catch(e => setError(errorText(e))) }, [])

  const maxDay = goals ? Math.max(...[1, 2, 3, 4, 5, 6, 7].map(d => goals.filter(g => g.active && g.weekdays.includes(d) && !(g.input_type === 'CHECKLIST' && g.items.length === 0)).reduce((s, g) => s + g.max_xp, 0))) : 0
  const activeCount = goals?.filter(g => g.active).length ?? 0

  const finish = async () => {
    if (!goals) return
    setBusy(true); setError(null)
    try {
      await finishOnboarding(displayName.trim() || me.username, avatar, goals.map(g => ({ id: g.id, active: g.active, target: g.target, items: g.items, name: g.name })))
      toast('Hoş geldin. İlk haftanın planı şu andan itibaren yürürlükte.')
      await onDone()
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const updateGoal = (id: string, patch: Partial<GoalRow>) => setGoals(gs => gs ? gs.map(g => g.id === id ? { ...g, ...patch } : g) : gs)

  return (
    <div className="px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-10 space-y-4">
      <p className="text-[13px] text-ink-2">Kurulum · adım {step + 1} / 4</p>

      {step === 0 && (
        <Card className="space-y-4">
          <h1 className="text-xl font-bold">Karakterin</h1>
          <div className="flex justify-center"><Avatar config={avatar} size={150} /></div>
          <Field label="Görünen ad"><input className="input" maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} /></Field>
          <Choice label="Karakter" options={[{ v: 'lady', t: 'Hanımefendi' }, { v: 'gent', t: 'Beyefendi' }]} value={avatar.type ?? 'lady'} onChange={v => setAvatar(a => ({ ...a, type: v as 'lady' | 'gent', hair: 0 }))} />
          <Choice label="Ten tonu" options={SKIN_TONES.map((c, i) => ({ v: String(i), t: ['Açık', 'Orta', 'Koyu'][i], color: c }))} value={String(avatar.skin ?? 0)} onChange={v => setAvatar(a => ({ ...a, skin: Number(v) }))} />
          <Choice
            label={avatar.type === 'gent' ? 'Saç' : 'Saç veya başörtüsü'}
            options={avatar.type === 'gent' ? [{ v: '0', t: 'Kısa' }, { v: '1', t: 'Dalgalı' }, { v: '2', t: 'Sakallı' }] : [{ v: '0', t: 'Açık saç' }, { v: '1', t: 'Topuz' }, { v: '2', t: 'Başörtülü' }]}
            value={String(avatar.hair ?? 0)}
            onChange={v => setAvatar(a => ({ ...a, hair: Number(v) }))}
          />
          {!(avatar.type === 'lady' && avatar.hair === 2) && (
            <Choice label="Saç rengi" options={HAIR_COLORS.map((c, i) => ({ v: String(i), t: ['Koyu', 'Kestane', 'Açık'][i], color: c }))} value={String(avatar.hairColor ?? 0)} onChange={v => setAvatar(a => ({ ...a, hairColor: Number(v) }))} />
          )}
          <p className="text-[13px] text-ink-2">Bu seçimler tamamen kişiseldir ve sonradan ücretsiz değiştirilebilir. Görseller geçici yer tutuculardır.</p>
          <Button className="w-full" onClick={() => setStep(1)}>Devam</Button>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-3">
          <h1 className="text-xl font-bold">Başlangıç görevlerin</h1>
          <p className="text-ink-2 text-[15px]">İstemediğin görevi kapat, hedefleri kendine göre ayarla. Bu plan hemen başlar; sonraki değişiklikler gelecek Pazartesi yürürlüğe girer.</p>
          {!goals && !error && <Spinner />}
          {goals?.map(g => (
            <div key={g.id} className={`border border-line rounded-[14px] p-3 ${g.active ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 font-semibold flex-1">
                  <input type="checkbox" className="w-5 h-5" checked={g.active} disabled={g.input_type === 'CHECKLIST' && g.items.length === 0} onChange={e => updateGoal(g.id, { active: e.target.checked })} />
                  <span aria-hidden="true">{g.icon}</span> {g.name}
                </label>
                <span className="text-[13px] text-ink-2 whitespace-nowrap">{g.max_xp} XP</span>
              </div>
              <p className="text-[13px] text-ink-2 mt-1">{g.description}</p>
              {(g.input_type === 'NUMBER' || g.input_type === 'DURATION') && (
                <label className="flex items-center gap-2 mt-2 text-[15px]">Günlük hedef
                  <input type="number" min={1} max={10000} className="input max-w-[110px] min-h-[40px]" value={g.target} onChange={e => updateGoal(g.id, { target: Math.max(1, Number(e.target.value) || 1) })} />
                  <span>{g.unit}</span>
                </label>
              )}
              {g.input_type === 'CHECKLIST' && (
                <ChecklistEditor items={g.items} onChange={items => updateGoal(g.id, { items, active: items.length > 0 ? g.active || true : false })} />
              )}
            </div>
          ))}
          {goals && (
            <p className={`text-[13px] ${maxDay > DAY_XP_LIMIT || activeCount > 20 ? 'text-warn' : 'text-ink-2'}`}>
              Aktif görev: {activeCount}/20 · En yoğun günün planı: {maxDay}/{DAY_XP_LIMIT} XP
              {maxDay > DAY_XP_LIMIT && ' · Günlük sınır aşıldı; bazı görevleri kapat.'}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setStep(0)}>Geri</Button>
            <Button className="flex-1" disabled={!goals || maxDay > DAY_XP_LIMIT || activeCount > 20} onClick={() => setStep(2)}>Devam</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-3">
          <h1 className="text-xl font-bold">Paylaşım</h1>
          <p className="text-[15px]">Varsayılan olarak partnerin yalnızca adını, karakterini, seviyeni ve bilet bakiyeni görür. Günlük yüzde, görev ayrıntıları ve ibadet kayıtları paylaşılmaz. Bunları sonradan Ayarlar’dan açabilirsin.</p>
          <p className="text-[15px]">Takip dışı bıraktığın günlerde partnerin yalnızca “Bugün kendi ritminde” mesajını görür; sebep hiçbir zaman sorulmaz.</p>
          <p className="text-[13px] text-ink-2">Dürüst not: Verileriniz Supabase üzerinde saklanır; servis işletmecisi teknik olarak veritabanına erişebilir. Uçtan uca şifreleme yoktur.</p>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setStep(1)}>Geri</Button>
            <Button className="flex-1" onClick={() => setStep(3)}>Devam</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-3">
          <h1 className="text-xl font-bold">Hazırız</h1>
          <p className="text-[15px]">Uygulama kendi beyanlarımızı kaydeder. Biletlerimizin karşılığını aramızda belirleriz.</p>
          <p className="text-[15px]">Telefonunda ana ekrana ekle: Android’de tarayıcı menüsünden “Ana ekrana ekle”, iPhone’da Safari paylaş menüsünden “Ana Ekrana Ekle”.</p>
          {error && <p className="text-warn" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setStep(2)}>Geri</Button>
            <Button className="flex-1" disabled={busy} onClick={() => void finish()}>{busy ? 'Kaydediliyor…' : 'Başla'}</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Choice({ label, options, value, onChange }: { label: string; options: Array<{ v: string; t: string; color?: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="font-semibold mb-1">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <label key={o.v} className={`btn min-h-[44px] cursor-pointer ${value === o.v ? 'btn-primary' : 'btn-soft'}`}>
            <input type="radio" className="sr-only" name={label} value={o.v} checked={value === o.v} onChange={() => onChange(o.v)} />
            {o.color && <span className="w-4 h-4 rounded-full border border-line" style={{ background: o.color }} aria-hidden="true" />}
            {o.t}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ChecklistEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('')
  return (
    <div className="mt-2 space-y-2">
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-[15px]">
            <span>• {it}</span>
            <button type="button" className="tap text-warn text-[13px]" aria-label={`${it} maddesini sil`} onClick={() => onChange(items.filter((_, j) => j !== i))}>Sil</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="input min-h-[40px]" placeholder="Yeni madde" maxLength={60} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) { onChange([...items, draft.trim()]); setDraft('') } } }} />
        <Button type="button" variant="soft" className="min-h-[40px]" onClick={() => { if (draft.trim()) { onChange([...items, draft.trim()]); setDraft('') } }}>Ekle</Button>
      </div>
      <p className="text-[13px] text-ink-2">Liste boşsa görev kapalı kalır. İçerik tamamen senin seçimin.</p>
    </div>
  )
}
