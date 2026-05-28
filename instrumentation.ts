/**
 * Next.js instrumentation hook — fires once per runtime, before any request.
 *
 * Loads the appropriate Sentry config based on which Next.js runtime is
 * starting. Without this hook the Sentry SDK doesn't bind to global error
 * handlers in App Router + Node 20 runtime.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
