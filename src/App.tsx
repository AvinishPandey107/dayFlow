import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, useData, parseQuick, fmt, sameDay, DAY, bump, type Task, type Ev, type M } from './lib'

const PR = ['Low', 'Medium', 'High', 'Urgent']
const DOT = ['bg-slate-400', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500']
const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ')
const sod = (d: Date | number | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const loc = (s: string | null) => s ? new Date(+new Date(s) - new Date(s).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''
const iso = (v: string) => v ? new Date(v).toISOString() : null
/** Android Chrome only allows notifications through the service worker. */
const notify = async (title: string, body: string) => {
  try { const r = await navigator.serviceWorker?.ready; if (r) r.showNotification(title, { body, icon: '/icon-192.png' }); else new Notification(title, { body }) } catch { /* unsupported */ }
}
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
/** Days of a multi-day task (start day..deadline day). Empty for single-day or very long (>31 days) tasks. */
function planDays(t: Task): Date[] {
  if (!t.start_at || !t.due_at) return []
  const s = sod(t.start_at), e = sod(t.due_at), out: Date[] = []
  if (+s === +e) return []
  for (let d = new Date(s); +d <= +e && out.length < 32; d.setDate(d.getDate() + 1)) out.push(new Date(d))
  return out.length > 31 ? [] : out
}
const btn = 'rounded-xl bg-accent px-4 py-2.5 font-medium text-white dark:text-slate-900'
const inp = 'w-full rounded-xl border border-line bg-card px-3 py-2.5 outline-none focus:border-accent'
type P = { tasks: Task[]; events: Ev[]; m: M; onEdit: (t: Task) => void; seed: () => void }

export default function App() {
  const [s, setS] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(r => setS(r.data.session))
    const { data } = supabase.auth.onAuthStateChange((_, x) => setS(x))
    return () => data.subscription.unsubscribe()
  }, [])
  if (s === undefined) return <p className="p-10 text-mute">Loading…</p>
  return s ? <Main uid={s.user.id} /> : <Auth />
}

function Auth() {
  const [email, setE] = useState(''), [pw, setP] = useState(''), [up, setUp] = useState(false), [msg, setM] = useState('')
  const go = async () => {
    setM('')
    const r = up ? await supabase.auth.signUp({ email, password: pw }) : await supabase.auth.signInWithPassword({ email, password: pw })
    if (r.error) setM(r.error.message); else if (up && !r.data.session) setM('Check your email to confirm your account, then sign in.')
  }
  return <div className="grid min-h-dvh place-items-center p-6"><div className="w-full max-w-sm space-y-3">
    <h1 className="text-3xl font-semibold tracking-tight">DayFlow</h1>
    <p className="text-mute">Your tasks and calendar, on every device.</p>
    <input className={inp} type="email" placeholder="Email" value={email} onChange={e => setE(e.target.value)} />
    <input className={inp} type="password" placeholder="Password (6+ characters)" value={pw} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
    <button className={cx(btn, 'w-full')} onClick={go}>{up ? 'Create account' : 'Sign in'}</button>
    {msg && <p className="text-sm text-rose-500">{msg}</p>}
    <button className="text-sm text-mute" onClick={() => setUp(!up)}>{up ? 'Have an account? Sign in' : 'New here? Create an account'}</button>
  </div></div>
}

function Main({ uid }: { uid: string }) {
  const { tasks, events, loading, err, pending, mutate } = useData(uid)
  const [view, setView] = useState<'today' | 'tasks' | 'calendar' | 'focus'>('today')
  const [edit, setEdit] = useState<Task | null>(null)
  const [dark, setDark] = useState(() => localStorage.df_dark ? localStorage.df_dark === '1' : matchMedia('(prefers-color-scheme: dark)').matches)
  const qa = useRef<HTMLInputElement>(null)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.df_dark = dark ? '1' : '0' }, [dark])
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      if ((e.key === 'q' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); qa.current?.focus() }
    }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [])

  useEffect(() => {  // reminders: fire while DayFlow is open (installed app or tab)
    const id = setInterval(() => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const sent: string[] = JSON.parse(localStorage.df_sent || '[]')
      tasks.forEach(t => {
        if (t.done || !t.due_at || t.remind_minutes == null) return
        const at = +new Date(t.due_at) - t.remind_minutes * 6e4, key = t.id + at
        if (at <= Date.now() && at > Date.now() - 36e5 && !sent.includes(key)) { notify(t.title, 'Due ' + fmt(t.due_at)); sent.push(key) }
      })
      localStorage.df_sent = JSON.stringify(sent.slice(-200))
    }, 30000)
    return () => clearInterval(id)
  }, [tasks])

  // Google Calendar (talks to the google-sync Edge Function; secrets never reach the browser)
  const [gc, setGc] = useState<'off' | 'on'>('off'), [gmsg, setGmsg] = useState('')
  const gcOn = useRef(false), tm = useRef(0)
  const call = async (body: object) => {
    const { data, error } = await supabase.functions.invoke('google-sync', { body: { ...body, tz: new Date().getTimezoneOffset() } })
    if (error || data?.error) throw new Error(error?.message || data.error)
    return data
  }
  const sync = async (manual = false) => {
    if (manual) setGmsg('Syncing with Google Calendar…')
    try { const r = await call({ action: 'sync' }); setGmsg(manual ? `Google Calendar synced (${r.pulled} events checked).` : '') } catch (e) { setGmsg('Google Calendar: ' + (e as Error).message) }
  }
  const connect = () => {
    const id = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!id) { setGmsg('Set VITE_GOOGLE_CLIENT_ID first (see README).'); return }
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: id, redirect_uri: location.origin, response_type: 'code', scope: 'https://www.googleapis.com/auth/calendar.events', access_type: 'offline', prompt: 'consent', state: 'gcal' })
  }
  const disconnect = async () => { try { await call({ action: 'disconnect' }); gcOn.current = false; setGc('off'); setGmsg('Google Calendar disconnected.') } catch (e) { setGmsg((e as Error).message) } }
  useEffect(() => {
    const q = new URLSearchParams(location.search), code = q.get('code')
    ;(async () => {
      try {
        if (code && q.get('state') === 'gcal') {
          history.replaceState({}, '', '/'); setGmsg('Connecting Google Calendar…')
          await call({ action: 'connect', code, redirect_uri: location.origin }); gcOn.current = true; setGc('on'); await sync(true)
        } else { const r = await call({ action: 'status' }); if (r.connected) { gcOn.current = true; setGc('on'); sync() } }
      } catch (e) { if (code) setGmsg('Google Calendar: ' + (e as Error).message) }
    })()
    const iv = setInterval(() => { if (gcOn.current) sync() }, 300000)
    return () => clearInterval(iv)
  }, [])
  const m: M = (...a) => { mutate(...a); if (gcOn.current) { clearTimeout(tm.current); tm.current = window.setTimeout(() => sync(), 8000) } }

  const quick = (e: KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value.trim(); if (e.key !== 'Enter' || !v) return
    const p = parseQuick(v)
    m('tasks', 'ins', crypto.randomUUID(), { title: p.title, notes: '', done: false, priority: p.priority, due_at: p.due?.toISOString() ?? null, start_at: null, all_day: false, tags: [], position: Date.now() })
    e.currentTarget.value = ''
  }
  const seed = () => {
    const b = +sod(Date.now()), t = (n: number, h: number) => new Date(b + n * DAY + h * 36e5).toISOString()
    const S: [string, string | null, string, number, number][] = [['Complete Java assignment', t(1, 10), t(3, 20), 3, 180], ['Read chapter 4', null, t(0, 18), 1, 45], ['Buy groceries', null, t(1, 17), 0, 30], ['Email professor', null, t(-1, 12), 2, 10]]
    S.forEach(([title, s, d, pr, est], i) => m('tasks', 'ins', crypto.randomUUID(), { title, notes: '', done: false, start_at: s, due_at: d, all_day: false, priority: pr, est_minutes: est, tags: ['sample'], position: Date.now() + i }))
  }
  const exp = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ tasks, events }, null, 2)], { type: 'application/json' })); a.download = 'dayflow-backup.json'; a.click() }
  const nav = [['today', 'Today', '◉'], ['tasks', 'Tasks', '☰'], ['calendar', 'Calendar', '▦'], ['focus', 'Focus', '◎']] as const
  const tool = 'rounded-lg px-3 py-2 text-left hover:bg-card'
  const tools = <div className="flex flex-col text-sm text-mute">
    <button className={tool} onClick={() => setDark(!dark)}>{dark ? 'Light mode' : 'Dark mode'}</button>
    <button className={tool} onClick={seed}>Add sample tasks</button>
    <button className={tool} onClick={() => tasks.filter(t => t.tags.includes('sample')).forEach(t => m('tasks', 'del', t.id))}>Remove sample tasks</button>
    {'Notification' in window && Notification.permission !== 'granted' && <button className={tool} onClick={() => Notification.requestPermission().then(p => setGmsg(p === 'granted' ? 'Notifications enabled.' : 'Notifications are blocked in your browser settings.'))}>Enable notifications</button>}
    <button className={tool} onClick={gc === 'off' ? connect : () => sync(true)}>{gc === 'off' ? 'Connect Google Calendar' : 'Sync Google Calendar now'}</button>
    {gc === 'on' && <button className={tool} onClick={disconnect}>Disconnect Google</button>}
    <button className={tool} onClick={exp}>Export backup</button>
    <button className={tool} onClick={() => supabase.auth.signOut()}>Sign out</button>
  </div>
  const pp: P = { tasks, events, m, onEdit: setEdit, seed }

  return <div className="min-h-dvh md:flex">
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">DayFlow</h1>
      {nav.map(([k, l]) => <button key={k} onClick={() => setView(k)} className={cx('rounded-lg px-3 py-2 text-left', view === k ? 'bg-card font-medium shadow-sm' : 'text-mute')}>{l}</button>)}
      <div className="mt-auto">{tools}</div>
    </aside>
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-40 pt-6 md:pb-10">
      {gmsg && <p className="mb-3 rounded-lg bg-accent/10 px-3 py-2 text-sm">{gmsg}</p>}{(err || pending > 0) && <p className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm">{err} {pending > 0 && `${pending} change(s) waiting to sync.`}</p>}
      <div className="fixed inset-x-3 bottom-[4.75rem] z-10 md:static md:mb-6">
        <input ref={qa} onKeyDown={quick} className={cx(inp, 'shadow-lg md:shadow-none')} placeholder='Add a task, e.g. "Submit assignment tomorrow at 5pm !high"  (press q)' />
      </div>
      {loading ? <p className="text-mute">Loading…</p> : view === 'today' ? <Today {...pp} /> : view === 'tasks' ? <Tasks {...pp} /> : view === 'focus' ? <Focus {...pp} /> : <Calendar {...pp} />}
      <div className="mt-10 md:hidden">{tools}</div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {nav.map(([k, l, i]) => <button key={k} onClick={() => setView(k)} className={cx('flex-1 py-2.5 text-xs', view === k ? 'font-medium text-accent' : 'text-mute')}><div className="text-lg">{i}</div>{l}</button>)}
    </nav>
    {edit && <Edit t={edit} m={m} close={() => setEdit(null)} />}
  </div>
}

