'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import JSZip from 'jszip'
import { useAdminTheme } from '../_components/AdminThemeProvider'
import { Download, Printer } from 'lucide-react'

const BASE_URL = 'https://dormers.ae'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DishMeta {
  id: number
  name: string
  week: string
  isVeg: boolean
  dayOfWeek: number
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
}

export default function QrCodesClient({ dishes }: { dishes: DishMeta[] }) {
  const { t } = useAdminTheme()
  const [qrMap, setQrMap] = useState<Record<number, string>>({})
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    async function generate() {
      const entries: Record<number, string> = {}
      for (const dish of dishes) {
        entries[dish.id] = await QRCode.toDataURL(`${BASE_URL}/dish/${dish.id}`, {
          width: 256,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        })
      }
      setQrMap(entries)
    }
    generate()
  }, [dishes])

  async function downloadOne(dish: DishMeta) {
    const dataUrl = await QRCode.toDataURL(`${BASE_URL}/dish/${dish.id}`, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${String(dish.id).padStart(2, '0')}-${slugify(dish.name)}.png`
    a.click()
  }

  async function downloadAll() {
    setDownloading(true)
    try {
      const zip = new JSZip()
      for (const dish of dishes) {
        const dataUrl = await QRCode.toDataURL(`${BASE_URL}/dish/${dish.id}`, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: 'M',
        })
        const base64 = dataUrl.split(',')[1]
        zip.file(`${String(dish.id).padStart(2, '0')}-${slugify(dish.name)}.png`, base64, { base64: true })
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'dormers-qr-codes.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className={`text-xl font-bold ${t.heading}`}>QR Codes</h1>
          <p className={`text-sm mt-1 ${t.muted}`}>
            Each code links to <span className={t.heading}>dormers.ae/dish/&#123;id&#125;</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border transition-colors ${t.border} ${t.heading}`}
          >
            <Printer size={14} /> Print
          </button>
          <button
            onClick={downloadAll}
            disabled={downloading}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-[#f57f20] text-white hover:bg-[#ff8f36] transition-colors disabled:opacity-50"
          >
            <Download size={14} /> {downloading ? 'Zipping...' : 'Download All'}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 print:grid-cols-4 print:gap-6">
        {dishes.map(dish => (
          <div
            key={dish.id}
            className={`rounded-xl p-3 flex flex-col items-center text-center print:break-inside-avoid ${t.card}`}
          >
            {qrMap[dish.id] ? (
              <img
                src={qrMap[dish.id]}
                alt={`QR for ${dish.name}`}
                width={160}
                height={160}
                className="w-full max-w-[160px] rounded-lg"
              />
            ) : (
              <div className="w-[160px] h-[160px] rounded-lg animate-pulse bg-black/10" />
            )}

            <p className={`text-xs font-semibold mt-2 leading-tight line-clamp-2 ${t.heading}`}>
              {dish.name}
            </p>

            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  dish.isVeg
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-orange-500/10 text-orange-600'
                }`}
              >
                {dish.isVeg ? 'V' : 'NV'}
              </span>
              <span className={`text-[9px] ${t.muted}`}>
                {dish.week.replace('week', 'W')} &middot; {DAYS[dish.dayOfWeek]}
              </span>
            </div>

            <button
              onClick={() => downloadOne(dish)}
              className="mt-2 text-[10px] font-medium text-[#f57f20] hover:underline print:hidden"
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
