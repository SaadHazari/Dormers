import { unsubscribeSecret, verifyUnsubscribeToken } from '@/contexts/contacts/domain/unsubscribe-token'
import { UnsubscribeClient } from './UnsubscribeClient'

export const metadata = {
    title: 'Unsubscribe — Dormers',
    // A mail client prefetching the link must not unsubscribe anybody, and a
    // search engine has no business indexing this page.
    robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

export default async function UnsubscribePage({
    params,
}: {
    params: Promise<{ token: string }>
}) {
    const { token } = await params
    // Checked here only to decide what to render. Nothing is written until
    // the person presses the button — some mail clients and link scanners
    // fetch every URL in a message, and a GET that unsubscribed them would
    // make those scanners into an opt-out machine.
    const valid = verifyUnsubscribeToken(token, unsubscribeSecret()) !== null

    return <UnsubscribeClient token={token} valid={valid} />
}
