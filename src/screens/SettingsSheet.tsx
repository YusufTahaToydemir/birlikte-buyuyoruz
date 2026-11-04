// Ayarlar: zorluk (6 kademe), ses, görünüm/sınıf/ad, kurtarma kodları, çıkış, hesabı silme.
import { useState } from 'react'
import { deleteAccount, generateRecoveryCodes, setDifficulty, setReminder, setSpecial, signOut, SPECIAL_EXTRA, SPECIAL_HIDE, updateHero } from '../lib/game'
import { disablePush, enablePush, pushSupported } from '../lib/push'
import { CLASS_INFO, type HeroClass, type Look } from '../game/art/hero'
import { HeroSprite, Icon, Portrait } from '../game/Sprite'
import { sfx } from '../game/sfx'
import { music } from '../game/music'
import { Sheet, toast, toastError, useGame } from '../game/ui'
import { DIFFICULTIES, DifficultyPicker, LookEditor } from './CreateHero'

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { game, run, refresh, go } = useGame()
  const h = game.hero!
  const [view, setView] = useState<'main' | 'look' | 'codes' | 'delete' | 'special'>('main')
  const [musicOn, setMusicOn] = useState(music.isEnabled())
  const close = () => { setView('main'); onClose() }

  async function pickDiff(n: number) {
    if (n === h.difficulty && !h.pendingDifficulty) return
    const g = await run(() => setDifficulty(n))
    if (!g) return
    sfx.levelUp()
    if (g.hero!.pendingDifficulty) toast(`Yarın: ${DIFFICULTIES[n - 1].name}`)
    else toast(`Zorluk: ${DIFFICULTIES[n - 1].name}`)
  }

  async function toggleSound() {
    const on = !h.sound
    try { await updateHero({ sound: on }); await refresh(); if (on) sfx.coin() } catch (e) { toastError(e) }
  }
  const [pushBusy, setPushBusy] = useState(false)
  const pushOn = h.pushSubs > 0
  async function togglePush() {
    setPushBusy(true)
    try {
      if (pushOn) { await disablePush(); toast('Bildirimler kapalı') }
      else { await enablePush(game.config.vapidPublic ?? ''); sfx.ticket(); toast('Bildirimler açık') }
      await refresh()
    } catch (e) { toastError(e) } finally { setPushBusy(false) }
  }
  async function pickHour(hr: number | null) {
    const g = await run(() => setReminder(hr))
    if (g) { sfx.click(); toast(hr === null ? 'Akşam hatırlatması kapalı' : `Hatırlatma: ${hr}:00`) }
  }

  return (
    <Sheet open={open} onClose={close} title={<span className="flex items-center gap-2"><Icon name="gear" size={24} />Ayarlar</span>}>
      {view === 'main' && (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="font-pixel text-lg flex items-center gap-2"><Icon name="swords" size={22} />Zorluk
              {h.pendingDifficulty && <span className="ml-auto text-[15px] text-xp">Yarın: {DIFFICULTIES[h.pendingDifficulty - 1].name}</span>}
            </div>
            <DifficultyPicker value={h.pendingDifficulty ?? h.difficulty} onChange={n => void pickDiff(n)} />
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button className="pbtn pbtn-dark" onClick={() => void toggleSound()} aria-pressed={h.sound}>
              <Icon name={h.sound ? 'sound' : 'mute'} size={24} />{h.sound ? 'Efekt açık' : 'Efekt kapalı'}
            </button>
            <button className="pbtn pbtn-dark" onClick={() => { const on = !musicOn; music.setEnabled(on); setMusicOn(on); sfx.click() }} aria-pressed={musicOn}>
              <Icon name="note" size={24} className={musicOn ? 'bob' : 'opacity-40 grayscale'} />{musicOn ? 'Müzik açık' : 'Müzik kapalı'}
            </button>
            <button className="pbtn pbtn-dark col-span-2" onClick={() => { sfx.click(); setView('look') }}>
              <Portrait cls={h.class} look={h.look} gear={h.equipped} size={28} />Görünüm
            </button>
          </div>

          <button className={`pbtn ${game.special.on ? 'pbtn-blue' : 'pbtn-dark'} w-full`} onClick={() => { sfx.click(); setView('special') }}>
            <Icon name="shield" size={22} />Özel gün modu{game.special.on && <span className="text-[14px] bg-edge/50 rounded px-1.5">Açık · {game.special.days}. gün</span>}
          </button>

          <section className="space-y-2">
            <div className="font-pixel text-lg flex items-center gap-2"><Icon name="bolt" size={22} />Bildirimler
              {!pushSupported() && <span className="ml-auto text-[13px] text-ink2">Bu cihazda yok</span>}
            </div>
            <button className={`pbtn ${pushOn ? 'pbtn-green' : 'pbtn-dark'} w-full`} disabled={pushBusy || !pushSupported()} onClick={() => void togglePush()} aria-pressed={pushOn}>
              <Icon name={pushOn ? 'sound' : 'mute'} size={22} />{pushOn ? 'Bildirimler açık' : 'Bildirimleri aç'}
            </button>
            {pushOn && (
              <div className="space-y-1">
                <div className="font-pixel text-[14px] text-ink2">Akşam hatırlatması (eksik görev varsa)</div>
                <div className="grid grid-cols-5 gap-1">
                  {[null, 18, 20, 21, 22].map(hr => (
                    <button key={String(hr)} className={`panel-dark py-1.5 font-pixel text-[15px] ${h.remindHour === hr ? '!border-gold text-gold' : 'text-ink2'}`} onClick={() => void pickHour(hr)}>{hr === null ? 'Kapalı' : `${hr}:00`}</button>
                  ))}
                </div>
                <p className="font-pixel text-[13px] text-ink2">Eşinden gelenler (alkış, düello, mektup…) anında bildirilir.</p>
              </div>
            )}
          </section>

          {!game.couple.hasPartner && (
            <button className="pbtn pbtn-purple w-full" onClick={() => { close(); go('arena') }}><Icon name="ticket" size={22} />Partnerini davet et</button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button className="pbtn pbtn-dark text-[17px]" onClick={() => { sfx.click(); setView('codes') }}><Icon name="lock" size={20} />Kurtarma kodu</button>
            <button className="pbtn pbtn-dark text-[17px]" onClick={() => void signOut()}>Çıkış yap</button>
          </div>
          <button className="w-full text-[15px] text-ink2 underline py-2" onClick={() => setView('delete')}>Hesabı sil</button>
        </div>
      )}
      {view === 'special' && <SpecialView onBack={() => setView('main')} />}
      {view === 'look' && <LookView onBack={() => setView('main')} />}
      {view === 'codes' && <CodesView onBack={() => setView('main')} />}
      {view === 'delete' && <DeleteView onBack={() => setView('main')} />}
    </Sheet>
  )
}

/** Özel gün modu: seçilen ibadet görevleri listeden kalkar; yerine hafif görevler gelir. XP, altın ve hasar aynen aktarılır. */
function SpecialView({ onBack }: { onBack: () => void }) {
  const { game, run } = useGame()
  const sp = game.special
  const [hide, setHide] = useState<string[]>(sp.hide)
  const [extra, setExtra] = useState<string[]>(sp.extra)
  const [busy, setBusy] = useState(false)
  const toggle = (list: string[], set: (l: string[]) => void, code: string) => { sfx.click(); set(list.includes(code) ? list.filter(c => c !== code) : [...list, code]) }
  const dirty = JSON.stringify([...hide].sort()) !== JSON.stringify([...sp.hide].sort()) || JSON.stringify([...extra].sort()) !== JSON.stringify([...sp.extra].sort())
  async function save(on: boolean | null) {
    setBusy(true)
    try {
      const g = await run(() => setSpecial(on, hide, extra.length ? extra : null))
      if (g) { sfx.heal(); toast(on === true ? 'Özel gün modu açık' : on === false ? 'Özel gün modu kapalı' : 'Kaydedildi') }
    } finally { setBusy(false) }
  }
  const chip = (o: { code: string; name: string; icon: string }, list: string[], set: (l: string[]) => void) => {
    const on = list.includes(o.code)
    return (
      <button key={o.code} className={`panel-dark px-2 py-1.5 flex items-center gap-2 text-left font-pixel text-[15px] ${on ? '!border-gold text-ink' : 'text-ink2 opacity-70'}`} onClick={() => toggle(list, set, o.code)} aria-pressed={on}>
        <Icon name={o.icon} size={24} className={on ? '' : 'grayscale'} /><span className="flex-1 leading-tight">{o.name}</span>{on && <Icon name="check" size={16} />}
      </button>
    )
  }
  return (
    <div className="space-y-3">
      <div className="panel-dark p-3 font-pixel text-[15px] leading-tight space-y-1">
        <div className="flex items-center gap-2 text-lg text-xp"><Icon name="shield" size={24} />Nasıl çalışır?</div>
        <p className="text-ink">Seçtiğin ibadet görevleri o günlerde listeden kalkar, yerine hafif görevler gelir.</p>
        <p className="text-ok">XP, altın ve canavar hasarı aynen yerine gelen görevlere aktarılır; geride kalmazsın. Seri, can ve kombo etkilenmez.</p>
        <p className="text-ink2">Eşin yalnızca küçük bir simge görür. 14 gün sonra kendiliğinden kapanır.</p>
      </div>
      <div className="font-pixel text-lg flex items-center gap-2"><Icon name="moon" size={22} />Listeden kalkacaklar</div>
      <div className="grid grid-cols-2 gap-2">{SPECIAL_HIDE.map(o => chip(o, hide, setHide))}</div>
      <div className="font-pixel text-lg flex items-center gap-2"><Icon name="sparkle" size={22} />Yerine gelecekler</div>
      <div className="grid grid-cols-2 gap-2">{SPECIAL_EXTRA.map(o => chip(o, extra, setExtra))}</div>
      {sp.on ? (
        <div className="grid grid-cols-2 gap-2">
          <button className="pbtn pbtn-red" disabled={busy} onClick={() => void save(false)}>Modu kapat</button>
          <button className="pbtn pbtn-gold" disabled={busy || !dirty || extra.length === 0} onClick={() => void save(null)}><Icon name="check" size={22} />Kaydet</button>
        </div>
      ) : (
        <button className="pbtn pbtn-blue w-full text-xl" disabled={busy || extra.length === 0} onClick={() => void save(true)}><Icon name="shield" size={24} />Modu aç</button>
      )}
      <button className="pbtn pbtn-dark w-full" onClick={onBack}>◀ Geri</button>
    </div>
  )
}

function LookView({ onBack }: { onBack: () => void }) {
  const { game, refresh } = useGame()
  const h = game.hero!
  const [cls, setCls] = useState<HeroClass>(h.class)
  const [look, setLook] = useState<Look>(h.look)
  const [name, setName] = useState(h.name)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await updateHero({ name: name.trim() !== h.name ? name.trim() : undefined, cls: cls !== h.class ? cls : undefined, look })
      await refresh(); sfx.buy(); onBack()
    } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="panel-dark flex justify-center py-2"><HeroSprite cls={cls} look={look} gear={h.equipped} scale={4} /></div>
      <input className="input font-pixel text-lg" maxLength={24} value={name} onChange={e => setName(e.target.value)} aria-label="Ad" />
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(CLASS_INFO) as HeroClass[]).map(c => (
          <button key={c} className={`panel-dark py-1 flex flex-col items-center ${cls === c ? '!border-gold' : 'opacity-60'}`} onClick={() => { sfx.click(); setCls(c) }}>
            <Portrait cls={c} look={look} size={40} />
            <span className="font-pixel text-[14px]" style={{ color: CLASS_INFO[c].color }}>{CLASS_INFO[c].name}</span>
          </button>
        ))}
      </div>
      <LookEditor cls={cls} look={look} onChange={setLook} />
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button className="pbtn pbtn-dark" onClick={onBack}>◀</button>
        <button className="pbtn pbtn-gold" disabled={busy || name.trim().length === 0} onClick={() => void save()}><Icon name="check" size={22} />Kaydet</button>
      </div>
    </div>
  )
}

