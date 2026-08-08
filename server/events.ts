/**
 * The change channel: one server-sent-events stream that says "something
 * changed", and nothing more.
 *
 * ── Why it carries no payload ────────────────────────────────────────────────
 *
 * A diff would have to describe moves, cascades and renumbering — the same
 * logic the store already owns — and a client applying it wrongly would drift
 * from the server silently. A bare notification makes the client refetch, which
 * is always correct and, against a local API, cheaper than being clever.
 *
 * ── Why it is one function ───────────────────────────────────────────────────
 *
 * SSE holds a connection open per client. That is free locally and on a VPS,
 * and billed per connection-second on serverless. Keeping subscribe/broadcast
 * behind this module means swapping to polling is a change here, not a change
 * everywhere.
 */

export interface Subscriber {
  send: (data: string) => void
  close: () => void
}

const subscribers = new Set<Subscriber>()

/** Monotonic revision. Every mutation bumps it; clients use it to skip repeats. */
let revision = 0

export const currentRevision = (): number => revision

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

/**
 * Announce a change to every listener.
 *
 * A send that throws means the socket is already gone — drop that subscriber
 * rather than letting one dead connection break the broadcast for the rest.
 */
export function broadcastChange(): number {
  revision += 1
  const payload = JSON.stringify({ rev: revision })
  for (const subscriber of [...subscribers]) {
    try {
      subscriber.send(payload)
    } catch {
      subscribers.delete(subscriber)
    }
  }
  return revision
}

export const subscriberCount = (): number => subscribers.size
