import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Keep this tab in step with everyone else's writes.
 *
 * Subscribes to the server's change stream and invalidates every query when
 * something is written — by another tab, or by an agent over HTTP with no
 * browser involved at all. TanStack Query refetches only what is currently
 * mounted, so "invalidate everything" costs one request for the board being
 * looked at.
 *
 * ⚠ **This fires for the tab's OWN writes too.** That is deliberate — filtering
 * them out would need a client id round-tripped through every mutation, and the
 * refetch is harmless: `Board.tsx` refuses to re-sync its drag mirror while a
 * drag is in progress or a mutation is in flight, which is exactly the window
 * where an inbound refetch would otherwise yank a card out from under the
 * pointer.
 *
 * `EventSource` reconnects by itself, so there is no retry logic here on
 * purpose. The one thing worth doing on reconnect is a refetch, because
 * anything that changed while the socket was down was never announced.
 */
export function useLiveUpdates(): void {
  const client = useQueryClient()

  useEffect(() => {
    const source = new EventSource('/api/events')

    const refetch = () => void client.invalidateQueries()

    source.addEventListener('change', refetch)

    // A reconnect lands here, not on `change` — and the gap it just closed may
    // have contained writes nobody told us about.
    source.addEventListener('hello', refetch)

    return () => source.close()
  }, [client])
}
