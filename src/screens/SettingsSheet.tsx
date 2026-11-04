// Ayarlar: zorluk (6 kademe), ses, görünüm/sınıf/ad, kurtarma kodları, çıkış, hesabı silme.
import { useState } from 'react'
import { deleteAccount, generateRecoveryCodes, setDifficulty, signOut, updateHero } from '../lib/game'
import { CLASS_INFO, type HeroClass, type Look } from '../game/art/hero'
import { HeroSprite, Icon, Portrait } from '../game/Sprite'
import { sfx } from '../game/sfx'
import { Sheet, toast, toastError, useGame } from '../game/ui'
import { DIFFICULTIES, DifficultyPicker, LookEditor } from './CreateHero'

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { game, run, refresh, go } = useGame()
  const h = game.hero!
  const [view, setView] = useState<'main' | 'look' | 'codes' | 'delete'>('main')
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

  return (
    <Sheet open={open} onClose={close} title={<span className="flex items-center gap-2"><Icon name="gear" size={24} />Ayarlar</span>}>
      {view === 'main' && (
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="font-pixel text-lg flex items-center gap-2"><Icon name="swords" size={22} />Zorluk
              {h.pendingDifficulty && <span className="ml-auto text-[13px] text-xp">Yarın: {DIFFICULTIES[h.pendingDifficulty - 1].name}</span>}
            </div>
            <DifficultyPicker value={h.pendingDifficulty ?? h.difficulty} onChange={n => void pickDiff(n)} />
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button className="pbtn pbtn-dark" onClick={() => void toggleSound()} aria-pressed={h.sound}>
              <Icon name={h.sound ? 'sound' : 'mute'} size={24} />{h.sound ? 'Ses açık' : 'Ses kapalı'}
            </button>
            <button className="pbtn pbtn-dark" onClick={() => { sfx.click(); setView('look') }}>
              <Portrait cls={h.class} look={h.look} gear={h.equipped} size={28} />Görünüm
            </button>
          </div>

          {!game.couple.hasPartner && (
            <button className="pbtn pbtn-purple w-full" onClick={() => { close(); go('arena') }}><Icon name="ticket" size={22} />Partnerini davet et</button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button className="pbtn pbtn-dark text-[15px]" onClick={() => { sfx.click(); setView('codes') }}><Icon name="lock" size={20} />Kurtarma kodu</button>
            <button className="pbtn pbtn-dark text-[15px]" onClick={() => void signOut()}>Çıkış yap</button>
          </div>
          <button className="w-full text-[13px] text-ink2 underline py-2" onClick={() => setView('delete')}>Hesabı sil</button>
        </div>
      )}
      {view === 'look' && <LookView onBack={() => setView('main')} />}
      {view === 'codes' && <CodesView onBack={() => setView('main')} />}
      {view === 'delete' && <DeleteView onBack={() => setView('main')} />}
    </Sheet>
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
            <span className="font-pixel text-[12px]" style={{ color: CLASS_INFO[c].color }}>{CLASS_INFO[c].name}</span>
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
      <p className="text-[15px] text-ink2">Şifreni unutursan bu kodlardan biriyle girersin. Her kod tek kullanımlık; yenisini üretmek eskileri iptal eder.</p>
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
      <p className="text-[15px]">Kahramanın, eşyaların ve biletlerin kalıcı olarak silinir. Onaylamak için <b>SİL</b> yaz.</p>
      <input className="input" value={text} onChange={e => setText(e.target.value)} aria-label="Onay" />
      <button className="pbtn pbtn-red w-full" disabled={busy || text.trim().toLocaleUpperCase('tr-TR') !== 'SİL'} onClick={() => void del()}>Hesabı kalıcı sil</button>
      <button className="pbtn pbtn-dark w-full" onClick={onBack}>◀ Geri</button>
    </div>
  )
}

