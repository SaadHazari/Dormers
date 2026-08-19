'use client'

// Stress bench for the delivery box counter.
//
// Point a camera at some boxes, say how many there really are, and see what
// the live counter says — without walking a rider through a whole delivery.
//
// Fidelity is the only thing that makes this worth having: photos are resized
// with the same resizeToJpeg the rider PWA uses, then scored by the same
// verifyBoxCount with the same reference photos. What you see here is what
// the rider would have got.
//
// The number that matters is not accuracy. It is OVER-COUNTS: the model
// saying six when there are five is what lets a short van leave the kitchen.
// An under-count only costs a retake. They are scored and coloured apart.

import { useState, useRef, useCallback } from 'react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminCard } from '../_components/AdminCard'
import { resizeToJpeg } from '@/shared/image-resize'
import { Upload, Play, Trash2, AlertTriangle, CheckCircle2, CircleDashed, ArrowDown } from 'lucide-react'

// Enough to keep the batch moving without hammering the model's rate limit.
const CONCURRENCY = 3

type Verdict = 'ok' | 'over' | 'under' | 'refused' | 'error'

interface Row {
  id: string
  file: Blob
  name: string
  previewUrl: string
  /** What is actually in the photo. Typed by you; this is the ground truth. */
  truth: string
  status: 'idle' | 'running' | 'done'
  count?: number | null
  confidence?: string
  reason?: string
  ms?: number
  referenceCount?: number
  error?: string
}

function verdictOf(row: Row): Verdict | null {
  if (row.status !== 'done') return null
  if (row.error) return 'error'
  if (row.count == null) return 'refused'
  const truth = parseInt(row.truth, 10)
  if (isNaN(truth)) return null
  if (row.count === truth) return 'ok'
  return row.count > truth ? 'over' : 'under'
}

