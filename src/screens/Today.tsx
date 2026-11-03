import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, errorText, excuseDay, getDay, getToday, markLevelSeen, markTicketsSeen, recordTask, type Instance, type Me, type RecordResult, type Summary, type TaskAction, type TodayData } from '../lib/api'
import { previewXP, statusForValue } from '../domain/xp'
import { clockToMinutes, formatDateTR, formatTimeTR, greeting, minutesToClock, pct } from '../lib/time'
import { cache, coalesce, flush, isOnline, queue, type QueuedOp } from '../lib/offline'
import { Avatar } from '../components/Avatar'
import { Button, Card, Dialog, ProgressBar, Sheet, Spinner, STATUS_TEXT, StatusRing, toast } from '../components/ui'

const CATEGORY_LABEL: Record<string, string> = { START: 'Gün başlangıcı', WORSHIP: 'İbadet ve maneviyat', LEARNING: 'Öğrenme', BODY: 'Beden ve bakım' }
const CATEGORY_ORDER = ['START', 'WORSHIP', 'LEARNING', 'BODY']

type SubmitOpts = { value?: number; itemValues?: boolean[]; note?: string; operationId?: string }
export type Submit = (inst: Instance, date: string, action: TaskAction, opts?: SubmitOpts) => Promise<RecordResult>

const isNetworkError = (e: unknown) => !isOnline() || e instanceof TypeError || (e instanceof Error && /fetch|network|Failed to/i.test(e.message))

/** Yerel önizleme: sunucu kuralıyla aynı durum/XP, ama "bekliyor" işaretli. */
function localPreview(inst: Instance, action: TaskAction, opts: SubmitOpts): Instance {
  const s = inst.snapshot
  let status = inst.status; let value = inst.value; let items = inst.itemValues
  if (action === 'set_completed') { status = 'COMPLETED'; value = s.input_type === 'CHOICE3' ? 2 : s.input_type === 'BOOLEAN' ? 1 : Math.max(inst.value ?? 0, s.target); items = s.items.map(() => true) }
  else if (action === 'set_not_done') { status = 'MISSED_SELF'; value = s.input_type === 'CHOICE3' ? 0 : null; items = [] }
  else if (action === 'set_excused') { status = 'EXCUSED'; value = null; items = [] }
  else if (action === 'clear') { status = 'PENDING'; value = null; items = [] }
  else if (action === 'set_value') {
    if (s.input_type === 'CHECKLIST') { items = opts.itemValues ?? []; const done = items.filter(Boolean).length; status = statusForValue('CHECKLIST', s.target, 0, done, s.items.length); value = done }
    else { value = opts.value ?? 0; status = statusForValue(s.input_type, s.target, value) }
  }
  const earnedXP = previewXP(s.input_type, s.max_xp, s.target, status, value, items, s.items.length)
  return { ...inst, status, value, itemValues: items, earnedXP, pending: true }
}