function CodesView({ onBack }: { onBack: () => void }) {
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const make = async () => {
    setBusy(true)
    try { setCodes((await generateRecoveryCodes()).codes); sfx.ticket() } catch (e) { toastError(e) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <p className="text-[17px] text-ink2">Şifreni unutursan bu kodlardan biriyle girersin. Her kod tek kullanımlık; yenisini üretmek eskileri iptal eder.</p>
      {codes ? (
        <>
          <div className="panel-dark p-3 grid grid-cols-2 gap-2 font-mono text-lg text-center select-all">{codes.map(c => <span key={c}>{c}</span>)}</div>
          <button className="pbtn pbtn-green w-full" onClick={() => { void navigator.clipboard?.writeText(codes.join('\n')); sfx.coin(); toast('Kopyalandı') }}>Kopyala</button>
        </>
      ) : <button className="pbtn pbtn-gold w-full" disabled={busy} onClick={() => void make()}><Icon name="lock" size={22} />Kod üret</button>}
      <button className="pbtn pbtn-dark w-full" onClick={onBack}>◀ Geri</button>
    </div>
  )
}

function DeleteView({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const del = async () => {
    setBusy(true)
    try { await deleteAccount(); await signOut() } catch (e) { toastError(e); setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-center"><Icon name="heart" size={56} className="grayscale" /></div>
      <p className="text-[17px]">Kahramanın, eşyaların ve biletlerin kalıcı olarak silinir. Onaylamak için <b>SİL</b> yaz.</p>
      <input className="input" value={text} onChange={e => setText(e.target.value)} aria-label="Onay" />
      <button className="pbtn pbtn-red w-full" disabled={busy || text.trim().toLocaleUpperCase('tr-TR') !== 'SİL'} onClick={() => void del()}>Hesabı kalıcı sil</button>
      <button className="pbtn pbtn-dark w-full" onClick={onBack}>◀ Geri</button>
    </div>
  )
}

