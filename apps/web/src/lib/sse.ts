"use client";
import { useEffect, useState } from "react";
import { API_BASE } from "./api";

export type SseEvent = { event: string; data: unknown };

const NAMED_TYPES = [
  "run_started",
  "chain_start",
  "llm_start",
  "llm_end",
  "tool_start",
  "tool_end",
  "final_decision",
  "done",
  "ping",
];

export function useRunStream(runId: number | null): SseEvent[] {
  const [events, setEvents] = useState<SseEvent[]>([]);

  useEffect(() => {
    if (runId == null) return;
    setEvents([]);
    const es = new EventSource(`${API_BASE}/runs/${runId}/events`);

    const handler = (type: string) => (e: MessageEvent) => {
      let data: unknown = e.data;
      try {
        data = JSON.parse(e.data);
      } catch {
        // pass — keep raw
      }
      setEvents((prev) => [...prev, { event: type, data }]);
      // Close stream on terminal event so EventSource doesn't auto-reconnect
      if (type === "done") {
        es.close();
      }
    };

    NAMED_TYPES.forEach((t) => es.addEventListener(t, handler(t)));

    // Server-sent "error" event (named, has data) — surface to UI.
    // Browser's native error event (no data, fires on connection close) — ignore.
    es.addEventListener("error", (e: Event) => {
      const me = e as MessageEvent;
      if (me.data) {
        let data: unknown = me.data;
        try {
          data = JSON.parse(me.data);
        } catch {}
        setEvents((prev) => [...prev, { event: "error", data }]);
        es.close();
      }
      // else: silent — connection closed naturally or transient network blip
    });

    return () => {
      es.close();
    };
  }, [runId]);

  return events;
}