export function Today({ me, onTotalsChange }: { me: Me; onTotalsChange: () => void }) {
  const [data, setData] = useState<TodayData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(!isOnline())
  const [pendingOps, setPendingOps] = useState<QueuedOp[]>([])
  const [celebrate, setCelebrate] = useState<number | null>(null)
  const [ticketDialog, setTicketDialog] = useState(false)
  const [mood, setMood] = useState<'neutral' | 'joy'>('neutral')
  const [yesterdayOpen, setYesterdayOpen] = useState(false)
  const flushing = useRef(false)

  const refreshQueue = useCallback(async () => setPendingOps(await queue.all(me.id)), [me.id])

  const doFlush = useCallback(async () => {
    if (flushing.current || !isOnline()) return
    flushing.current = true
    try {
      const r = await flush(me.id, op => recordTask(op.instanceId, op.baseRevision, op.action, { value: op.value ?? undefined, itemValues: op.itemValues ?? undefined, operationId: op.id }))
      if (r.sent > 0) toast(`${r.sent} bekleyen kayıt gönderildi.`)
      if (r.expired > 0) toast('Bazı kayıtlar süre dolduğu için gönderilemedi.')
      if (r.conflicts > 0) toast('Bir kayıt başka cihazdan değiştirilmiş; karşılaştırma aşağıda.')
      if (r.sent > 0) onTotalsChange()
    } finally { flushing.current = false; await refreshQueue() }
  }, [me.id, onTotalsChange, refreshQueue])

  const load = useCallback(async () => {
    try {
      setError(null)
      const pend = await queue.all(me.id)
      if (pend.some(p => p.status === 'pending' || p.status === 'error')) await doFlush()
      const d = await getToday()
      setData(d); setOffline(false)
      await cache.setToday(me.id, d)
      if (d.unseenLevels.length) setCelebrate(d.unseenLevels[0])
      else if (d.newTickets.length) setTicketDialog(true)
    } catch (e) {
      if (isNetworkError(e)) {
        const c = await cache.getToday(me.id)
        if (c) {
          // bekleyen kayıtların önizlemesini uygula
          const pend = await queue.all(me.id)
          const inst = c.instances.map(i => { const op = pend.find(p => p.instanceId === i.id && p.status === 'pending'); return op ? localPreview(i, op.action, { value: op.value ?? undefined, itemValues: op.itemValues ?? undefined }) : i })
          setData({ ...c, instances: inst }); setOffline(true)
        } else setError('Bağlantı yok ve cihazda kayıtlı bir kopya bulunamadı.')
      } else setError(errorText(e))
    } finally { await refreshQueue() }
  }, [me.id, doFlush, refreshQueue])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void load() }
    const onOnline = () => { setOffline(false); void load() }
    const onOffline = () => setOffline(true)
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    return () => { document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [load])

  const applyResult = (r: RecordResult) => {
    setData(d => d ? { ...d, summary: r.summary ?? d.summary, totals: r.totals ?? d.totals, instances: d.instances.map(i => i.id === r.instance.id ? r.instance : i) } : d)
    if (r.xpDelta > 0) { setMood('joy'); window.setTimeout(() => setMood('neutral'), 800) }
    if (r.xpDelta !== 0) onTotalsChange()
    if (r.totals && r.totals.level !== data?.totals.level) void load()
  }

  /** Çevrimiçi ise sunucuya, değilse kuyruğa. Not çevrimdışı kuyruğa alınmaz. */
  const submit: Submit = async (inst, date, action, opts = {}) => {
    const opId = opts.operationId ?? crypto.randomUUID()
    if (isOnline()) {
      try { return await recordTask(inst.id, inst.revision, action, { ...opts, operationId: opId }) }
      catch (e) { if (!isNetworkError(e)) throw e }
    }
    if (opts.note) toast('Not çevrimdışı kaydedilmez; bağlantı gelince ekleyebilirsin.')
    const op: QueuedOp = { id: opId, userId: me.id, instanceId: inst.id, date, baseRevision: inst.pending ? inst.revision : inst.revision, action, value: opts.value ?? null, itemValues: opts.itemValues ?? null, createdAt: new Date().toISOString(), status: 'pending', goalName: inst.snapshot.name }
    const existing = await queue.all(me.id)
    const { ops, replaced } = coalesce(existing, op)
    const stored = ops.find(o => o.instanceId === inst.id && o.status === 'pending') ?? op
    if (replaced) await queue.remove(replaced.id)
    await queue.put(stored)
    setOffline(true)
    await refreshQueue()
    const preview = localPreview(inst, action, opts)
    toast('Cihazda kaydedildi · gönderilmeyi bekliyor')
    return { instance: preview, summary: undefined as unknown as Summary, xpDelta: 0, dayGrossXP: 0, dayNetXP: 0, totals: undefined as unknown as RecordResult['totals'], correctionDeadline: '', serverTime: '' }
  }

  if (error) return <Card><p className="text-warn" role="alert">{error}</p><Button className="mt-3" onClick={() => void load()}>Tekrar dene</Button></Card>
  if (!data) return <Spinner />

  const { summary, instances, totals } = data
  const levelSpan = totals.nextLevelXP === null ? 1 : totals.nextLevelXP - totals.levelStart
  const levelProgress = totals.nextLevelXP === null ? 1 : totals.totalXP - totals.levelStart
  const failedOps = pendingOps.filter(o => o.status === 'expired' || o.status === 'conflict' || o.status === 'error')
  const waiting = pendingOps.filter(o => o.status === 'pending' || o.status === 'sending').length

  return (
    <div className="space-y-4">
      {offline && (
        <div className="card p-3 text-[15px] flex items-center justify-between gap-2" role="status">
          <span>Çevrimdışı · son senkronize kopya{waiting > 0 ? ` · ${waiting} kayıt gönderilmeyi bekliyor` : ''}</span>
          <Button variant="soft" className="min-h-[40px]" onClick={() => void load()}>Yenile</Button>
        </div>
      )}
      {!offline && waiting > 0 && <p className="text-[13px] text-ink-2" role="status">{waiting} kayıt gönderiliyor…</p>}

      <div>
        <p className="text-ink-2 text-[15px]">{formatDateTR(data.today)}</p>
        <h2 className="text-xl font-bold">{greeting()}, {me.displayName}</h2>
      </div>

      <Card className="flex items-center gap-4">
        <Avatar config={me.profile.avatar} equipped={me.profile.equipped} size={88} mood={mood} animate={me.profile.motion !== 'REDUCED'} />
        <div className="flex-1 min-w-0">
          <p className="font-bold">Seviye {totals.level}{totals.level >= 50 ? ' · En yüksek seviye' : ''}</p>
          <p className="text-[13px] text-ink-2 mb-1">{totals.nextLevelXP === null ? `${totals.totalXP} XP` : `${levelProgress} / ${levelSpan} XP · toplam ${totals.totalXP}`}</p>
          <ProgressBar value={levelProgress} max={levelSpan} label="Seviye ilerlemesi" />
        </div>
      </Card>

      <Card>
        <DaySummaryLine summary={summary} />
        <TaskList instances={instances} editable={summary.state !== 'FINALIZED' && (offline || new Date(summary.correctionDeadline) > new Date(data.serverTime))} onResult={applyResult} dayState={summary.state} date={data.today} submit={submit} offline={offline} />
        <div className="mt-3 pt-3 border-t border-line space-y-2 text-[13px] text-ink-2">
          <p>Bugünün kayıtları yarın 12.00’a kadar düzeltilebilir. Kayıt saati: İstanbul.</p>
          {data.yesterday && !offline && (
            <button className="text-primary font-semibold underline min-h-[44px]" onClick={() => setYesterdayOpen(true)}>
              Dünün kaydını düzelt (son: {formatTimeTR(data.yesterday.correctionDeadline)})
            </button>
          )}
          {!offline && <ExcuseDayButton date={data.today} summary={summary} onDone={() => void load()} />}
        </div>
      </Card>

      {failedOps.length > 0 && (
        <Card>
          <h3 className="font-bold mb-2">Gönderilemeyen kayıtlar</h3>
          <ul className="space-y-2">
            {failedOps.map(op => (
              <li key={op.id} className="p-2 rounded-[14px] border border-line text-[15px]">
                <p className="font-semibold">{op.goalName ?? 'Görev'} · {formatDateTR(op.date, { day: 'numeric', month: 'short' })}</p>
                {op.status === 'expired' && <p className="text-[13px] text-warn">Süre dolduğu için gönderilemedi. Cihazda {describeOp(op)}; bu kayıt geçmişe yazılmaz.</p>}
                {op.status === 'conflict' && op.serverInstance && (
                  <p className="text-[13px] text-ink-2">Sunucudaki değer: <b>{describeInstance(op.serverInstance)}</b> · Bu cihazdaki değer: <b>{describeOp(op)}</b></p>
                )}
                {op.status === 'error' && <p className="text-[13px] text-warn">Gönderilemedi: {errorText(new ApiError(op.error ?? 'UNKNOWN'))}</p>}
                <div className="flex gap-2 mt-2">
                  {op.status === 'conflict' && op.serverInstance && (
                    <Button className="min-h-[40px]" onClick={async () => { await queue.put({ ...op, status: 'pending', baseRevision: op.serverInstance!.revision, serverInstance: undefined }); await doFlush(); await load() }}>Cihazdaki değeri kaydet</Button>
                  )}
                  <Button variant="soft" className="min-h-[40px]" onClick={async () => { await queue.remove(op.id); await refreshQueue(); if (op.status === 'conflict') await load() }}>{op.status === 'conflict' ? 'Sunucudaki değeri tut' : 'Kaydı sil'}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Sheet open={yesterdayOpen} onClose={() => setYesterdayOpen(false)} title="Dünün kaydı">
        {data.yesterday && <DayEditor date={data.yesterday.date} submit={submit} onChanged={() => { onTotalsChange(); void load() }} />}
      </Sheet>

      <Dialog open={celebrate !== null} title="Seviye atladın">
        <div className="space-y-3">
          <div className="text-5xl" aria-hidden="true">🌸</div>
          <h3 className="text-xl font-bold">Seviye {celebrate}</h3>
          <p className="text-ink-2">Küçük adımların birikti.</p>
          <Button className="w-full" onClick={async () => { const l = celebrate!; setCelebrate(null); await markLevelSeen(l).catch(() => undefined); const rest = data.unseenLevels.filter(x => x > l); if (rest.length) setCelebrate(rest[0]); else if (data.newTickets.length) setTicketDialog(true) }}>Devam</Button>
        </div>
      </Dialog>

      <Dialog open={ticketDialog} title="Bilet">
        <div className="space-y-4">
          <div className="mx-auto w-24 h-16 rounded-[12px] bg-ticket flex items-center justify-center text-3xl shadow-sm" aria-hidden="true">🎫</div>
          <p className="text-xl font-bold">Bir bilet hakkı kazandın.</p>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={async () => { setTicketDialog(false); await markTicketsSeen().catch(() => undefined) }}>Kapat</Button>
            <Button className="flex-1" onClick={async () => { setTicketDialog(false); await markTicketsSeen().catch(() => undefined); toast('Cüzdanın Ödüller sekmesinde.') }}>Cüzdanım</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function describeOp(op: QueuedOp): string {
  if (op.action === 'set_completed') return 'yapıldı'
  if (op.action === 'set_not_done') return 'yapılmadı'
  if (op.action === 'set_excused') return 'takip dışı'
  if (op.action === 'clear') return 'kayıt kaldırıldı'
  if (op.itemValues) return `${op.itemValues.filter(Boolean).length} madde`
  return `${op.value ?? 0}`
}
function describeInstance(i: Instance): string {
  if (i.status === 'COMPLETED' && i.snapshot.input_type === 'BOOLEAN') return 'yapıldı'
  if (i.status === 'MISSED_SELF') return 'yapılmadı'
  if (i.status === 'EXCUSED') return 'takip dışı'
  if (i.status === 'PENDING' || i.status === 'MISSED_AUTO') return 'kayıt yok'
  if (i.snapshot.input_type === 'CHECKLIST') return `${i.itemValues.filter(Boolean).length} madde`
  return `${i.value ?? 0}`
}

function DaySummaryLine({ summary }: { summary: Summary }) {
  if (summary.excusedAll) return <p className="font-semibold mb-2">Bugün takip dışı · kendi ritminde</p>
  if (summary.tracked === 0) return <p className="font-semibold mb-2">Bugün için planlı görev yok</p>
  return (
    <p className="font-semibold mb-2">
      Bugün {summary.completed}/{summary.tracked} görev · {pct(summary.grossXP, summary.plannedXP, 1)} · {summary.grossXP}/{summary.plannedXP} XP
      {summary.penaltyXP > 0 && <span className="text-warn"> · ceza −{summary.penaltyXP}</span>}
    </p>
  )
}

function ExcuseDayButton({ date, summary, onDone }: { date: string; summary: Summary; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false)
  if (summary.excusedAll || summary.state === 'FINALIZED') return null
  return (
    <>
      <button className="text-primary font-semibold underline min-h-[44px]" onClick={() => setConfirm(true)}>Bugün takip dışı</button>
      <Dialog open={confirm} title="Bugün takip dışı">
        <div className="space-y-3 text-left">
          <h3 className="text-lg font-bold">Bugünü takip dışı bırak</h3>
          <p className="text-[15px]">Bugünün tüm görevleri takip dışı olur. XP ve ceza yoktur; gün başarı hesabına girmez. Sebep sorulmaz.</p>
          <p className="text-[13px] text-ink-2">Bu seçim haftalık bilet koşullarını değiştirebilir.</p>
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setConfirm(false)}>Vazgeç</Button>
            <Button className="flex-1" onClick={async () => { try { await excuseDay(date); setConfirm(false); onDone() } catch (e) { toast(errorText(e)) } }}>Takip dışı bırak</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

export function DayEditor({ date, onChanged, submit }: { date: string; onChanged: () => void; submit: Submit }) {
  const [day, setDay] = useState<Awaited<ReturnType<typeof getDay>>>(undefined as unknown as null)
  const load = useCallback(() => getDay(date).then(setDay).catch(e => toast(errorText(e))), [date])
  useEffect(() => { void load() }, [load])
  if (day === undefined) return <Spinner />
  if (!day) return <p className="text-ink-2">Bu gün için kayıt yok.</p>
  return (
    <div>
      <p className="text-[15px] mb-2">{formatDateTR(date)} · {day.summary.grossXP}/{day.summary.plannedXP} XP</p>
      {!day.editable && <p className="text-[13px] text-warn mb-2">Bu gün kilitlendi; değiştirilemez.</p>}
      <TaskList instances={day.instances} editable={day.editable} dayState={day.summary.state} date={date} submit={submit} offline={false}
        onResult={r => { setDay(d => d ? { ...d, summary: r.summary ?? d.summary, instances: d.instances.map(i => i.id === r.instance.id ? r.instance : i) } : d); onChanged() }} />
    </div>
  )
}

function TaskList({ instances, editable, onResult, dayState, date, submit, offline }: { instances: Instance[]; editable: boolean; onResult: (r: RecordResult) => void; dayState: Summary['state']; date: string; submit: Submit; offline: boolean }) {
  const [active, setActive] = useState<Instance | null>(null)
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({})
  const busyRef = useRef(false)

  const groups = useMemo(() => {
    const byCat: Record<string, Array<Instance | { group: string; items: Instance[] }>> = {}
    for (const cat of CATEGORY_ORDER) byCat[cat] = []
    const grouped: Record<string, Instance[]> = {}
    for (const i of instances) {
      const g = i.snapshot.group_key
      if (g) { (grouped[g] ??= []).push(i); if (grouped[g].length === 1) byCat[i.snapshot.category].push({ group: g, items: grouped[g] }) }
      else byCat[i.snapshot.category].push(i)
    }
    return byCat
  }, [instances])

  const quick = async (inst: Instance, action: 'set_completed' | 'clear') => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const r = await submit(inst, date, action)
      onResult(r)
      if (action === 'set_completed' && !r.instance.pending) toast(`${inst.snapshot.name} · +${r.instance.earnedXP} XP`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT' && e.detail) { toast(errorText(e)); onResult({ instance: e.detail as Instance } as RecordResult) }
      else toast(errorText(e))
    } finally { busyRef.current = false }
  }

  const row = (i: Instance) => {
    const s = i.snapshot
    const isBool = s.input_type === 'BOOLEAN'
    const progress = s.input_type === 'NUMBER' || s.input_type === 'DURATION' ? `${i.value ?? 0}/${s.target} ${s.unit}`
      : s.input_type === 'TIME' ? (i.value !== null ? `${minutesToClock(i.value)} · hedef ${minutesToClock(s.target)}` : `en geç ${minutesToClock(s.target)}`)
      : s.input_type === 'CHECKLIST' ? `${i.itemValues.filter(Boolean).length}/${s.items.length}`
      : s.input_type === 'CHOICE3' ? (i.status === 'COMPLETED' ? 'Planıma uygun' : i.status === 'PARTIAL' ? 'Kısmen' : i.status === 'MISSED_SELF' ? 'Planıma uymadı' : 'Değerlendir')
      : STATUS_TEXT[i.status]
    return (
      <li key={i.id} className="flex items-center gap-3 py-2 border-b border-line last:border-b-0">
        <button
          className="tap flex items-center justify-center rounded-full"
          aria-label={`${s.name}: ${STATUS_TEXT[i.status]}${isBool && editable && i.status !== 'EXCUSED' ? '. Dokunarak değiştir' : ''}`}
          disabled={!editable || !isBool || i.status === 'EXCUSED'}
          onClick={() => void quick(i, i.status === 'COMPLETED' ? 'clear' : 'set_completed')}
        >
          <StatusRing status={i.status} />
        </button>
        <button className="flex-1 min-w-0 text-left min-h-[44px]" onClick={() => setActive(i)} aria-label={`${s.name}, ayrıntılar`}>
          <span className="block font-semibold truncate"><span aria-hidden="true">{s.icon}</span> {s.name}</span>
          <span className="block text-[13px] text-ink-2">{progress}{i.status === 'EXCUSED' ? ' · takip dışı' : i.status === 'MISSED_AUTO' ? ' · kayıt girilmedi' : ''}{i.pending ? ' · cihazda kaydedildi, gönderilmeyi bekliyor' : ''}</span>
        </button>
        <span className={`text-[15px] font-bold whitespace-nowrap ${i.earnedXP > 0 ? (i.pending ? 'text-ink-2' : 'text-success') : 'text-ink-2'}`}>{i.earnedXP}/{s.max_xp} XP{i.pending ? '*' : ''}</span>
      </li>
    )
  }

  return (
    <div>
      {CATEGORY_ORDER.map(cat => groups[cat].length === 0 ? null : (
        <section key={cat} className="mt-2">
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-2 mt-3 mb-1">{CATEGORY_LABEL[cat]}</h3>
          <ul>
            {groups[cat].map(entry => {
              if ('group' in entry) {
                const done = entry.items.filter(i => i.status === 'COMPLETED').length
                const xp = entry.items.reduce((s, i) => s + i.earnedXP, 0)
                const max = entry.items.reduce((s, i) => s + i.snapshot.max_xp, 0)
                const open = groupOpen[entry.group] ?? false
                return (
                  <li key={entry.group} className="border-b border-line last:border-b-0">
                    <button className="w-full flex items-center gap-3 py-2 min-h-[48px]" aria-expanded={open} onClick={() => setGroupOpen(g => ({ ...g, [entry.group]: !open }))}>
                      <StatusRing status={done === entry.items.length ? 'COMPLETED' : done > 0 ? 'PARTIAL' : 'PENDING'} />
                      <span className="flex-1 text-left font-semibold"><span aria-hidden="true">🕌</span> Namazlar · {done}/{entry.items.length}</span>
                      <span className={`text-[15px] font-bold ${xp > 0 ? 'text-success' : 'text-ink-2'}`}>{xp}/{max} XP</span>
                      <span aria-hidden="true" className="text-ink-2">{open ? '▴' : '▾'}</span>
                    </button>
                    {open && <ul className="pl-4">{entry.items.map(row)}</ul>}
                  </li>
                )
              }
              return row(entry)
            })}
          </ul>
        </section>
      ))}
      {offline && <p className="text-[13px] text-ink-2 mt-2">* Çevrimdışı önizleme; XP sunucu onayından sonra kesinleşir.</p>}
      <Sheet open={active !== null} onClose={() => setActive(null)} title={active?.snapshot.name ?? ''}>
        {active && <TaskSheet instance={instances.find(i => i.id === active.id) ?? active} editable={editable} dayState={dayState} date={date} submit={submit} offline={offline} onResult={r => { onResult(r); setActive(null) }} onClose={() => setActive(null)} />}
      </Sheet>
    </div>
  )
}

function TaskSheet({ instance, editable, dayState, date, submit, offline, onResult, onClose }: { instance: Instance; editable: boolean; dayState: Summary['state']; date: string; submit: Submit; offline: boolean; onResult: (r: RecordResult) => void; onClose: () => void }) {
  const s = instance.snapshot
  const [value, setValue] = useState<number>(instance.value ?? (s.input_type === 'TIME' ? s.target : 0))
  const [clock, setClock] = useState(minutesToClock(instance.value ?? s.target))
  const [items, setItems] = useState<boolean[]>(instance.itemValues.length === s.items.length ? instance.itemValues : s.items.map(() => false))
  const [note, setNote] = useState(instance.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const opId = useRef(crypto.randomUUID())

  const doneItems = items.filter(Boolean).length
  const previewStatus = s.input_type === 'CHECKLIST' ? statusForValue('CHECKLIST', s.target, 0, doneItems, s.items.length) : statusForValue(s.input_type, s.target, value)
  const preview = previewXP(s.input_type, s.max_xp, s.target, previewStatus, value, items, s.items.length)

  const send = async (action: TaskAction, extra: { value?: number; itemValues?: boolean[] } = {}) => {
    setBusy(true); setErr(null)
    try {
      const r = await submit(instance, date, action, { ...extra, note: note.trim() ? note.trim() : undefined, operationId: opId.current })
      opId.current = crypto.randomUUID()
      onResult(r)
      if (r.xpDelta !== 0) toast(`${s.name} · ${r.xpDelta > 0 ? '+' : ''}${r.xpDelta} XP`)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') { setErr('Bu kayıt başka bir cihazdan değiştirilmiş. Sunucudaki değer yüklendi; lütfen tekrar dene.'); onResult({ instance: e.detail as Instance } as RecordResult) }
      else setErr(errorText(e))
      opId.current = crypto.randomUUID()
    } finally { setBusy(false) }
  }

  const save = () => {
    if (s.input_type === 'TIME') { const m = clockToMinutes(clock); if (m === null) { setErr('Saat biçimi SS:DD olmalı.'); return } return send('set_value', { value: m }) }
    if (s.input_type === 'CHECKLIST') return send('set_value', { itemValues: items })
    if (s.input_type === 'NUMBER' || s.input_type === 'DURATION') {
      if (!Number.isInteger(value) || value < 0) { setErr('Tam sayı gir.'); return }
      if (value > s.target * 10) { setErr(`Hedefin 10 katından büyük olamaz (${s.target * 10}).`); return }
      return send('set_value', { value })
    }
    return undefined
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-ink-2">{s.description}</p>
      <p className="text-[15px]"><span className="font-semibold">Bugünkü hedef:</span> {s.input_type === 'TIME' ? `en geç ${minutesToClock(s.target)}` : s.input_type === 'BOOLEAN' ? 'tamamlandı beyanı' : s.input_type === 'CHOICE3' ? 'planına göre değerlendir' : s.input_type === 'CHECKLIST' ? `${s.items.length} madde` : `${s.target} ${s.unit}`} · {s.max_xp} XP</p>
      <p className="text-[15px]"><span className="font-semibold">Durum:</span> {STATUS_TEXT[instance.status]}{instance.earnedXP > 0 ? ` · ${instance.earnedXP} XP` : ''}{instance.pending ? ' · gönderilmeyi bekliyor' : ''}</p>
      {!editable && <p className="text-warn text-[15px]">Bu gün kilitlendi; değiştirilemez.</p>}

      {editable && (s.input_type === 'NUMBER' || s.input_type === 'DURATION') && (
        <div>
          <label className="font-semibold block mb-1">Gerçek değer ({s.unit})</label>
          <div className="flex gap-2 items-center">
            <Button type="button" variant="soft" aria-label="Azalt" onClick={() => setValue(v => Math.max(0, v - 1))}>−</Button>
            <input type="number" inputMode="numeric" className="input text-center" min={0} max={s.target * 10} value={value} onChange={e => setValue(Number(e.target.value))} />
            <Button type="button" variant="soft" aria-label="Artır" onClick={() => setValue(v => v + 1)}>+</Button>
          </div>
          <p className="text-[13px] text-ink-2 mt-1">Kazanılacak toplam: {preview} / {s.max_xp} XP</p>
        </div>
      )}
      {editable && s.input_type === 'TIME' && (
        <div>
          <label className="font-semibold block mb-1">Kalkış saati</label>
          <input type="time" className="input" value={clock} onChange={e => setClock(e.target.value)} />
          <p className="text-[13px] text-ink-2 mt-1">{(clockToMinutes(clock) ?? 9999) <= s.target ? `Kabul edilir · ${s.max_xp} XP` : 'Hedeften geç · 0 XP (kayıt yine tutulur)'}</p>
        </div>
      )}
      {editable && s.input_type === 'CHECKLIST' && (
        <fieldset>
          <legend className="font-semibold mb-1">Maddeler</legend>
          {s.items.map((it, i) => (
            <label key={i} className="flex items-center gap-2 min-h-[44px] text-[15px]">
              <input type="checkbox" className="w-5 h-5" checked={items[i] ?? false} onChange={e => setItems(arr => arr.map((v, j) => j === i ? e.target.checked : v))} />
              {it}
            </label>
          ))}
          <p className="text-[13px] text-ink-2 mt-1">Kazanılacak toplam: {preview} / {s.max_xp} XP</p>
        </fieldset>
      )}
      {editable && s.input_type === 'CHOICE3' && (
        <div className="grid grid-cols-1 gap-2">
          <Button variant={instance.status === 'COMPLETED' ? 'primary' : 'soft'} disabled={busy} onClick={() => void send('set_value', { value: 2 })}>Planıma uygun · {s.max_xp} XP</Button>
          <Button variant={instance.status === 'PARTIAL' ? 'primary' : 'soft'} disabled={busy} onClick={() => void send('set_value', { value: 1 })}>Kısmen · {Math.floor(s.max_xp / 2)} XP</Button>
          <Button variant={instance.status === 'MISSED_SELF' ? 'primary' : 'soft'} disabled={busy} onClick={() => void send('set_value', { value: 0 })}>Planıma uymadı · 0 XP</Button>
        </div>
      )}
      {editable && s.input_type === 'BOOLEAN' && (
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => void send('set_completed')}>Yapıldı · {s.max_xp} XP</Button>
          <Button variant="soft" disabled={busy} onClick={() => void send('set_not_done')}>Yapılmadı</Button>
        </div>
      )}

      {editable && !offline && (
        <label className="block">
          <span className="font-semibold">Özel not (isteğe bağlı)</span>
          <textarea className="input py-2 min-h-[64px]" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          <span className="text-[13px] text-ink-2">Notlar yalnızca sana görünür; paylaşılmaz ve çevrimdışı kopyaya alınmaz.</span>
        </label>
      )}
      {err && <p className="text-warn" role="alert">{err}</p>}

      {editable && (
        <div className="space-y-2">
          {(s.input_type === 'NUMBER' || s.input_type === 'DURATION' || s.input_type === 'TIME' || s.input_type === 'CHECKLIST') && (
            <Button className="w-full" disabled={busy} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</Button>
          )}
          <div className="grid grid-cols-3 gap-2">
            {s.input_type !== 'BOOLEAN' && s.input_type !== 'CHOICE3' && <Button variant="soft" disabled={busy} onClick={() => void send('set_not_done')}>Yapılmadı</Button>}
            <Button variant="soft" disabled={busy || instance.status === 'EXCUSED'} onClick={() => void send('set_excused')}>Bugün takip dışı</Button>
            <Button variant="ghost" disabled={busy || instance.status === 'PENDING'} onClick={() => void send('clear')}>{dayState === 'OPEN' ? 'Kaydı kaldır' : 'Kaydı sil'}</Button>
          </div>
          {instance.status !== 'EXCUSED' && <p className="text-[13px] text-ink-2">Takip dışı: XP ve ceza yok; görev bugünün hesabına girmez. Bu seçim haftalık bilet koşullarını değiştirebilir.</p>}
        </div>
      )}
      {!editable && <Button variant="soft" className="w-full" onClick={onClose}>Kapat</Button>}
    </div>
  )
}
