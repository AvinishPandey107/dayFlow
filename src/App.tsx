import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, useData, parseQuick, fmt, sameDay, DAY, type Task, type Ev, type M } from './lib'

const PR = ['Low', 'Medium', 'High', 'Urgent']
const DOT = ['bg-slate-400', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500']
const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ')
const sod = (d: Date | number | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const loc = (s: string | null) => s ? new Date(+new Date(s) - new Date(s).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''
const iso = (v: string) => v ? new Date(v).toISOString() : null
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
  const { tasks, events, loading, err, pending, mutate: m } = useData(uid)
  const [view, setView] = useState<'today' | 'tasks' | 'calendar'>('today')
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
  const nav = [['today', 'Today', '◉'], ['tasks', 'Tasks', '☰'], ['calendar', 'Calendar', '▦']] as const
  const tool = 'rounded-lg px-3 py-2 text-left hover:bg-card'
  const tools = <div className="flex flex-col text-sm text-mute">
    <button className={tool} onClick={() => setDark(!dark)}>{dark ? 'Light mode' : 'Dark mode'}</button>
    <button className={tool} onClick={seed}>Add sample tasks</button>
    <button className={tool} onClick={() => tasks.filter(t => t.tags.includes('sample')).forEach(t => m('tasks', 'del', t.id))}>Remove sample tasks</button>
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
      {(err || pending > 0) && <p className="mb-3 rounded-lg bg-amber-500/15 px-3 py-2 text-sm">{err} {pending > 0 && `${pending} change(s) waiting to sync.`}</p>}
      <div className="fixed inset-x-3 bottom-[4.75rem] z-10 md:static md:mb-6">
        <input ref={qa} onKeyDown={quick} className={cx(inp, 'shadow-lg md:shadow-none')} placeholder='Add a task, e.g. "Submit assignment tomorrow at 5pm !high"  (press q)' />
      </div>
      {loading ? <p className="text-mute">Loading…</p> : view === 'today' ? <Today {...pp} /> : view === 'tasks' ? <Tasks {...pp} /> : <Calendar {...pp} />}
      <div className="mt-10 md:hidden">{tools}</div>
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {nav.map(([k, l, i]) => <button key={k} onClick={() => setView(k)} className={cx('flex-1 py-2.5 text-xs', view === k ? 'font-medium text-accent' : 'text-mute')}><div className="text-lg">{i}</div>{l}</button>)}
    </nav>
    {edit && <Edit t={edit} m={m} close={() => setEdit(null)} />}
  </div>
}

function Row({ t, m, onEdit }: { t: Task; m: M; onEdit: (t: Task) => void }) {
  const due = t.due_at ? +new Date(t.due_at) : 0, st = t.start_at ? +new Date(t.start_at) : 0, now = Date.now()
  const over = !t.done && due && due < now
  const pct = st && due > st ? Math.min(100, Math.max(0, (now - st) / (due - st) * 100)) : null
  return <div className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3">
    <button aria-label={t.done ? 'Mark as not done' : 'Mark as done'} onClick={() => m('tasks', 'upd', t.id, { done: !t.done, completed_at: t.done ? null : new Date().toISOString() })}
      className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors', t.done ? 'border-accent bg-accent text-white dark:text-slate-900' : 'border-mute')}>{t.done && '✓'}</button>
    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onEdit(t)}>
      <div className={cx('font-medium', t.done && 'text-mute line-through')}>{t.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mute">
        <i className={cx('size-2 rounded-full', DOT[t.priority])} title={PR[t.priority]} />
        {t.start_at && t.due_at ? `${fmt(t.start_at)} → ${fmt(t.due_at)}` : t.due_at ? `Due ${fmt(t.due_at)}` : 'No deadline'}
        {t.est_minutes ? <span>{t.est_minutes >= 60 ? `${+(t.est_minutes / 60).toFixed(1)} h` : `${t.est_minutes} min`}</span> : null}
        {t.tags.map(g => <span key={g}>#{g}</span>)}
        {over && <span className="font-medium text-rose-500">Overdue</span>}
      </div>
      {pct !== null && !t.done && <div className="mt-2 h-1.5 rounded-full bg-line"><div className={cx('h-full rounded-full', over ? 'bg-rose-500' : 'bg-accent')} style={{ width: pct + '%' }} /></div>}
    </div>
  </div>
}

const Empty = ({ seed }: { seed: () => void }) => <div className="rounded-2xl border border-dashed border-line p-10 text-center">
  <p className="font-medium">No tasks yet</p><p className="mt-1 text-sm text-mute">Type above and press Enter, or try the examples.</p>
  <button className={cx(btn, 'mt-4')} onClick={seed}>Add sample tasks</button></div>

function Today({ tasks, events, m, onEdit, seed }: P) {
  const now = new Date(), t0 = +sod(now), t1 = t0 + DAY, t2 = t1 + DAY, t9 = t1 + 7 * DAY
  const d = (t: Task) => t.due_at ? +new Date(t.due_at) : null
  const todays = tasks.filter(t => { const x = d(t); return x !== null && x >= t0 && x < t1 })
  const over = tasks.filter(t => !t.done && (d(t) ?? Infinity) < t0)
  const tom = tasks.filter(t => !t.done && (d(t) ?? 0) >= t1 && (d(t) ?? 0) < t2)
  const soon = tasks.filter(t => !t.done && (d(t) ?? 0) >= t2 && (d(t) ?? 0) < t9)
  const done = todays.filter(t => t.done).length, pct = todays.length ? Math.round(done / todays.length * 100) : 0
  const week = tasks.filter(t => t.completed_at && +new Date(t.completed_at) > Date.now() - 7 * DAY).length
  const evs = events.filter(e => sameDay(new Date(e.start_at), now))
  const sec = (title: string, list: Task[]) => list.length ? <section className="mt-6"><h2 className="mb-2 font-medium">{title}</h2><div className="space-y-2">{list.map(t => <Row key={t.id} t={t} m={m} onEdit={onEdit} />)}</div></section> : null
  if (!tasks.length && !events.length) return <Empty seed={seed} />
  return <div>
    <h2 className="text-2xl font-semibold tracking-tight">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
    <div className="mt-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex justify-between text-sm"><span>{done} of {todays.length} due today done</span><span className="text-mute">{pct}%</span></div>
      <div className="mt-2 h-2 rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: pct + '%' }} /></div>
      <p className="mt-3 text-sm text-mute">{week} task{week === 1 ? '' : 's'} completed in the last 7 days</p>
    </div>
    {sec('Overdue', over)}{sec('Today', todays)}
    {evs.length > 0 && <section className="mt-6"><h2 className="mb-2 font-medium">Events today</h2>{evs.map(e => <div key={e.id} className="mb-2 rounded-2xl border border-accent/40 bg-card p-3 text-sm">{e.title} <span className="text-mute">{e.all_day ? 'All day' : fmt(e.start_at)}</span></div>)}</section>}
    {sec('Tomorrow', tom)}{sec('Next 7 days', soon)}
  </div>
}

function Tasks({ tasks, m, onEdit, seed }: P) {
  const [tab, setTab] = useState<'open' | 'done'>('open'), [q, setQ] = useState(''), [sort, setSort] = useState<'due' | 'pri' | 'new'>('due')
  const dd = (t: Task) => +new Date(t.due_at ?? 8.64e15)
  const list = useMemo(() => tasks.filter(t => t.done === (tab === 'done') && (t.title + (t.notes ?? '') + t.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'due' ? dd(a) - dd(b) : sort === 'pri' ? b.priority - a.priority : b.position - a.position), [tasks, tab, q, sort])
  if (!tasks.length) return <Empty seed={seed} />
  return <div className="space-y-3">
    <div className="flex gap-2">
      {(['open', 'done'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={cx('rounded-full px-4 py-1.5 text-sm', tab === k ? 'bg-accent text-white dark:text-slate-900' : 'bg-card text-mute')}>{k === 'open' ? 'Pending' : 'Completed'}</button>)}
      <select className="ml-auto rounded-lg border border-line bg-card px-2 text-sm" value={sort} onChange={e => setSort(e.target.value as 'due')}><option value="due">By deadline</option><option value="pri">By priority</option><option value="new">Newest</option></select>
    </div>
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
  return <div>
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl font-semibold">{cur.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
      <div className="flex gap-1">{[['‹', -1], ['›', 1]].map(([l, n]) => <button key={l} aria-label={n === -1 ? 'Previous month' : 'Next month'} className="size-9 rounded-lg bg-card" onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() + +n, 1))}>{l}</button>)}
        <button className="rounded-lg bg-card px-3 text-sm" onClick={() => { const d = sod(Date.now()); setSel(d); setCur(new Date(d.getFullYear(), d.getMonth(), 1)) }}>Today</button></div>
    </div>
    <div className="grid grid-cols-7 pb-1 text-center text-xs text-mute">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <span key={i}>{x}</span>)}</div>
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line">
      {days.map(d => { const x = on(d), n = x.t.length + x.e.length
        return <div key={+d} onClick={() => setSel(d)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, d)}
          className={cx('min-h-14 bg-card p-1 text-xs sm:min-h-24', d.getMonth() !== cur.getMonth() && 'opacity-40', sameDay(d, sel) && 'ring-2 ring-inset ring-accent')}>
          <span className={cx('grid size-6 place-items-center rounded-full', sameDay(d, new Date()) && 'bg-accent text-white dark:text-slate-900')}>{d.getDate()}</span>
          <div className="mt-1 hidden space-y-0.5 sm:block">
            {x.t.slice(0, 3).map(t => <div key={t.id} draggable onDragStart={e => { e.dataTransfer.setData('id', t.id); e.dataTransfer.setData('from', String(+d)) }} className={cx('cursor-grab truncate rounded px-1 text-white', DOT[t.priority], t.done && 'line-through opacity-40')}>{t.title}</div>)}
            {x.e.slice(0, 2).map(v => <div key={v.id} className="truncate rounded border border-accent px-1 text-accent">{v.title}</div>)}
            {n > 5 && <div className="text-mute">+{n - 5} more</div>}
          </div>
          <div className="mt-1 flex gap-0.5 sm:hidden">{Array.from({ length: Math.min(3, n) }, (_, i) => <i key={i} className="size-1.5 rounded-full bg-accent" />)}</div>
        </div> })}
    </div>
    <section className="mt-5 space-y-2">
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
  const [f, setF] = useState({ title: t.title, notes: t.notes ?? '', start: loc(t.start_at), due: loc(t.due_at), pr: t.priority, est: t.est_minutes ?? '' as number | '', tags: t.tags.join(', ') })
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })
  const save = () => { m('tasks', 'upd', t.id, { title: f.title.trim() || t.title, notes: f.notes, start_at: iso(f.start), due_at: iso(f.due), priority: +f.pr, est_minutes: f.est === '' ? null : +f.est, tags: f.tags.split(',').map(s => s.trim()).filter(Boolean) }); close() }
  const dup = () => { m('tasks', 'ins', crypto.randomUUID(), { title: t.title + ' (copy)', notes: t.notes, done: false, start_at: t.start_at, due_at: t.due_at, all_day: t.all_day, priority: t.priority, est_minutes: t.est_minutes, tags: t.tags, position: Date.now() }); close() }
  const lab = 'block text-xs text-mute'
  return <div className="fixed inset-0 z-20 grid place-items-end bg-black/40 sm:place-items-center" onClick={close}>
    <div className="max-h-dvh w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-bg p-5 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
      <input className={inp} value={f.title} onChange={e => set('title', e.target.value)} aria-label="Title" />
      <textarea className={inp} rows={3} placeholder="Notes" value={f.notes} onChange={e => set('notes', e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className={lab}>Start<input className={inp} type="datetime-local" value={f.start} onChange={e => set('start', e.target.value)} /></label>
        <label className={lab}>Deadline<input className={inp} type="datetime-local" value={f.due} onChange={e => set('due', e.target.value)} /></label>
        <label className={lab}>Priority<select className={inp} value={f.pr} onChange={e => set('pr', e.target.value)}>{PR.map((p, i) => <option key={p} value={i}>{p}</option>)}</select></label>
        <label className={lab}>Estimate (minutes)<input className={inp} type="number" min={0} value={f.est} onChange={e => set('est', e.target.value === '' ? '' : +e.target.value)} /></label>
      </div>
      <label className={lab}>Tags (comma separated)<input className={inp} value={f.tags} onChange={e => set('tags', e.target.value)} /></label>
      <div className="flex flex-wrap gap-2 pt-1"><button className={btn} onClick={save}>Save</button><button className="rounded-xl border border-line px-4 py-2.5" onClick={dup}>Duplicate</button>
        <button className="ml-auto rounded-xl px-4 py-2.5 text-rose-500" onClick={() => { m('tasks', 'del', t.id); close() }}>Delete</button></div>
    </div></div>
}
