import { useEffect, useRef, useState } from "react";
import {
  connectionsAvailable,
  listConnections,
  proxyFetch,
  type ApiConnection,
} from "../../../lib/connections";

/**
 * Shared plumbing for API-backed widgets: a cached connections list and a
 * polling hook that fetches through the server proxy on an interval.
 */

// Module-level cache so a dashboard full of API widgets loads the list once.
let cache: ApiConnection[] | null = null;
let inflight: Promise<ApiConnection[]> | null = null;

export function invalidateConnectionsCache() {
  cache = null;
  inflight = null;
}

export function useConnections(): {
  connections: ApiConnection[];
  available: boolean;
  error: string | null;
} {
  const available = connectionsAvailable();
  const [connections, setConnections] = useState<ApiConnection[]>(cache ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!available || cache) return;
    let cancelled = false;
    inflight = inflight ?? listConnections();
    inflight
      .then((list) => {
        cache = list;
        if (!cancelled) setConnections(list);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message ?? err));
      });
    return () => {
      cancelled = true;
    };
  }, [available]);

  return { connections, available, error };
}

export interface PollState {
  /** Parsed JSON (or raw text when the response isn't JSON). */
  data: unknown;
  error: string | null;
  loading: boolean;
}

/** Poll `path` on a connection every `refreshSec` (0/empty inputs = idle). */
export function useApiPoll(
  connectionId: string,
  path: string,
  refreshSec: number
): PollState {
  const [state, setState] = useState<PollState>({ data: null, error: null, loading: false });
  // Re-fetch when inputs change; keep the latest request the winner.
  const seq = useRef(0);

  useEffect(() => {
    if (!connectionId || !path || !connectionsAvailable()) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let disposed = false;

    async function tick() {
      const mySeq = ++seq.current;
      try {
        const res = await proxyFetch(connectionId, path);
        const text = await res.text();
        if (disposed || mySeq !== seq.current) return;
        if (!res.ok) {
          setState({ data: null, error: `HTTP ${res.status}`, loading: false });
          return;
        }
        let data: unknown = text;
        try {
          data = JSON.parse(text);
        } catch {
          /* keep raw text */
        }
        setState({ data, error: null, loading: false });
      } catch (err) {
        if (!disposed && mySeq === seq.current) {
          setState({ data: null, error: String((err as Error)?.message ?? err), loading: false });
        }
      }
    }

    setState((s) => ({ ...s, loading: true }));
    tick();
    const every = Math.max(5, refreshSec || 60) * 1000;
    const id = window.setInterval(tick, every);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [connectionId, path, refreshSec]);

  return state;
}

/** Config-form row: pick one of the configured connections. */
export function ConnectionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { connections, available, error } = useConnections();
  if (!available) {
    return (
      <span className="dw-config-hint">
        connections need the API data source (settings → data source)
      </span>
    );
  }
  if (error) return <span className="dw-config-hint">couldn't load connections</span>;
  if (connections.length === 0) {
    return (
      <span className="dw-config-hint">no connections yet — add one in settings</span>
    );
  }
  return (
    <select
      className="dw-config-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— choose connection —</option>
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
