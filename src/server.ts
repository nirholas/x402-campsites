/**
 * x402-campsites — campground search and availability from Recreation.gov,
 * priced per lookup.
 *
 * Free routes:  GET /health, GET /catalog, GET /.well-known/x402, GET /skill.md
 * Paid routes:  GET /search                     $0.002  campgrounds + amenities
 *               GET /availability/:campgroundId $0.003  site-level availability
 *
 * Every paid route returns the purchased artifact in the 200 body.
 */
import "dotenv/config";
import express from "express";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRails, describeRails, paywall, type RoutePrices } from "./payments.js";
import { UpstreamError, ridbEnabled } from "./ridb.js";
import { fixtureCampgrounds } from "./fixtures.js";
import {
  BadRequestError,
  NotFoundError,
  availability,
  parseSearchParams,
  parseWindow,
  searchCampgrounds,
} from "./service.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rails = buildRails();

const PRICES = { search: "$0.002", availability: "$0.003" } as const;

const routePrices: RoutePrices = {
  "GET /search": {
    price: PRICES.search,
    description: "Campground search — location, agency, site count, amenities, and booking link",
    mimeType: "application/json",
  },
  "GET /availability/:campgroundId": {
    price: PRICES.availability,
    description:
      "Site-level availability for a campground over a date window, plus a summary of what is bookable",
    mimeType: "application/json",
  },
};

const app = express();
app.use(express.json());

/** Dual-rail paywall — pay in USDC on Base or Solana, the client picks. */
app.use(paywall(routePrices, rails));

// ————— Free routes —————

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-campsites",
    searchSource: ridbEnabled() ? "ridb" : "fixture",
    availabilitySource: "recreation.gov (public, keyless — called live)",
    rails: rails.map((r) => r.network),
  });
});

/**
 * Free: the fixture catalog's campground ids. These are real recreation.gov
 * facility ids, so a caller can go straight to a live availability lookup
 * without paying for a search first.
 */
app.get("/catalog", (_req, res) => {
  res.json({
    note: "Real recreation.gov facility ids. Availability lookups on these return live data even when search is in fixture mode. Any numeric recreation.gov facility id works, not just these.",
    searchSource: ridbEnabled() ? "ridb" : "fixture",
    campgrounds: fixtureCampgrounds().map((c) => ({
      campgroundId: c.campgroundId,
      name: c.name,
      parkName: c.parkName,
      state: c.state,
      totalSites: c.totalSites,
    })),
  });
});

// ————— Paid routes —————

app.get("/search", async (req, res) => {
  try {
    const params = parseSearchParams(req.query as Record<string, unknown>);
    res.json(await searchCampgrounds(params));
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/availability/:campgroundId", async (req, res) => {
  try {
    const window = parseWindow(req.query as Record<string, unknown>);
    const limit = clamp(Number(req.query.limit ?? 50) || 50, 1, 300);
    res.json(await availability(req.params.campgroundId, window, limit));
  } catch (err) {
    handleError(err, res);
  }
});

// ————— Discovery —————

app.get("/.well-known/x402", (_req, res) => {
  res.type("application/json").sendFile(join(ROOT, "public", ".well-known", "x402"));
});
app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").sendFile(join(ROOT, "skill.md"));
});
app.use(express.static(join(ROOT, "public")));

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function handleError(err: unknown, res: express.Response): void {
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: "bad_request", message: err.message });
  } else if (err instanceof NotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
  } else if (err instanceof UpstreamError) {
    console.error(err);
    res.status(502).json({ error: "upstream_error", message: err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
}

const port = Number(process.env.PORT ?? 4025);
app.listen(port, () => {
  console.log(`\nx402-campsites listening on http://localhost:${port}\n`);
  console.log("  Payment rails (USDC — the client picks):");
  for (const line of describeRails(rails)) console.log(`    ${line}`);
  console.log(
    `\n  Search source:       ${
      ridbEnabled()
        ? "RIDB (live) — RIDB_API_KEY detected"
        : 'fixture catalog — set RIDB_API_KEY (free) for the full live catalog; responses are labelled source:"fixture"'
    }`,
  );
  console.log("  Availability source: recreation.gov (public, keyless) — called live\n");
  console.log("  Free routes:");
  console.log("    GET /health              service + data sources");
  console.log("    GET /catalog             real campground ids to try");
  console.log("    GET /.well-known/x402    machine-readable price sheet");
  console.log("    GET /skill.md            agent instructions\n");
  console.log("  Paid routes (x402, USDC on Base or Solana):");
  console.log(`    GET /search                      ${PRICES.search}  campgrounds + amenities`);
  console.log(`    GET /availability/:campgroundId  ${PRICES.availability}  site-level availability\n`);
});
