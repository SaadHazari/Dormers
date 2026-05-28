/**
 * Typed in-process event bus.
 *
 * Lets contexts publish domain events without knowing which other contexts
 * consume them. Subscribers register handlers; emitters call emit() with a
 * typed payload; the bus awaits each handler sequentially and aggregates
 * errors so one failing subscriber doesn't drop the others.
 *
 * Lifecycle notes — this is an IN-PROCESS bus, not a queue:
 *   • Subscribers must register before the first emit (typically via
 *     side-effect imports in src/shared/events/wire-events.ts).
 *   • In Next.js serverless every request gets a fresh process, so
 *     subscribers re-register on every request. wireEvents() is cheap.
 *   • For genuinely async, cross-request work (post-payment fanout,
 *     notification dispatch) use Supabase tables + crons — the event
 *     bus is a same-request decoupling mechanism, not a durability layer.
 *
 * Failure semantics: each handler runs inside its own try/catch. A throw
 * in one handler is logged via console.error and accumulated; emit() still
 * runs all remaining handlers. If any handler failed, emit() rejects with
 * an AggregateError after all handlers have run — caller can ignore (for
 * fire-and-forget events) or await + handle (for emit-as-orchestration).
 */

/**
 * EventMap — every event type the codebase publishes, with its payload shape.
 *
 * Payloads use only primitive types (string / number / Date / plain object).
 * The bus lives in shared/ and the dependency rule forbids shared/ from
 * importing context types, so we can't reference e.g. CustomerNotificationKind
 * here. Subscribers in their own context are responsible for narrowing /
 * validating the string `kind` field against their typed enum.
 *
 * Adding an event = add a line here + register a handler. The compiler
 * enforces emit/handler agreement on payload shape; runtime checks at the
 * subscriber side enforce string-enum constraints.
 */
export interface EventMap {
  /**
   * A subscription state transition that the user should be notified about.
   * Carries the notification kind + optional payload directly so the
   * notifications subscriber can queue without re-deriving them.
   *
   * `kind` is a string at this layer; the notifications subscriber narrows
   * it to its typed CustomerNotificationKind union before persisting.
   */
  'subscription.notification-due': {
    customerId: string
    kind: string
    scheduledFor: Date
    payload?: Record<string, string>
  }
}

export type EventHandler<K extends keyof EventMap> = (
  payload: EventMap[K],
) => Promise<void>

class EventBus {
  private handlers = new Map<keyof EventMap, EventHandler<keyof EventMap>[]>()

  on<K extends keyof EventMap>(event: K, handler: EventHandler<K>): void {
    const list = this.handlers.get(event) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list.push(handler as EventHandler<any>)
    this.handlers.set(event, list)
  }

  /**
   * Runs all handlers for `event` sequentially with `payload`. Each handler
   * is isolated — a throw in one is caught, logged, and the next handler
   * still runs. If any handler threw, emit() rejects with an AggregateError
   * after all handlers complete.
   */
  async emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): Promise<void> {
    const list = this.handlers.get(event) ?? []
    const errors: unknown[] = []
    for (const handler of list) {
      try {
        await handler(payload)
      } catch (err) {
        console.error(`event handler for ${String(event)} threw:`, err)
        errors.push(err)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} handler(s) failed for ${String(event)}`)
    }
  }

  /** Test helper — wipe all registered handlers. Never call in production code. */
  _clearAllForTests(): void {
    this.handlers.clear()
  }

  /** Test helper — inspect how many handlers are registered for an event. */
  _handlerCount<K extends keyof EventMap>(event: K): number {
    return this.handlers.get(event)?.length ?? 0
  }
}

/** Module-scoped singleton — one bus per process. */
export const eventBus = new EventBus()
