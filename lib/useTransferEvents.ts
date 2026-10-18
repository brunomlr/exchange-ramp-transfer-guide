"use client";

import { useEffect, useRef, useState } from "react";
import { rpcServer } from "@/lib/stellar";
import { allTokenContractIds } from "@/lib/tokens";
import { fetchTransferEvents, type DetectedTransfer } from "@/lib/events";

const POLL_MS = 3000;

/**
 * Polls the RPC `getEvents` stream for `transfer` events credited to the
 * exchange base account. Newest-first, capped at 50. The poll loop runs once
 * per mount and is independent of any matcher — consumers decide what counts
 * as a match. Shared by the live detection panels in both deposit flows.
 */
export function useTransferEvents(exchangeBaseG: string) {
  const [transfers, setTransfers] = useState<DetectedTransfer[]>([]);
  const [latestLedger, setLatestLedger] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seen = useRef<Set<string>>(new Set());
  const cursor = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!exchangeBaseG) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const server = rpcServer();
    const contractIds = allTokenContractIds();

    async function poll() {
      try {
        const res = await fetchTransferEvents(server, {
          contractIds,
          exchangeBaseG,
          cursor: cursor.current,
        });
        cursor.current = res.nextCursor;
        setLatestLedger(res.latestLedger);
        setError(null);
        const fresh = res.transfers.filter((t) => !seen.current.has(t.eventId));
        if (fresh.length) {
          fresh.forEach((t) => seen.current.add(t.eventId));
          setTransfers((prev) => [...fresh.reverse(), ...prev].slice(0, 50));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "RPC error");
      }
    }

    // Chain each poll off the previous one rather than using setInterval, so a
    // slow RPC response never overlaps the next request.
    function schedule() {
      if (stopped) return;
      timer = setTimeout(async () => {
        await poll();
        schedule();
      }, POLL_MS);
    }

    (async () => {
      try {
        const latest = await server.getLatestLedger();
        cursor.current = undefined;
        const seed = Math.max(1, latest.sequence - 12);
        const res = await fetchTransferEvents(server, {
          contractIds,
          exchangeBaseG,
          startLedger: seed,
        });
        cursor.current = res.nextCursor;
        setLatestLedger(res.latestLedger);
        res.transfers.forEach((t) => seen.current.add(t.eventId));
        setTransfers(res.transfers.slice(-50).reverse());
      } catch (e) {
        setError(e instanceof Error ? e.message : "RPC error");
      }
      schedule();
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [exchangeBaseG]);

  return { transfers, latestLedger, error };
}
