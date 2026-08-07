/**
 * Recreation.gov adapters.
 *
 * Two upstreams, with different key requirements — and this service is honest
 * about the difference in every response:
 *
 *  1. **RIDB** (`ridb.recreation.gov`) — the official Recreation Information
 *     Database. Campground search lives here and it needs a **free** API key
 *     (`RIDB_API_KEY`). Without one, `/search` falls back to deterministic
 *     fixtures labelled `source: "fixture"`.
 *
 *  2. **recreation.gov availability** (`www.recreation.gov/api/camps`) — the
 *     public, **keyless** endpoint behind the site's own booking calendar. It is
 *     called live, so `/availability` returns real site-level data even with no
 *     key configured at all.
 *
 * The fixture campgrounds deliberately carry **real** recreation.gov facility
 * ids, so an availability lookup on a fixture search result still hits live data.
 */

const RIDB_BASE = process.env.RIDB_API_BASE ?? "https://ridb.recreation.gov/api/v1";
const REC_BASE = process.env.REC_GOV_API_BASE ?? "https://www.recreation.gov/api/camps";
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 15_000);

/** recreation.gov rejects requests without a browser-ish UA. */
const USER_AGENT =
  process.env.UPSTREAM_USER_AGENT ??
  "x402-campsites/0.1 (+https://github.com/nirholas/x402-campsites)";

export class UpstreamError extends Error {}

export function ridbEnabled(): boolean {
  return Boolean(process.env.RIDB_API_KEY);
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new UpstreamError(`GET ${url} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    if ((err as Error).name === "AbortError") {
      throw new UpstreamError(`GET ${url} timed out after ${TIMEOUT_MS}ms`);
    }
    throw new UpstreamError(`GET ${url} failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** RIDB call — requires the free API key. */
export async function ridbGet(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.RIDB_API_KEY;
  if (!key) throw new UpstreamError("RIDB_API_KEY is not set");
  const qs = new URLSearchParams(params).toString();
  return getJson(`${RIDB_BASE}${path}${qs ? `?${qs}` : ""}`, { apikey: key });
}

/** recreation.gov availability call — public, no key. */
export async function recGovGet(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  return getJson(`${REC_BASE}${path}${qs ? `?${qs}` : ""}`, {});
}
