import { NextResponse } from 'next/server'
import { writeFileSync } from 'fs'

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
  try {
    const body = await req.json()
    const line = JSON.stringify(body) + '\n'
    writeFileSync('/tmp/dashboard-error.log', line, { flag: 'a' })
    console.error('\n\n=== DASHBOARD ERROR BOUNDARY FIRED ===')
    console.error('Message:', body.message)
    console.error('Stack:', body.stack?.split('\n').slice(0, 5).join('\n'))
    console.error('Digest:', body.digest)
    console.error('=== END ===\n')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