/** Complete/undo. Completing a repeating task creates the next occurrence. */
function toggle(t: Task, m: M) {
  m('tasks', 'upd', t.id, { done: !t.done, completed_at: t.done ? null : new Date().toISOString(), ...(!t.done && t.recur ? { recur: null } : {}) })
  if (!t.done && t.recur && t.due_at) {
    const n = t.recur_every ?? 1
    m('tasks', 'ins', crypto.randomUUID(), { title: t.title, notes: t.notes, done: false, start_at: t.start_at ? bump(t.start_at, t.recur, n) : null, due_at: bump(t.due_at, t.recur, n), all_day: t.all_day, priority: t.priority, est_minutes: t.est_minutes, tags: t.tags, recur: t.recur, recur_every: n, checklist: (t.checklist ?? []).map(c => ({ ...c, d: false })), position: Date.now() })
  }
}

function Row({ t, m, onEdit }: { t: Task; m: M; onEdit: (t: Task) => void }) {
  const due = t.due_at ? +new Date(t.due_at) : 0, st = t.start_at ? +new Date(t.start_at) : 0, now = Date.now()
  const over = !t.done && due && due < now
  const pct = st && due > st ? Math.min(100, Math.max(0, (now - st) / (due - st) * 100)) : null
  return <div className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3">
    <button aria-label={t.done ? 'Mark as not done' : 'Mark as done'} onClick={() => toggle(t, m)}
      className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors', t.done ? 'border-accent bg-accent text-white dark:text-slate-900' : 'border-mute')}>{t.done && '✓'}</button>
    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(t)}>
      <div className={cx('font-medium', t.done && 'text-mute line-through')}>{t.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
        <i className={cx('size-2 rounded-full', DOT[t.priority])} title={PR[t.priority]} />
        {t.start_at && t.due_at ? `${fmt(t.start_at)} → ${fmt(t.due_at)}` : t.due_at ? `Due ${fmt(t.due_at)}` : 'No deadline'}
        {t.est_minutes ? <span>{t.est_minutes >= 60 ? `${+(t.est_minutes / 60).toFixed(1)} h` : `${t.est_minutes} min`}</span> : null}
        {t.tags.map(g => <span key={g}>#{g}</span>)}{t.recur && <span>↻ {t.recur}</span>}{t.checklist?.length ? <span>{t.checklist.filter(c => c.d).length}/{t.checklist.length} items</span> : null}
        {over && <span className="font-medium text-rose-500">Overdue</span>}
      </div>
      {!t.done && planDays(t).length > 0 && <Plan t={t} m={m} />}{pct !== null && !t.done && planDays(t).length === 0 && <div className="mt-2 h-1.5 rounded-full bg-line"><div className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-accent')} style={{ width: pct + '%' }} /></div>}
    </div>
  </div>
}

const Empty = ({ seed }: { seed: () => void }) => <div className="rounded-2xl border border-dashed border-line p-10 text-center">
  <p className="font-medium">No tasks yet</p><p className="mt-1 text-sm text-mute">Type above and press Enter, or try the examples.</p>
  <button className={cx(btn, 'mt-4')} onClick={seed}>Add sample tasks</button></div>

function Today({ tasks, events, m, onEdit, seed }: P) {
  const now = new Date(), t0 = +sod(now), t1 = t0 + DAY, t2 = t1 + DAY, t9 = t1 + 7 * DAY
  const d = (t: Task) => t.due_at ? +new Date(t.due_at) : null
  const act = (t: Task) => planDays(t).some(x => +x === t0)
  const planAll = tasks.filter(act), tk = ymd(new Date(t0))
  const todays = tasks.filter(t => { const x = d(t); return x !== null && x >= t0 && x < t1 && !act(t) })
  const over = tasks.filter(t => !t.done && (d(t) ?? Infinity) < t0)
  const tom = tasks.filter(t => !t.done && !act(t) && (d(t) ?? 0) >= t1 && (d(t) ?? 0) < t2)
  const soon = tasks.filter(t => !t.done && !act(t) && (d(t) ?? 0) >= t2 && (d(t) ?? 0) < t9)
  const items = todays.length + planAll.length, done = todays.filter(t => t.done).length + planAll.filter(t => t.done || t.day_done?.[tk]).length, pct = items ? Math.round(done / items * 100) : 0
  const per = (t: Task) => { const ds = planDays(t); if (!t.est_minutes) return 0; if (!ds.length) return t.est_minutes; return t.est_minutes / ds.length * ds.filter(x => +x <= t0 && !t.day_done?.[ymd(x)]).length }
  const mins = [...todays, ...planAll].filter(t => !t.done).reduce((a, t) => a + per(t), 0)
  const active = new Set<string>(); tasks.forEach(t => { if (t.completed_at) active.add(ymd(new Date(t.completed_at))); Object.keys(t.day_done ?? {}).forEach(k => active.add(k)) })
  let streak = 0; const c = new Date(t0); if (!active.has(ymd(c))) c.setDate(c.getDate() - 1); while (active.has(ymd(c))) { streak++; c.setDate(c.getDate() - 1) }
  const week = tasks.filter(t => t.completed_at && +new Date(t.completed_at) > Date.now() - 7 * DAY).length
  const evs = events.filter(e => sameDay(new Date(e.start_at), now))
  const sec = (title: string, list: Task[]) => list.length ? <section className="mt-6"><h2 className="mb-2 font-medium">{title}</h2><div className="space-y-2">{list.map(t => <Row key={t.id} t={t} m={m} onEdit={onEdit} />)}</div></section> : null
  const shift = (t: Task, delta: number) => m('tasks', 'upd', t.id, { due_at: new Date(+new Date(t.due_at!) + delta).toISOString(), ...(t.start_at ? { start_at: new Date(+new Date(t.start_at) + delta).toISOString() } : {}) })
  if (!tasks.length && !events.length) return <Empty seed={seed} />
  return <div>
    <h2 className="text-2xl font-semibold tracking-tight">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
    <div className="mt-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex justify-between text-sm"><span>{done} of {items} of today's work done</span><span className="text-mute">{pct}%</span></div>
      <div className="mt-2 h-2 rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: pct + '%' }} /></div>
      <p className="mt-3 text-sm text-mute">{week} task{week === 1 ? '' : 's'} completed in the last 7 days</p>
      <p className="mt-1 text-sm text-mute">{streak > 0 ? `${streak}-day streak` : 'No streak yet. Tick off something today.'}{mins > 0 && `. About ${mins >= 60 ? `${(mins / 60).toFixed(1)} h` : `${Math.round(mins)} min`} of planned work left today.`}</p>
    </div>
    {(over.length > 0 || todays.some(t => !t.done)) && <div className="mt-3 flex flex-wrap gap-2 text-sm">
      {over.length > 0 && <button className="rounded-full border border-line bg-card px-3 py-1.5" onClick={() => over.forEach(t => shift(t, t0 - +sod(t.due_at!)))}>Move {over.length} overdue to today</button>}
      {todays.some(t => !t.done) && <button className="rounded-full border border-line bg-card px-3 py-1.5" onClick={() => todays.filter(t => !t.done).forEach(t => shift(t, DAY))}>Move unfinished to tomorrow</button>}
    </div>}
    {sec('Overdue', over)}{sec("Today's work", planAll.filter(t => !t.done))}{sec('Today', todays)}
    {evs.length > 0 && <section className="mt-6"><h2 className="mb-2 font-medium">Events today</h2>{evs.map(e => <div key={e.id} className="mb-2 rounded-2xl border border-accent/40 bg-card p-3 text-sm">{e.title} <span className="text-mute">{e.all_day ? 'All day' : fmt(e.start_at)}</span></div>)}</section>}
    {sec('Tomorrow', tom)}{sec('Next 7 days', soon)}
  </div>
}

function Tasks({ tasks, m, onEdit, seed }: P) {
  const [tab, setTab] = useState<'open' | 'done'>('open'), [q, setQ] = useState(''), [sort, setSort] = useState<'due' | 'pri' | 'new'>('due')
  const dd = (t: Task) => +new Date(t.due_at ?? 8.64e15)
  const list = useMemo(() => tasks.filter(t => !t.archived && t.done === (tab === 'done') && (t.title + (t.notes ?? '') + t.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'due' ? dd(a) - dd(b) : sort === 'pri' ? b.priority - a.priority : b.position - a.position), [tasks, tab, q, sort])
  if (!tasks.length) return <Empty seed={seed} />
  return <div className="space-y-3">
    <div className="flex gap-2">
      {(['open', 'done'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={cx('rounded-full px-4 py-1.5 text-sm', tab === k ? 'bg-accent text-white dark:text-slate-900' : 'bg-card text-mute')}>{k === 'open' ? 'Pending' : 'Completed'}</button>)}
      <select className="ml-auto rounded-lg border border-line bg-card px-2 text-sm" value={sort} onChange={e => setSort(e.target.value as 'due')}><option value="due">By deadline</option><option value="pri">By priority</option><option value="new">Newest</option></select>
    </div>
    {tab === 'done' && list.length > 0 && <button className="text-sm text-accent" onClick={() => list.forEach(t => m('tasks', 'upd', t.id, { archived: true }))}>Archive {list.length} completed</button>}
    <input className={inp} placeholder="Search tasks, notes, tags" value={q} onChange={e => setQ(e.target.value)} />
    {list.length ? list.map(t => <Row key={t.id} t={t} m={m} onEdit={onEdit} />) : <p className="py-8 text-center text-mute">{q ? 'No tasks match your search.' : tab === 'open' ? 'All caught up.' : 'Nothing completed yet.'}</p>}
  </div>
}

function Calendar({ tasks, events, m, onEdit }: P) {
  const [cur, setCur] = useState(() => { const d = sod(Date.now()); d.setDate(1); return d })
  const [sel, setSel] = useState(sod(Date.now())), [title, setTitle] = useState(''), [time, setTime] = useState('')
  const first = new Date(cur); first.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i))
  const on = (d: Date) => ({
    t: tasks.filter(t => { if (!t.due_at) return false; const e = +sod(t.due_at), s = t.start_at ? +sod(t.start_at) : e; return +d >= s && +d <= e }),
    e: events.filter(x => sameDay(new Date(x.start_at), d)),
  })
  const drop = (e: DragEvent, d: Date) => {
    const t = tasks.find(x => x.id === e.dataTransfer.getData('id')); if (!t?.due_at) return
    const delta = +d - +e.dataTransfer.getData('from'), sh = (s: string) => new Date(+new Date(s) + delta).toISOString()
    m('tasks', 'upd', t.id, { due_at: sh(t.due_at), ...(t.start_at ? { start_at: sh(t.start_at) } : {}) })
  }
  const at = () => { const d = new Date(sel), [h, mi] = (time || '23:59').split(':'); d.setHours(+h, +mi, 0, 0); return d }
  const addTask = () => { if (!title.trim()) return; m('tasks', 'ins', crypto.randomUUID(), { title: title.trim(), notes: '', done: false, priority: 1, due_at: at().toISOString(), start_at: null, all_day: !time, tags: [], position: Date.now() }); setTitle('') }
  const addEv = () => { if (!title.trim()) return; const s = at(); m('events', 'ins', crypto.randomUUID(), { title: title.trim(), notes: '', start_at: s.toISOString(), end_at: new Date(+s + 36e5).toISOString(), all_day: !time }); setTitle('') }
  const day = on(sel)
  const [mode, setMode] = useState<'month' | 'week' | 'day' | 'agenda'>('month')
  const wk = Array.from({ length: 7 }, (_, i) => { const d = sod(sel); d.setDate(d.getDate() - d.getDay() + i); return d })
  const step = (n: number) => {
    if (mode === 'month') { setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1)); return }
    const d = new Date(sel); d.setDate(d.getDate() + n * (mode === 'week' ? 7 : 1)); setSel(d); setCur(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  return <div>
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl font-semibold">{(mode === 'month' ? cur : sel).toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
      <div className="flex gap-1">{[['‹', -1], ['›', 1]].map(([l, n]) => <button key={l} aria-label={n === -1 ? 'Previous' : 'Next'} className="size-9 rounded-lg bg-card" onClick={() => step(+n)}>{l}</button>)}
        <button className="rounded-lg bg-card px-3 text-sm" onClick={() => { const d = sod(Date.now()); setSel(d); setCur(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Today</button></div>
    </div>
    <div className="mb-3 flex gap-1 rounded-xl bg-card p-1 text-sm">{(['month', 'week', 'day', 'agenda'] as const).map(k => <button key={k} onClick={() => setMode(k)} className={cx('flex-1 rounded-lg py-1.5 capitalize', mode === k ? 'bg-accent text-white dark:text-slate-900' : 'text-mute')}>{k}</button>)}</div>
    <div className={cx('grid grid-cols-7 pb-1 text-center text-xs text-mute', (mode === 'day' || mode === 'agenda') && 'hidden')}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i}>{x}</span>)}</div>
    <div className={cx('grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line', (mode === 'day' || mode === 'agenda') && 'hidden')}>
      {(mode === 'week' ? wk : days).map(d => { const x = on(d), n = x.t.length + x.e.length
        return <div key={+d} onClick={() => setSel(d)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, d)}
          className={cx(mode === 'week' ? 'min-h-24 sm:min-h-44' : 'min-h-14 sm:min-h-24', 'bg-card p-1 text-xs', mode === 'month' && d.getMonth() !== cur.getMonth() && 'opacity-40', sameDay(d, sel) && 'ring-2 ring-inset ring-accent')}>
          <span className={cx('grid size-6 place-items-center rounded-full', sameDay(d, new Date()) && 'bg-accent text-white dark:text-slate-900')}>{d.getDate()}</span>
          <div className="mt-1 hidden space-y-0.5 sm:block">
            {x.t.slice(0, 3).map(t => <div key={t.id} draggable onDragStart={e => { e.dataTransfer.setData('id', t.id); e.dataTransfer.setData('from', String(+d)) }} className={cx('cursor-grab truncate rounded px-1 text-white', DOT[t.priority], t.done && 'line-through opacity-40')}>{t.title}</div>)}
            {x.e.slice(0, 2).map(v => <div key={v.id} className="truncate rounded border border-accent px-1 text-accent">{v.title}</div>)}
            {n > 5 && <div className="text-mute">+{n - 5} more</div>}
          </div>
          <div className="mt-1 flex gap-0.5 sm:hidden">{Array.from({ length: Math.min(3, n) }, (_, i) => <i key={i} className="size-1.5 rounded-full bg-accent" />)}</div>
        </div> })}
    </div>
    {mode === 'agenda' && <div className="space-y-4">{Array.from({ length: 30 }, (_, i) => { const b = new Date(), d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + i), x = on(d), ts = x.t.filter(t => !t.done); return ts.length + x.e.length ? <section key={i}><h3 className="mb-2 text-sm font-medium text-mute">{i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</h3><div className="space-y-2">{x.e.map(v => <div key={v.id} className="rounded-2xl border border-accent/40 bg-card p-3 text-sm">{v.title} <span className="text-mute">{v.all_day ? 'All day' : fmt(v.start_at)}</span></div>)}{ts.map(t => <Row key={t.id} t={t} m={m} onEdit={onEdit} />)}</div></section> : null })}</div>}
    <section className={cx('mt-5 space-y-2', mode === 'agenda' && 'hidden')}>
      <h3 className="font-medium">{sel.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
      <div className="flex gap-2"><input className={inp} placeholder="Add to this day" value={title} onChange={e => setTitle(e.target.value)} /><input className={cx(inp, 'w-32')} type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
      <div className="flex gap-2"><button className={btn} onClick={addTask}>Add task</button><button className="rounded-xl border border-line bg-card px-4 py-2.5" onClick={addEv}>Add event</button></div>
      {day.e.map(v => <div key={v.id} className="flex items-center justify-between rounded-2xl border border-accent/40 bg-card p-3 text-sm"><span>{v.title} <span className="text-mute">{v.all_day ? 'All day' : fmt(v.start_at)}</span></span><button aria-label="Delete event" className="px-2 text-mute" onClick={() => m('events', 'del', v.id)}>✕</button></div>)}
      {day.t.map(t => <Row key={t.id} t={t} m={m} onEdit={onEdit} />)}
      {!day.e.length && !day.t.length && <p className="text-sm text-mute">Nothing scheduled.</p>}
    </section>
  </div>
}

function Edit({ t, m, close }: { t: Task; m: M; close: () => void }) {
  const [f, setF] = useState({ title: t.title, notes: t.notes ?? '', start: loc(t.start_at), due: loc(t.due_at), pr: t.priority, est: t.est_minutes ?? '' as number | '', tags: t.tags.join(', '), recur: t.recur ?? '', every: t.recur_every ?? 1, remind: t.remind_minutes ?? '' as number | '', list: t.checklist ?? [] as { t: string; d: boolean }[] })
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })
  const save = () => { m('tasks', 'upd', t.id, { title: f.title.trim() || t.title, notes: f.notes, start_at: iso(f.start), due_at: iso(f.due), priority: +f.pr, est_minutes: f.est === '' ? null : +f.est, tags: f.tags.split(',').map(s => s.trim()).filter(Boolean), recur: f.recur || null, recur_every: +f.every || 1, remind_minutes: f.remind === '' ? null : +f.remind, checklist: f.list }); if (f.remind !== '' && 'Notification' in window) Notification.requestPermission(); close() }
  const dup = () => { m('tasks', 'ins', crypto.randomUUID(), { title: t.title + ' (copy)', notes: t.notes, done: false, start_at: t.start_at, due_at: t.due_at, all_day: t.all_day, priority: t.priority, est_minutes: t.est_minutes, tags: t.tags, position: Date.now() }); close() }
  const lab = 'block text-xs text-mute'
  return <div className="fixed inset-0 z-20 grid place-items-end bg-black/40 sm:place-items-center" onClick={close}>
    <div className="max-h-dvh w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-bg p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
      <input className={inp} value={f.title} onChange={e => set('title', e.target.value)} aria-label="Title" />
      <textarea className={inp} rows={3} placeholder="Notes" value={f.notes} onChange={e => set('notes', e.target.value)} />
      <p className="text-xs text-mute">Pick a start and a deadline on different days to get a day-by-day plan with progress.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className={lab}>Start<input className={inp} type="datetime-local" value={f.start} onChange={e => set('start', e.target.value)} /></label>
        <label className={lab}>Deadline<input className={inp} type="datetime-local" value={f.due} onChange={e => set('due', e.target.value)} /></label>
        <label className={lab}>Priority<select className={inp} value={f.pr} onChange={e => set('pr', e.target.value)}>{PR.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></label>
        <label className={lab}>Estimate (minutes)<input className={inp} type="number" min={0} value={f.est} onChange={e => set('est', e.target.value === '' ? '' : +e.target.value)} /></label>
      </div>
      <label className={lab}>Tags (comma separated)<input className={inp} value={f.tags} onChange={e => set('tags', e.target.value)} /></label>
      <div className="grid grid-cols-3 gap-2">
        <label className={lab}>Repeat<select className={inp} value={f.recur} onChange={e => set('recur', e.target.value)}><option value="">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label className={lab}>Every<input className={inp} type="number" min={1} value={f.every} onChange={e => set('every', e.target.value)} /></label>
        <label className={lab}>Remind<select className={inp} value={f.remind} onChange={e => set('remind', e.target.value)}><option value="">None</option><option value={0}>At deadline</option><option value={10}>10 min before</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option></select></label>
      </div>
      <div className="space-y-1"><span className={lab}>Checklist</span>
        {f.list.map((c, i) => <div key={i} className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={c.d} onChange={() => set('list', f.list.map((x, j) => j === i ? { ...x, d: !x.d } : x))} /><span className={cx('flex-1 text-sm', c.d && 'text-mute line-through')}>{c.t}</span><button aria-label="Remove item" className="px-2 text-mute" onClick={() => set('list', f.list.filter((_, j) => j !== i))}>✕</button></div>)}
        <input className={inp} placeholder="Add item, press Enter" onKeyDown={e => { const v = e.currentTarget.value.trim(); if (e.key === 'Enter' && v) { set('list', [...f.list, { t: v, d: false }]); e.currentTarget.value = '' } }} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1"><button className={btn} onClick={save}>Save</button><button className="rounded-xl border border-line px-4 py-2.5" onClick={dup}>Duplicate</button>
        <button className="ml-auto rounded-xl px-4 py-2.5 text-rose-500" onClick={() => { m('tasks', 'del', t.id); close() }}>Delete</button></div>
    </div></div>
}

function Focus({ tasks, m }: P) {
  const open = tasks.filter(t => !t.done).sort((a, b) => +new Date(a.due_at ?? 8.64e15) - +new Date(b.due_at ?? 8.64e15))
  const [id, setId] = useState(''), [mode, setMode] = useState<'work' | 'break'>('work'), [rest, setRest] = useState(25 * 60), [end, setEnd] = useState<number | null>(null), [, tick] = useState(0)
  const t = open.find(x => x.id === id) ?? open[0]
  const left = end ? Math.max(0, Math.round((end - Date.now()) / 1000)) : rest
  const len = (md: string) => (md === 'work' ? 25 : 5) * 60
  useEffect(() => { if (!end) return; const i = setInterval(() => tick(x => x + 1), 500); return () => clearInterval(i) }, [end])
  useEffect(() => {
    if (!end || left > 0) return
    if (mode === 'work' && t) m('tasks', 'upd', t.id, { spent_minutes: (t.spent_minutes ?? 0) + 25 })
    const next = mode === 'work' ? 'break' : 'work'; setEnd(null); setMode(next); setRest(len(next))
    if ('Notification' in window && Notification.permission === 'granted') notify(next === 'break' ? 'Break time' : 'Back to focus', 'DayFlow')
  }, [left, end])
  if (!t) return <p className="py-16 text-center text-mute">Nothing to focus on. Add a task above.</p>
  const ghost = 'rounded-xl border border-line px-4 py-2.5'
  return <div className="mx-auto max-w-sm py-8 text-center">
    <select className={inp} value={t.id} onChange={e => setId(e.target.value)}>{open.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
    <div className="mt-8 text-7xl font-semibold tabular-nums">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</div>
    <p className="mt-2 text-mute">{mode === 'work' ? 'Focus session' : 'Break'}. {t.spent_minutes ?? 0} min spent on this task.</p>
    <div className="mt-6 flex justify-center gap-2">
      <button className={btn} onClick={() => end ? (setRest(left), setEnd(null)) : setEnd(Date.now() + left * 1000)}>{end ? 'Pause' : 'Start'}</button>
      <button className={ghost} onClick={() => { setEnd(null); setRest(len(mode)) }}>Reset</button>
      <button className={ghost} onClick={() => toggle(t, m)}>Done</button>
    </div>
  </div>
}

/** Day-by-day plan: tick each day, see % done and pending (missed) days. */
function Plan({ t, m }: { t: Task; m: M }) {
  const days = planDays(t), done = t.day_done ?? {}, today = +sod(Date.now())
  const n = days.filter(d => done[ymd(d)]).length, miss = days.filter(d => +d < today && !done[ymd(d)]).length
  const flip = (d: Date) => {
    const nd = { ...done }; if (nd[ymd(d)]) delete nd[ymd(d)]; else nd[ymd(d)] = true
    const all = days.every(x => nd[ymd(x)])
    m('tasks', 'upd', t.id, { day_done: nd, done: all, completed_at: all ? new Date().toISOString() : null })
  }
  return <div className="mt-2" onClick={e => e.stopPropagation()}>
    <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{Math.round(n / days.length * 100)}% done ({n}/{days.length} days)</span>{miss > 0 && <span className="font-medium text-rose-500">{miss} day{miss > 1 ? 's' : ''} pending</span>}</div>
    <div className="mb-2 flex h-1.5 overflow-hidden rounded-full bg-line"><div className="bg-accent" style={{ width: n / days.length * 100 + '%' }} /><div className="bg-rose-500/70" style={{ width: miss / days.length * 100 + '%' }} /></div>
    <div className="flex flex-wrap gap-1">{days.map(d => { const ok = done[ymd(d)], past = +d < today, now = +d === today
      return <button key={+d} aria-label={`${d.toDateString()}: ${ok ? 'done' : 'not done'}`} onClick={() => flip(d)}
        className={cx('flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] leading-tight', ok ? 'bg-accent text-white dark:text-slate-900' : past ? 'bg-rose-500/15 text-rose-500' : now ? 'border-2 border-accent text-accent' : 'bg-line text-mute')}>
        <span>{d.toLocaleDateString([], { weekday: 'narrow' })}</span><b className="text-xs">{d.getDate()}</b></button> })}</div>
  </div>
}