export function BoxCounterClient() {
  const { t } = useAdminTheme()
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [defaultTruth, setDefaultTruth] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Add photos ──────────────────────────────────────────────────────────
  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const added: Row[] = []
    for (const file of files) {
      // Same downscale the rider's phone applies before upload. Testing
      // full-resolution originals would measure a pipeline that never runs.
      const resized = await resizeToJpeg(file)
      added.push({
        id: `${file.name}-${added.length}-${file.size}`,
        file: resized,
        name: file.name,
        previewUrl: URL.createObjectURL(resized),
        truth: defaultTruth,
        status: 'idle',
      })
    }
    setRows(prev => [...prev, ...added])
  }

  function setTruth(id: string, truth: string) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, truth } : r)))
  }

  function removeRow(id: string) {
    setRows(prev => {
      const gone = prev.find(r => r.id === id)
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter(r => r.id !== id)
    })
  }

  function clearAll() {
    rows.forEach(r => URL.revokeObjectURL(r.previewUrl))
    setRows([])
  }

  // ── Score one photo through the live counter ────────────────────────────
  const scoreOne = useCallback(async (row: Row): Promise<Partial<Row>> => {
    try {
      const form = new FormData()
      form.append('photo', row.file, 'bench.jpg')
      const res = await fetch('/api/admin/box-counter-test', { method: 'POST', body: form })
      if (!res.ok) {
        return { status: 'done', error: `HTTP ${res.status}` }
      }
      const data = await res.json()
      return {
        status: 'done',
        count: data.count,
        confidence: data.confidence,
        reason: data.reason,
        ms: data.ms,
        referenceCount: data.referenceCount,
      }
    } catch (err) {
      return { status: 'done', error: err instanceof Error ? err.message : 'network error' }
    }
  }, [])

  // ── Run the batch, a few at a time ──────────────────────────────────────
  async function runAll() {
    if (running || rows.length === 0) return
    setRunning(true)
    setRows(prev => prev.map(r => ({ ...r, status: 'running', count: undefined, error: undefined })))

    const queue = [...rows]
    async function worker() {
      for (;;) {
        const next = queue.shift()
        if (!next) return
        const patch = await scoreOne(next)
        // Results land as they finish rather than all at the end.
        setRows(prev => prev.map(r => (r.id === next.id ? { ...r, ...patch } : r)))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    setRunning(false)
  }

  // ── Scoreboard ──────────────────────────────────────────────────────────
  const scored = rows.map(verdictOf)
  const done = scored.filter(Boolean).length
  const ok = scored.filter(v => v === 'ok').length
  const over = scored.filter(v => v === 'over').length
  const under = scored.filter(v => v === 'under').length
  const refused = scored.filter(v => v === 'refused').length
  // Rows with no truth typed still get an AI count, but cannot be scored.
  // Easy to do with a big batch, and silent unless we say so.
  const missingTruth = rows.filter(r => isNaN(parseInt(r.truth, 10))).length
  const times = rows.filter(r => r.ms).map(r => r.ms as number)
  const avgMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
  const refCount = rows.find(r => r.referenceCount !== undefined)?.referenceCount

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className={`text-[22px] font-bold ${t.heading}`}>Box counter bench</h1>
      <p className={`mt-1 text-[13px] ${t.muted}`}>
        Same model, same prompt, same reference photos as the rider PWA. Add photos,
        type how many boxes are really in each, then run.
      </p>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <AdminCard className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={running}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-semibold ${t.borderStrong} ${t.heading} disabled:opacity-40`}
          >
            <Upload size={15} /> Add photos
          </button>

          <label className={`flex items-center gap-2 text-[13px] ${t.muted}`}>
            Default truth
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={defaultTruth}
              onChange={e => setDefaultTruth(e.target.value)}
              placeholder="6"
              className={`w-16 rounded-lg border px-2 py-1.5 text-center text-[14px] font-bold ${t.input} ${t.inputFocus}`}
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            {rows.length > 0 && (
              <button
                onClick={clearAll}
                disabled={running}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${t.border} ${t.muted} disabled:opacity-40`}
              >
                <Trash2 size={14} /> Clear
              </button>
            )}
            <button
              onClick={runAll}
              disabled={running || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#f57f20] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
            >
              <Play size={15} /> {running ? 'Running…' : `Run ${rows.length || ''}`}
            </button>
          </div>
        </div>
        <p className={`mt-2.5 text-[12px] ${t.muted}`}>
          Photos are downscaled exactly as the rider&rsquo;s phone does before upload, so
          this measures the pipeline that actually runs.
          {refCount !== undefined && (
            <>
              {' '}Reference photos loaded on the server: <strong>{refCount}</strong>
              {refCount === 0 && ' — the deploy lost them, so the model is running on the text description only.'}
            </>
          )}
        </p>
      </AdminCard>

      {missingTruth > 0 && (
        <div className={`mt-3 rounded-lg border px-3.5 py-2.5 text-[12px] ${t.warningBg} ${t.warning}`}>
          {missingTruth} {missingTruth === 1 ? 'photo has' : 'photos have'} no real count typed in.
          {' '}They will still be counted, but they cannot be scored right or wrong.
        </div>
      )}

      {/* ── Scoreboard ───────────────────────────────────────────────── */}
      {done > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Exact" value={`${ok}/${done}`} tone="success" t={t} />
          <Stat label="Over-counted" value={String(over)} tone={over > 0 ? 'danger' : 'muted'} t={t}
                hint="lets a short van out" />
          <Stat label="Under-counted" value={String(under)} tone={under > 0 ? 'warning' : 'muted'} t={t}
                hint="costs a retake" />
          <Stat label="Refused" value={String(refused)} tone="muted" t={t} hint="safe outcome" />
          <Stat label="Avg time" value={`${(avgMs / 1000).toFixed(1)}s`} tone="muted" t={t} />
        </div>
      )}

      {/* ── Rows ─────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <AdminCard className="mt-4">
          <p className={`text-[13px] ${t.muted}`}>
            No photos yet. Shoot a few of the same boxes from different angles, stacked
            and spread out, and see where it breaks.
          </p>
        </AdminCard>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map(row => (
            <ResultRow
              key={row.id}
              row={row}
              verdict={verdictOf(row)}
              onTruth={setTruth}
              onRemove={removeRow}
              disabled={running}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Stat({
  label, value, tone, hint, t,
}: {
  label: string
  value: string
  tone: 'success' | 'danger' | 'warning' | 'muted'
  hint?: string
  t: Record<string, string>
}) {
  const toneCls =
    tone === 'success' ? t.success : tone === 'danger' ? t.danger : tone === 'warning' ? t.warning : t.heading
  return (
    <AdminCard>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${t.muted}`}>{label}</div>
      <div className={`mt-0.5 text-[22px] font-bold ${toneCls}`}>{value}</div>
      {hint && <div className={`text-[11px] ${t.muted}`}>{hint}</div>}
    </AdminCard>
  )
}

function ResultRow({
  row, verdict, onTruth, onRemove, disabled, t,
}: {
  row: Row
  verdict: Verdict | null
  onTruth: (id: string, v: string) => void
  onRemove: (id: string) => void
  disabled: boolean
  t: Record<string, string>
}) {
  return (
    <AdminCard>
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.previewUrl}
          alt={row.name}
          className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className={`flex items-center gap-1.5 text-[12px] ${t.muted}`}>
              Really
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={row.truth}
                onChange={e => onTruth(row.id, e.target.value)}
                disabled={disabled}
                className={`w-14 rounded-lg border px-2 py-1 text-center text-[15px] font-bold ${t.input} ${t.inputFocus}`}
              />
            </label>

            <div className={`text-[12px] ${t.muted}`}>
              AI said{' '}
              <strong className={`text-[16px] ${t.heading}`}>
                {row.status === 'running' ? '…' : row.count == null ? (row.status === 'done' ? 'cannot tell' : '—') : row.count}
              </strong>
            </div>

            {verdict && <VerdictBadge verdict={verdict} t={t} />}

            <button
              onClick={() => onRemove(row.id)}
              disabled={disabled}
              className={`ml-auto rounded-lg p-1.5 ${t.muted} disabled:opacity-40`}
              aria-label="Remove"
            >
              <Trash2 size={14} />
            </button>
          </div>

          <div className={`mt-1.5 truncate text-[11px] ${t.muted}`}>{row.name}</div>

          {row.status === 'done' && (
            <p className={`mt-1 text-[12px] ${t.muted}`}>
              {row.error
                ? row.error
                : <>
                    <span className="font-semibold">{row.confidence}</span> confidence
                    {row.ms ? ` · ${(row.ms / 1000).toFixed(1)}s` : ''} · {row.reason}
                  </>}
            </p>
          )}
        </div>
      </div>
    </AdminCard>
  )
}

function VerdictBadge({ verdict, t }: { verdict: Verdict; t: Record<string, string> }) {
  const map: Record<Verdict, { label: string; cls: string; icon: React.ReactNode }> = {
    // Over-counting is the only verdict that can send a short van out, so it
    // is the only one painted as an alarm.
    over:    { label: 'OVER',    cls: `${t.dangerBg} ${t.danger}`,   icon: <AlertTriangle size={12} /> },
    under:   { label: 'under',   cls: `${t.warningBg} ${t.warning}`, icon: <ArrowDown size={12} /> },
    ok:      { label: 'exact',   cls: `${t.successBg} ${t.success}`, icon: <CheckCircle2 size={12} /> },
    refused: { label: 'refused', cls: `${t.accentBg} ${t.accent}`,   icon: <CircleDashed size={12} /> },
    error:   { label: 'error',   cls: `${t.dangerBg} ${t.danger}`,   icon: <AlertTriangle size={12} /> },
  }
  const v = map[verdict]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${v.cls}`}>
      {v.icon} {v.label}
    </span>
  )
}
