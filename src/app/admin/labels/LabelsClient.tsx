'use client'

// Admin labels screen. The preview grid renders pages of the ACTUAL daily
// PDF (via pdf.js) — the same bytes the kitchen downloads and prints — so
// what you see here is, by construction, exactly what comes off the printer.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Download, Eye, Link2, MessageCircle, Printer, Tag, X } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { AdminButton } from '../_components/AdminButton'
import { AdminModal } from '../_components/AdminModal'
import { SHAPE_D } from './label-spec'
import type { LabelMeta } from './data'
import type { DormShape } from './dorm-shapes'

interface Props {
  dateIso: string
  dayName: string
  labels: LabelMeta[]
  noDeliveryReason?: string
  /** Override for dev harnesses; defaults to the production endpoint. */
  pdfUrl?: string
}

const PDF_URL = '/api/admin/labels/pdf?disposition=inline'

export default function LabelsClient({ dateIso, labels, noDeliveryReason, pdfUrl = PDF_URL }: Props) {
  const { t, isLight } = useAdminTheme()
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  // 'batch' while the whole-day share runs, an orderId for a per-label share.
  const [sharing, setSharing] = useState<string | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ label: LabelMeta; pageIndex: number } | null>(null)

  const filename = `dormers-labels-${dateIso}.pdf`
  const dateDisplay = new Date(dateIso + 'T00:00:00').toLocaleDateString('en-AE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  // Fetch today's PDF once; previews, download and mobile share all reuse it.
  useEffect(() => {
    if (labels.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(pdfUrl)
        if (!res.ok) throw new Error(`PDF generation failed (${res.status})`)
        const blob = await res.blob()
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise
        if (cancelled) return
        setPdfBlob(blob)
        setPdfDoc(doc)
      } catch (e) {
        if (!cancelled) setPdfError(e instanceof Error ? e.message : 'Failed to load PDF')
      }
    })()
    return () => { cancelled = true }
  }, [labels.length, pdfUrl])

  function handleDownload() {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Single-label PDF — same engine/route as the batch, narrowed to one page. */
  const labelPdfUrl = (orderId: string) =>
    `${pdfUrl}${pdfUrl.includes('?') ? '&' : '?'}order=${encodeURIComponent(orderId)}`

  // AdminModal leaves Esc to the consumer.
  useEffect(() => {
    if (!viewing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewing(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing])

  const summary = `Dormers' labels — ${dateDisplay} · ${labels.length} meal${labels.length !== 1 ? 's' : ''}`

  /**
   * Publishes the PDF (7-day signed URLs) and opens WhatsApp with a
   * prefilled message. The window must open synchronously (inside the
   * click) or popup blockers eat it — we navigate it once the link is ready.
   * Pass a label to share just that one (reprints, "this box only").
   */
  async function shareViaWhatsApp(kind: 'pdf' | 'printLink', label?: LabelMeta) {
    if (sharing) return
    const popup = window.open('about:blank', '_blank')
    setSharing(label ? label.orderId : 'batch')
    setShareNote(null)
    try {
      const res = await fetch('/api/admin/labels/share', {
        method: 'POST',
        ...(label && {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: label.orderId }),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Share failed')
      const heading = label
        ? `Dormers' label — ${label.orderId} · ${label.customerName} (${label.mealPref}) — ${dateDisplay}`
        : summary
      const message = kind === 'printLink'
        ? `${heading}\nOpen this link in the browser on the printer computer and hit Print — pages are already 4×6, no scaling needed:\n${body.printUrl}`
        : `${heading}\n${body.downloadUrl}`
      const wa = `https://wa.me/?text=${encodeURIComponent(message)}`
      if (popup) popup.location.href = wa
      else window.open(wa, '_blank')
      setShareNote(`Link${label ? ` for ${label.orderId}` : ''} ready — pick the kitchen chat in WhatsApp. Link stays live for 7 days.`)
    } catch (e) {
      popup?.close()
      setShareNote(e instanceof Error ? e.message : 'Share failed')
    } finally {
      setSharing(null)
    }
  }

  async function handleWhatsAppPdf() {
    // Mobile: hand WhatsApp the PDF itself through the native share sheet.
    if (pdfBlob) {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: summary })
          return
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return  // user closed the sheet
          // fall through to the link path
        }
      }
    }
    // Desktop: send a download link instead.
    await shareViaWhatsApp('pdf')
  }

  if (noDeliveryReason || labels.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <h1 className={`text-xl font-extrabold tracking-tight ${t.heading}`}>Labels</h1>
        <p className={`text-xs mt-0.5 ${t.faint}`}>{dateDisplay}</p>
        <div className={`mt-8 p-8 rounded-xl ${t.card}`}>
          <Tag size={28} className={`mx-auto mb-3 opacity-30 ${t.muted}`} />
          <p className={`text-base font-bold ${t.heading}`}>{noDeliveryReason ?? 'No labels today'}</p>
          <p className={`text-xs mt-1.5 ${t.muted}`}>Nothing to print — enjoy the quiet.</p>
        </div>
      </div>
    )
  }

  const vegCount = labels.filter(l => l.mealPref === 'VEG').length
  const dormGroups = groupByDorm(labels)

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className={`text-xl font-extrabold tracking-tight ${t.heading}`}>Labels</h1>
          <p className={`text-xs mt-0.5 ${t.faint}`}>{dateDisplay}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminButton icon={<Download size={14} />} onClick={handleDownload} disabled={!pdfBlob}>
            Download PDF
          </AdminButton>
          <AdminButton
            variant="ghost"
            icon={<MessageCircle size={14} />}
            onClick={handleWhatsAppPdf}
            loading={sharing === 'batch'}
            disabled={!pdfBlob && !pdfError}
          >
            WhatsApp PDF
          </AdminButton>
          <AdminButton
            variant="ghost"
            icon={<Link2 size={14} />}
            onClick={() => shareViaWhatsApp('printLink')}
            loading={sharing === 'batch'}
            disabled={!pdfBlob && !pdfError}
          >
            WhatsApp Print Link
          </AdminButton>
          <AdminButton
            variant="ghost"
            icon={<Printer size={14} />}
            onClick={() => window.open(pdfUrl, '_blank')}
          >
            Print
          </AdminButton>
        </div>
      </div>

      {shareNote && (
        <div className={`mb-4 px-3 py-2 rounded-lg border text-[12px] font-semibold ${t.accentBg} ${t.accent}`}>
          {shareNote}
        </div>
      )}
      {pdfError && (
        <div className={`mb-4 px-3 py-2 rounded-lg border text-[12px] font-semibold ${t.dangerBg} ${t.danger}`}>
          {pdfError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Labels" value={labels.length} t={t} />
        <StatCard label="Non-Veg" value={labels.length - vegCount} t={t} />
        <StatCard label="Veg" value={vegCount} t={t} />
        <StatCard label="Dorms" value={dormGroups.length} t={t} />
      </div>

      {/* Per-dorm sections — pages of the real PDF, in print order */}
      {dormGroups.map(group => (
        <section key={group.dorm} className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <DormBadge shape={group.shape} number={group.number} isLight={isLight} />
            <h2 className={`text-[13px] font-black tracking-[0.08em] ${t.heading}`}>{group.dorm}</h2>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${t.border} ${t.faint}`}>
              {group.items.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {group.items.map(({ label, pageIndex }) => (
              <div key={label.orderId} className={`rounded-xl overflow-hidden ${t.card}`}>
                <div
                  className={pdfDoc ? 'cursor-zoom-in' : undefined}
                  onClick={() => pdfDoc && setViewing({ label, pageIndex })}
                >
                  <PdfPage doc={pdfDoc} pageNumber={pageIndex + 1} />
                </div>
                <div className={`px-3 py-2 border-t ${t.border}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-bold truncate ${t.heading}`}>{label.customerName}</span>
                    <span className={`text-[10px] font-bold shrink-0 ${label.mealPref === 'VEG' ? t.success : t.accent}`}>
                      {label.mealPref}
                    </span>
                  </div>
                  <div className={`text-[10px] font-semibold mt-0.5 ${t.faint}`}>
                    {label.orderId} · {label.dishName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <CardAction
                      icon={<Eye size={13} />}
                      label={`View ${label.orderId}`}
                      disabled={!pdfDoc}
                      onClick={() => setViewing({ label, pageIndex })}
                      t={t}
                    />
                    <CardAction
                      icon={<Printer size={13} />}
                      label={`Print ${label.orderId} only`}
                      onClick={() => window.open(labelPdfUrl(label.orderId), '_blank')}
                      t={t}
                    />
                    <CardAction
                      icon={<MessageCircle size={13} />}
                      label={`WhatsApp ${label.orderId} print link`}
                      loading={sharing === label.orderId}
                      disabled={sharing !== null && sharing !== label.orderId}
                      onClick={() => shareViaWhatsApp('printLink', label)}
                      t={t}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Single-label zoom — the same PDF page, big enough to read. */}
      {viewing && (
        <AdminModal
          label={`Label ${viewing.label.orderId}`}
          maxW="max-w-[400px]"
          onBackdrop={() => setViewing(null)}
        >
          <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${t.border}`}>
            <div className="min-w-0">
              <div className={`text-[13px] font-extrabold truncate ${t.heading}`}>
                {viewing.label.orderId} · {viewing.label.customerName}
              </div>
              <div className={`text-[11px] font-semibold mt-0.5 ${t.faint}`}>
                {viewing.label.dishName} ·{' '}
                <span className={viewing.label.mealPref === 'VEG' ? t.success : t.accent}>
                  {viewing.label.mealPref}
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setViewing(null)}
              className={`p-1.5 rounded-lg shrink-0 cursor-pointer ${t.sidebarItem}`}
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <PdfPage key={viewing.label.orderId} doc={pdfDoc} pageNumber={viewing.pageIndex + 1} />
          </div>
          <div className={`flex items-center gap-2 px-4 py-3 border-t ${t.border}`}>
            <AdminButton
              icon={<Printer size={14} />}
              onClick={() => window.open(labelPdfUrl(viewing.label.orderId), '_blank')}
              className="flex-1"
            >
              Print
            </AdminButton>
            <AdminButton
              variant="ghost"
              icon={<MessageCircle size={14} />}
              loading={sharing === viewing.label.orderId}
              onClick={() => shareViaWhatsApp('printLink', viewing.label)}
              className="flex-1"
            >
              WhatsApp
            </AdminButton>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface DormGroup {
  dorm: string
  number: number
  shape: DormShape
  items: Array<{ label: LabelMeta; pageIndex: number }>
}

function groupByDorm(labels: LabelMeta[]): DormGroup[] {
  const groups = new Map<string, DormGroup>()
  labels.forEach((label, pageIndex) => {
    let g = groups.get(label.dormDisplayName)
    if (!g) {
      g = { dorm: label.dormDisplayName, number: label.dormNumber, shape: label.dormShape, items: [] }
      groups.set(label.dormDisplayName, g)
    }
    g.items.push({ label, pageIndex })
  })
  return [...groups.values()]
}

/** Compact icon button for the per-label action row (view / print / share). */
function CardAction({ icon, label, onClick, disabled, loading, t }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  t: Record<string, string>
}) {
  const off = disabled || loading
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={off}
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center py-1.5 rounded-lg border transition-colors ${t.border} ${t.sidebarItem} ${off ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {loading
        ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : icon}
    </button>
  )
}

function StatCard({ label, value, t }: { label: string; value: number; t: Record<string, string> }) {
  return (
    <div className={`p-3 rounded-xl ${t.card}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${t.faint}`}>{label}</div>
      <div className={`text-2xl font-extrabold mt-0.5 ${t.heading}`}>{value}</div>
    </div>
  )
}

function DormBadge({ shape, number, isLight }: { shape: DormShape; number: number; isLight: boolean }) {
  const ink = isLight ? '#091825' : '#ede8da'
  const knockout = isLight ? '#ede8da' : '#091825'
  return (
    <svg viewBox="0 0 100 100" width={20} height={20} aria-hidden>
      <path d={SHAPE_D[shape]} fill={ink} />
      <text
        x="50" y={shape === 'triangle' ? 66 : 54} textAnchor="middle" dominantBaseline="central"
        fill={knockout} fontFamily="var(--font-montserrat), sans-serif" fontWeight={700}
        fontSize={shape === 'star' || shape === 'triangle' ? 34 : 44}
      >
        {number}
      </text>
    </svg>
  )
}

/** One page of the daily PDF, rendered lazily when scrolled into view. */
function PdfPage({ doc, pageNumber }: { doc: PDFDocumentProxy | null; pageNumber: number }) {
  const holderRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const el = holderRef.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setVisible(true) },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const render = useCallback(async () => {
    if (!doc || !canvasRef.current || !holderRef.current) return
    const page = await doc.getPage(pageNumber)
    const canvas = canvasRef.current
    if (!canvas) return
    const cssWidth = holderRef.current.clientWidth || 256
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (cssWidth * dpr) / page.getViewport({ scale: 1 }).width
    const viewport = page.getViewport({ scale })
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    setRendered(true)
  }, [doc, pageNumber])

  useEffect(() => {
    if (visible && doc && !rendered) void render()
  }, [visible, doc, rendered, render])

  return (
    <div ref={holderRef} className="relative w-full aspect-[2/3] bg-[#ede8da]">
      {!rendered && <div className="absolute inset-0 animate-pulse bg-[#091825]/[0.06]" />}
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
