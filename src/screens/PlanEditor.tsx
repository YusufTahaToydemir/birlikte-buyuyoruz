import { useEffect, useState } from 'react'
import { errorText, getPlan, pauseGoal, renameGoal, saveNextWeekPlan, unpauseGoal, type PlanData, type PlanGoal } from '../lib/api'
import { Button, Dialog, Field, Spinner, toast } from '../components/ui'
import { formatDateTR } from '../lib/time'
import { ChecklistEditor } from './Onboarding'

const CATEGORY_TR: Record<string, string> = { START: 'Gün başlangıcı', WORSHIP: 'İbadet ve maneviyat', LEARNING: 'Öğrenme', BODY: 'Beden ve bakım' }
const TYPE_TR: Record<string, string> = { BOOLEAN: 'Evet/hayır', TIME: 'Saat', NUMBER: 'Sayı', DURATION: 'Süre (dk)', CHECKLIST: 'Kontrol listesi', CHOICE3: 'Üç seçenek' }
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

/** Görev planı: hesaplamayı etkileyen değişiklikler gelecek Pazartesi; ad/açıklama hemen; bırakma hemen (Şartname §5). */
export function PlanEditor({ onChange }: { onChange: () => void }) {
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [draft, setDraft] = useState<PlanGoal[]>([])
  const [penalty, setPenalty] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [pauseConfirm, setPauseConfirm] = useState<PlanGoal | null>(null)

  const load = () => getPlan().then(p => { setPlan(p); const base = p.next ?? p.current; setDraft(base.goals.map(g => ({ ...g }))); setPenalty(base.penaltyEnabled); setDirty(false) }).catch(e => toast(errorText(e)))
  useEffect(() => { void load() }, [])

  if (!plan) return <Spinner />

  const activeCount = draft.filter(g => g.active).length
  const maxDay = Math.max(0, ...[1, 2, 3, 4, 5, 6, 7].map(d => draft.filter(g => g.active && g.weekdays.includes(d) && !(g.inputType === 'CHECKLIST' && g.items.length === 0)).reduce((s, g) => s + g.maxXP, 0)))
  const overDay = maxDay > plan.limits.maxDailyPlannedXP
  const overCount = activeCount > plan.limits.maxActiveGoals
  const update = (id: string, patch: Partial<PlanGoal>) => { setDraft(d => d.map(g => g.id === id ? { ...g, ...patch } : g)); setDirty(true) }
  const isPaused = (id: string) => plan.pauses.some(p => p.stableGoalId === id)

  const run = async (fn: () => Promise<PlanData>, ok?: string) => {
    setBusy(true)
    try { const p = await fn(); setPlan(p); const base = p.next ?? p.current; setDraft(base.goals.map(g => ({ ...g }))); setPenalty(base.penaltyEnabled); setDirty(false); if (ok) toast(ok); onChange() }
    catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }

  const addGoal = () => {
    const g: PlanGoal = { id: '', code: 'CUSTOM', groupKey: null, name: 'Yeni görev', description: '', icon: '⭐', category: 'LEARNING', inputType: 'BOOLEAN', target: 1, unit: '', weekdays: [1, 2, 3, 4, 5, 6, 7], maxXP: 5, items: [], active: true, sortOrder: 999 }
    const tempId = `new-${crypto.randomUUID()}`
    setDraft(d => [...d, { ...g, id: tempId }]); setDirty(true); setEditing(tempId)
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-2">
        Bu hafta: {formatDateTR(plan.current.effectiveWeekStart, { day: 'numeric', month: 'long' })} planı{plan.current.penaltyEnabled ? ' · beslenme cezası açık' : ''}.
        Hedef, XP, gün ve ceza değişiklikleri <b>{formatDateTR(plan.nextWeekStart, { day: 'numeric', month: 'long' })} Pazartesi</b> yürürlüğe girer{plan.next ? ' (taslak kayıtlı)' : ''}. Ad ve açıklama hemen değişir. Geçmiş günlerin hesabı değişmez.
      </p>

      <label className="flex items-center justify-between min-h-[44px] text-[15px] p-2 rounded-[14px] bg-soft">
        <span>Beslenme cezası (gelecek hafta) <span className="block text-[13px] text-ink-2">Yalnızca “planıma uymadı” kaydında günlük −5 XP; net 0’ın altına inmez.</span></span>
        <input type="checkbox" role="switch" className="w-6 h-6" checked={penalty} onChange={e => { setPenalty(e.target.checked); setDirty(true) }} />
      </label>

      <ul className="space-y-2">
        {draft.map(g => (
          <li key={g.id} className={`p-2 rounded-[14px] border border-line ${g.active ? '' : 'opacity-60'}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" className="w-5 h-5" aria-label={`${g.name} aktif`} checked={g.active} disabled={g.inputType === 'CHECKLIST' && g.items.length === 0} onChange={e => update(g.id, { active: e.target.checked })} />
              <button className="flex-1 text-left min-h-[44px]" onClick={() => setEditing(editing === g.id ? null : g.id)} aria-expanded={editing === g.id}>
                <span className="font-semibold"><span aria-hidden="true">{g.icon}</span> {g.name}</span>
                <span className="block text-[13px] text-ink-2">{CATEGORY_TR[g.category]} · {TYPE_TR[g.inputType]}{g.inputType === 'NUMBER' || g.inputType === 'DURATION' ? ` · hedef ${g.target} ${g.unit}` : ''} · {g.maxXP} XP · {g.weekdays.length === 7 ? 'her gün' : g.weekdays.map(d => DAYS[d - 1]).join(', ')}{isPaused(g.id) ? ' · bu hafta takip dışı' : ''}</span>
              </button>
            </div>
            {editing === g.id && (
              <div className="mt-2 space-y-2 pl-7">
                <Field label="Ad"><input className="input min-h-[40px]" maxLength={60} value={g.name} onChange={e => update(g.id, { name: e.target.value })} /></Field>
                <Field label="Açıklama"><input className="input min-h-[40px]" maxLength={200} value={g.description} onChange={e => update(g.id, { description: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="İkon"><input className="input min-h-[40px]" maxLength={4} value={g.icon} onChange={e => update(g.id, { icon: e.target.value })} /></Field>
                  <Field label="XP (1–20)"><input type="number" className="input min-h-[40px]" min={1} max={20} value={g.maxXP} onChange={e => update(g.id, { maxXP: Number(e.target.value) })} /></Field>
                </div>
                {g.code === 'CUSTOM' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Kategori"><select className="input min-h-[40px]" value={g.category} onChange={e => update(g.id, { category: e.target.value as PlanGoal['category'] })}>{Object.entries(CATEGORY_TR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                    <Field label="Tür"><select className="input min-h-[40px]" value={g.inputType} onChange={e => update(g.id, { inputType: e.target.value as PlanGoal['inputType'], target: e.target.value === 'TIME' ? 390 : e.target.value === 'CHOICE3' ? 2 : g.target })}>{['BOOLEAN', 'NUMBER', 'DURATION', 'CHECKLIST'].map(k => <option key={k} value={k}>{TYPE_TR[k]}</option>)}</select></Field>
                  </div>
                )}
                {(g.inputType === 'NUMBER' || g.inputType === 'DURATION') && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Günlük hedef"><input type="number" className="input min-h-[40px]" min={1} value={g.target} onChange={e => update(g.id, { target: Math.max(1, Number(e.target.value) || 1) })} /></Field>
                    <Field label="Birim"><input className="input min-h-[40px]" maxLength={12} value={g.unit} onChange={e => update(g.id, { unit: e.target.value })} /></Field>
                  </div>
                )}
                {g.inputType === 'CHECKLIST' && <ChecklistEditor items={g.items} onChange={items => update(g.id, { items, active: items.length > 0 ? g.active : false })} />}
                <fieldset>
                  <legend className="font-semibold mb-1">Günler</legend>
                  <div className="flex flex-wrap gap-1">
                    {DAYS.map((d, i) => {
                      const on = g.weekdays.includes(i + 1)
                      return <button key={d} type="button" aria-pressed={on} className={`btn min-h-[40px] px-3 ${on ? 'btn-primary' : 'btn-soft'}`} onClick={() => update(g.id, { weekdays: on ? g.weekdays.filter(x => x !== i + 1) : [...g.weekdays, i + 1].sort() })}>{d}</button>
                    })}
                  </div>
                </fieldset>
                <div className="flex flex-wrap gap-2">
                  {!g.id.startsWith('new-') && <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void run(() => renameGoal(g.id, g.name, g.description, g.icon), 'Ad ve açıklama hemen güncellendi.')}>Adı hemen uygula</Button>}
                  {!g.id.startsWith('new-') && (isPaused(g.id)
                    ? <Button variant="soft" className="min-h-[40px]" disabled={busy} onClick={() => void run(() => unpauseGoal(g.id), 'Takip yeniden açıldı.')}>Takibi yeniden aç</Button>
                    : <Button variant="ghost" className="min-h-[40px]" disabled={busy} onClick={() => setPauseConfirm(g)}>Bu hafta takip dışı bırak</Button>)}
                  {g.id.startsWith('new-') && <Button variant="ghost" className="min-h-[40px]" onClick={() => { setDraft(d => d.filter(x => x.id !== g.id)); setEditing(null) }}>Kaldır</Button>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Button variant="soft" className="min-h-[40px]" onClick={addGoal}>Yeni görev ekle</Button>

      <p className={`text-[13px] ${overDay || overCount ? 'text-warn' : 'text-ink-2'}`}>
        Aktif görev: {activeCount}/{plan.limits.maxActiveGoals} · En yoğun günün planı: {maxDay}/{plan.limits.maxDailyPlannedXP} XP
        {overDay && ' · Günlük sınır aşıldı.'}{overCount && ' · Görev sayısı sınırı aşıldı.'}
      </p>
      <Button className="w-full" disabled={busy || !dirty || overDay || overCount} onClick={() => void run(() => saveNextWeekPlan(penalty, draft.map(g => ({ ...g, id: g.id.startsWith('new-') ? '' : g.id }))), `${formatDateTR(plan.nextWeekStart, { day: 'numeric', month: 'long' })} Pazartesi’den itibaren geçerli.`)}>
        Gelecek haftadan itibaren kaydet
      </Button>

      <Dialog open={pauseConfirm !== null} title="Görevi bu hafta takip dışı bırak">
        {pauseConfirm && (
          <div className="space-y-3 text-left">
            <h3 className="text-lg font-bold">{pauseConfirm.name}</h3>
            <p className="text-[15px]">Bugünden Pazar’a kadar bu görev takip dışı olur: XP ve ceza yok, bugünün hesabından çıkar. Geçmiş günler değişmez. Gelecek Pazartesi plan normal sürer.</p>
            <p className="text-[13px] text-ink-2">Bu seçim haftalık bilet koşullarını değiştirebilir: planlanan XP {pauseConfirm.maxXP * pauseConfirm.weekdays.length} XP’ye kadar azalır.</p>
            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => setPauseConfirm(null)}>Vazgeç</Button>
              <Button className="flex-1" disabled={busy} onClick={() => { const g = pauseConfirm; setPauseConfirm(null); void run(() => pauseGoal(g.id), 'Bu hafta takip dışı.') }}>Takip dışı bırak</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
