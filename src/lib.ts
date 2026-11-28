import { createClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const DAY = 864e5
export type Task = { id: string; title: string; notes: string; done: boolean; completed_at: string | null; start_at: string | null; due_at: string | null; all_day: boolean; priority: number; est_minutes: number | null; spent_minutes?: number; remind_minutes?: number | null; recur?: string | null; recur_every?: number; checklist?: { t: string; d: boolean }[]; day_done?: Record<string, boolean>; archived?: boolean; tags: string[]; position: number; updated_at: string }
export type Ev = { id: string; title: string; start_at: string; end_at: string; all_day: boolean }
type T = 'tasks' | 'events'
type Op = { t: T; k: 'ins' | 'upd' | 'del'; id: string; d?: Record<string, unknown> }
export type M = (t: T, k: Op['k'], id: string, d?: Record<string, unknown>) => void

export const fmt = (s: string | null) => s ? new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const ls = (k: string, v?: unknown) => v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v))

/** Offline-first data: optimistic local state + outbox of pending writes + realtime subscription.
 *  Updates send only changed fields, so edits to different fields on two devices both survive. */
export function useData(uid: string) {
  const ck = 'df_cache_' + uid
  const [rows, setRows] = useState<{ tasks: Task[]; events: Ev[] }>(() => ls(ck) || { tasks: [], events: [] })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState((ls('df_out') || []).length)
  const put = (t: T, f: (a: any[]) => any[]) => setRows(r => { const n = { ...r, [t]: f(r[t]) }; ls(ck, n); return n })

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from('tasks').select('*').order('position'), supabase.from('events').select('*')])
    if (a.error || b.error) { setErr('Offline or unreachable. Showing saved data.'); return }
    setErr(''); const n = { tasks: a.data as Task[], events: b.data as Ev[] }; ls(ck, n); setRows(n)
  }, [ck])

  const flush = useCallback(async () => {
    const q: Op[] = ls('df_out') || []
    while (q.length) {
      const o = q[0], tb = supabase.from(o.t)
      const r = o.k === 'ins' ? await tb.upsert({ ...o.d, id: o.id }) : o.k === 'upd' ? await tb.update(o.d!).eq('id', o.id) : await tb.delete().eq('id', o.id)
      if (r.error && !r.status) break                 // network down: keep queue, retry later
      if (r.error) setErr(r.error.message)            // server rejected: drop the write, show why
      q.shift(); ls('df_out', q)
    }
    setPending(q.length)
    if (!q.length) await load()
  }, [load])

  const mutate: M = useCallback((t, k, id, d) => {
    const now = new Date().toISOString()
    put(t, a => k === 'ins' ? [...a, { ...d, id, updated_at: now }] : k === 'upd' ? a.map(x => x.id === id ? { ...x, ...d, updated_at: now } : x) : a.filter(x => x.id !== id))
    const q: Op[] = ls('df_out') || []; q.push({ t, k, id, d }); ls('df_out', q); setPending(q.length); flush()
  }, [flush])

  useEffect(() => {
    flush().finally(() => setLoading(false))
    const ch = supabase.channel('df-' + uid).on('postgres_changes', { event: '*', schema: 'public' }, (p: any) => {
      const t = p.table as T; if (t !== 'tasks' && t !== 'events') return
      put(t, a => p.eventType === 'DELETE' ? a.filter(x => x.id !== p.old.id) : a.some(x => x.id === p.new.id) ? a.map(x => x.id === p.new.id ? p.new : x) : [...a, p.new])
    }).subscribe()
    const on = () => { flush() }
    addEventListener('online', on)
    return () => { supabase.removeChannel(ch); removeEventListener('online', on) }
  }, [uid])

  return { ...rows, loading, err, pending, mutate }
}

/** "Submit assignment tomorrow at 5pm !high" -> title, due date, priority */
export function parseQuick(s: string) {
  let title = s, due: Date | null = null, priority = 1
  const take = (re: RegExp) => { const m = title.match(re); if (m) title = title.replace(re, ' '); return m }
  const p = take(/!(urgent|high|medium|low)\b/i); if (p) priority = ['low', 'medium', 'high', 'urgent'].indexOf(p[1].toLowerCase())
  const dm = take(/\b(today|tomorrow|tonight)\b/i)
  const wd = take(/\b(?:on |next )?(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?\b/i)
  const tm = take(/\b(?:at |by )?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i)
  if (dm || wd || tm) {
    const d = new Date()
    if (dm && /tomorrow/i.test(dm[1])) d.setDate(d.getDate() + 1)
    if (wd) { const i = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(wd[1].slice(0, 3).toLowerCase()); d.setDate(d.getDate() + ((i - d.getDay() + 7) % 7 || 7)) }
    d.setHours(tm ? (+tm[1] % 12) + (tm[3].toLowerCase() === 'pm' ? 12 : 0) : 23, tm ? +(tm[2] || 0) : 59, 0, 0); due = d
  }
  return { title: title.replace(/\s+/g, ' ').trim() || s, due, priority }
}

export const bump = (s: string, r: string, n: number) => { const d = new Date(s); if (r === 'daily') d.setDate(d.getDate() + n); else if (r === 'weekly') d.setDate(d.getDate() + 7 * n); else d.setMonth(d.getMonth() + n); return d.toISOString() }
