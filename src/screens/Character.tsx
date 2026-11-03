import { useEffect, useState } from 'react'
import { errorText, getRewards, updateProfile, type AvatarConfig, type Me, type RewardsData } from '../lib/api'
import { Avatar, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../components/Avatar'
import { Button, Card, Spinner, toast } from '../components/ui'

const SKILLS = [
  { level: 2, name: 'Yanındayım', text: 'Karakter el sallar, “Bugün de yanındayım.”' },
  { level: 4, name: 'Küçük Çiçek', text: 'Partnerin sahnesinde bir çiçek belirir' },
  { level: 7, name: 'Sıcak Bir Mola', text: '“Birlikte kısa bir mola verelim mi?” kartı' },
  { level: 10, name: 'Kalpten Not', text: 'En çok 280 karakterlik özel mesaj' },
  { level: 14, name: 'Piknik Daveti', text: 'Ortak etkinlik önerisi' },
  { level: 20, name: 'Yıldızlı Akşam', text: 'İki karakterli kısa gece sahnesi' },
]

export function Character({ me, onChange }: { me: Me; onChange: () => void }) {
  const [rewards, setRewards] = useState<RewardsData | null>(null)
  const [tryOutfit, setTryOutfit] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<AvatarConfig>(me.profile.avatar)
  const [tab, setTab] = useState<'outfit' | 'look' | 'skills'>('outfit')
  const [busy, setBusy] = useState(false)

  useEffect(() => { getRewards().then(setRewards).catch(e => toast(errorText(e))) }, [])
  useEffect(() => setAvatar(me.profile.avatar), [me.profile.avatar])

  const level = me.totals.level
  const currentOutfit = me.profile.equipped.outfit ?? me.profile.avatar.outfit ?? 'outfit_starter'
  const shownOutfit = tryOutfit ?? currentOutfit

  const wear = async (id: string) => {
    setBusy(true)
    try {
      await updateProfile({ avatar: { ...avatar, outfit: id } })
      toast('Kıyafet giyildi.')
      setTryOutfit(null)
      onChange()
    } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }
  const saveLook = async () => {
    setBusy(true)
    try { await updateProfile({ avatar }); toast('Görünüm kaydedildi.'); onChange() } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center">
        <Avatar config={{ ...avatar, outfit: shownOutfit }} equipped={{ ...me.profile.equipped, outfit: shownOutfit }} size={170} animate={me.profile.motion !== 'REDUCED'} />
        <p className="font-bold mt-1">{me.displayName} · Seviye {level}</p>
        {tryOutfit && <p className="text-[13px] text-ink-2">Deneme görünümü · kaydedilmedi</p>}
      </Card>

      <div role="tablist" aria-label="Karakter bölümleri" className="grid grid-cols-3 gap-2">
        {([['outfit', 'Kıyafet'], ['look', 'Görünüm'], ['skills', 'Beceriler']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`btn min-h-[44px] ${tab === id ? 'btn-primary' : 'btn-soft'}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'outfit' && (
        <Card>
          {!rewards && <Spinner />}
          <ul className="space-y-2">
            {rewards?.catalog.filter(c => c.kind === 'OUTFIT').map(c => {
              const unlocked = level >= c.requiredLevel
              const worn = currentOutfit === c.id
              return (
                <li key={c.id} className={`flex items-center gap-3 p-2 rounded-[14px] border border-line ${unlocked ? '' : 'opacity-60'}`}>
                  <span className="w-9 h-9 rounded-full border border-line" style={{ background: OUTFIT_COLORS[c.id]?.main ?? '#ccc' }} aria-hidden="true" />
                  <div className="flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-[13px] text-ink-2">{unlocked ? (worn ? 'Giyili' : 'Ücretsiz · seviye ile açıldı') : `Seviye ${c.requiredLevel}’de açılır`}</p>
                  </div>
                  {unlocked ? (
                    <div className="flex gap-1">
                      <Button variant="ghost" className="min-h-[40px] px-3" onClick={() => setTryOutfit(c.id)}>Dene</Button>
                      <Button className="min-h-[40px] px-3" disabled={busy || worn} onClick={() => void wear(c.id)}>Giy</Button>
                    </div>
                  ) : <span className="text-[13px] text-ink-2">🔒</span>}
                </li>
              )
            })}
          </ul>
          <p className="text-[13px] text-ink-2 mt-3">Aksesuar, el objesi ve efektler kalple satın alınır; katalog Ödüller sekmesinde (Aşama 2’de açılacak).</p>
        </Card>
      )}

      {tab === 'look' && (
        <Card className="space-y-3">
          <Row label="Karakter">
            {(['lady', 'gent'] as const).map(t => <Pick key={t} on={avatar.type === t} onClick={() => setAvatar(a => ({ ...a, type: t, hair: 0 }))}>{t === 'lady' ? 'Hanımefendi' : 'Beyefendi'}</Pick>)}
          </Row>
          <Row label="Ten tonu">
            {SKIN_TONES.map((c, i) => <Pick key={i} on={(avatar.skin ?? 0) === i} onClick={() => setAvatar(a => ({ ...a, skin: i }))}><span className="w-4 h-4 rounded-full border border-line" style={{ background: c }} aria-hidden="true" />{['Açık', 'Orta', 'Koyu'][i]}</Pick>)}
          </Row>
          <Row label={avatar.type === 'gent' ? 'Saç' : 'Saç veya başörtüsü'}>
            {(avatar.type === 'gent' ? ['Kısa', 'Dalgalı', 'Sakallı'] : ['Açık saç', 'Topuz', 'Başörtülü']).map((t, i) => <Pick key={i} on={(avatar.hair ?? 0) === i} onClick={() => setAvatar(a => ({ ...a, hair: i }))}>{t}</Pick>)}
          </Row>
          {!(avatar.type === 'lady' && avatar.hair === 2) && (
            <Row label="Saç rengi">
              {HAIR_COLORS.map((c, i) => <Pick key={i} on={(avatar.hairColor ?? 0) === i} onClick={() => setAvatar(a => ({ ...a, hairColor: i }))}><span className="w-4 h-4 rounded-full border border-line" style={{ background: c }} aria-hidden="true" />{['Koyu', 'Kestane', 'Açık'][i]}</Pick>)}
            </Row>
          )}
          <Button className="w-full" disabled={busy} onClick={() => void saveLook()}>Kaydet</Button>
          <p className="text-[13px] text-ink-2">Bu seçimler ücretsizdir; XP veya kalp gerekmez.</p>
        </Card>
      )}

      {tab === 'skills' && (
        <Card>
          <ul className="space-y-2">
            {SKILLS.map(s => (
              <li key={s.level} className={`p-2 rounded-[14px] border border-line ${level >= s.level ? '' : 'opacity-60'}`}>
                <p className="font-semibold">{s.name} <span className="text-[13px] text-ink-2 font-normal">· {level >= s.level ? 'açık' : `Seviye ${s.level}’de açılır`}</span></p>
                <p className="text-[13px] text-ink-2">{s.text}</p>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-ink-2 mt-3">Beceriler XP veya bilet avantajı vermez; yalnızca sevimli etkileşimlerdir. Gönderme akışı Aşama 2’de açılacak.</p>
        </Card>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="font-semibold mb-1">{label}</p><div className="flex flex-wrap gap-2">{children}</div></div>
}
function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} className={`btn min-h-[44px] ${on ? 'btn-primary' : 'btn-soft'}`} onClick={onClick}>{children}</button>
}
