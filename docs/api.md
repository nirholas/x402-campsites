# API reference

Base URL: your deployment (default `http://localhost:4025`).
Machine-readable versions: [`openapi.json`](https://github.com/nirholas/x402-campsites/blob/main/openapi.json) ·
[`/.well-known/x402`](https://github.com/nirholas/x402-campsites/blob/main/public/.well-known/x402)

Paid routes speak x402: an unpaid request returns **402** with an `accepts[]`
array holding **one entry per payment rail**; retry with a signed `X-PAYMENT`
header to get **200**.

**Pay in USDC on Base or Solana — your client picks the rail.**

| Rail | Network | Asset | payTo | Facilitator |
| --- | --- | --- | --- | --- |
| EVM | `base-sepolia` (default) / `base` | USDC `0x036CbD…F7e` (sepolia) | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `x402.org/facilitator` |
| Solana | `solana` (default) / `solana-devnet` | USDC `EPjFWdd5…Dt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `facilitator.payai.network` |

Every 402 body looks like this (amounts are atomic USDC, 6 decimals):

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header required — pay in USDC on Base or Solana, your pick.",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/search",
      "description": "Campground search — location, agency, site count, amenities, and booking link",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "mimeType": "application/json", "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" } },
    { "scheme": "exact", "network": "solana", "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/search",
      "description": "Campground search — location, agency, site count, amenities, and booking link",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "mimeType": "application/json", "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "decimals": 6 } }
  ]
}
```

On success, `X-PAYMENT-RESPONSE` is base64 JSON:
`{ "success": true, "rail": "evm" | "solana", "network", "transaction", "payer" }`.

## Data sources — and the two fields that describe them

There are **two** upstreams with different key requirements, so there are two
source fields. They are independent.

| Field | Appears on | Values | Means |
| --- | --- | --- | --- |
| `source` | both routes | `"ridb"` \| `"fixture"` | Where the campground **metadata** came from |
| `availabilitySource` | `/availability` only | `"recreation.gov"` \| `"fixture"` | Where the **availability** came from |

| Route | Upstream | Key needed | Fallback |
| --- | --- | --- | --- |
| `/search` | RIDB (`ridb.recreation.gov`) | Free `RIDB_API_KEY` | Deterministic fixture catalog |
| `/availability/:id` | recreation.gov availability API | **None — keyless, live** | Deterministic simulation, only if unreachable |

**`availabilitySource` is the one that decides whether availability is real.**
A response reading `"source": "fixture"` with
`"availabilitySource": "recreation.gov"` is the normal no-key case: fixture
catalog, genuine live availability. That works because the fixture catalog
carries real recreation.gov facility ids.

`GET /health` reports both for free.

---

## GET /search — paid, $0.002

Campground search. **At least one** of `query`, `state`, or
`latitude`+`longitude` is required.

| Param | In | Required | Notes |
| --- | --- | --- | --- |
| `query` | query | one of | Free text, e.g. `Yosemite`. Alias: `q`. |
| `state` | query | one of | 2-letter state code, e.g. `CA` |
| `latitude` | query | one of | Must accompany `longitude`. Aliases: `lat`. |
| `longitude` | query | one of | Must accompany `latitude`. Aliases: `lon`, `lng`. |
| `radiusMiles` | query | no | 1–500, default 50. Only used with coordinates. Alias: `radius`. |
| `limit` | query | no | 1–50, default 10 |

```
GET /search?state=CA
```

**200**

```json
{
  "source": "fixture",
  "query": { "query": null, "state": "CA", "latitude": null, "longitude": null,
             "radiusMiles": 50, "limit": 10 },
  "count": 4,
  "campgrounds": [
    {
      "campgroundId": "232447",
      "name": "Upper Pines Campground",
      "agency": "NPS",
      "parkName": "Yosemite National Park",
      "state": "CA",
      "latitude": 37.7361111,
      "longitude": -119.5625,
      "totalSites": 235,
      "reservable": true,
      "amenities": ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "BEAR_LOCKER", "SHOWERS_NEARBY"],
      "feePerNightUsd": 36,
      "description": "Yosemite Valley's largest campground, open year-round and walking distance from Happy Isles.",
      "reservationUrl": "https://www.recreation.gov/camping/campgrounds/232447"
    }
  ],
  "note": "Fixture catalog — RIDB_API_KEY is not set. These are REAL recreation.gov facility ids, names, and coordinates, so GET /availability/:campgroundId on any of them still returns live data. The amenity and fee values are representative, not authoritative. Set RIDB_API_KEY (free) for the full live catalog.",
  "retrievedAt": "2026-08-07T03:55:00.000Z"
}
```

Field notes:

- `campgroundId` is the recreation.gov facility id — the input to `/availability`.
- `feePerNightUsd` is **`null` on live RIDB**: RIDB does not publish a single
  nightly fee on the facility record. Fixture entries carry a representative fee.
- `amenities` on live RIDB are derived from the facility's activity list and are
  upper-snake-cased.
- Coordinate search filters by great-circle distance and sorts nearest first.

**Errors**

| Status | Case |
| --- | --- |
| 400 | No criteria given; `state` not 2 letters; only one of latitude/longitude; coordinates out of range |
| 402 | No/invalid payment — body carries `accepts[]` for both rails |
| 502 | RIDB upstream error (live mode only) |

---

## GET /availability/:campgroundId — paid, $0.003

Site-level availability over a date window.

| Param | In | Required | Notes |
| --- | --- | --- | --- |
| `campgroundId` | path | yes | Numeric recreation.gov facility id, e.g. `232486` |
| `startDate` | query | no | `YYYY-MM-DD`, defaults to today. Alias: `start`. |
| `endDate` | query | no | `YYYY-MM-DD`, defaults to `startDate + 3`. Max 31 nights. Alias: `end`. |
| `limit` | query | no | 1–300 sites, default 50 |

```
GET /availability/232486?startDate=2026-11-10&endDate=2026-11-13
```

**200**

```json
{
  "source": "fixture",
  "availabilitySource": "recreation.gov",
  "campgroundId": "232486",
  "campground": {
    "campgroundId": "232486",
    "name": "Smokemont Campground",
    "parkName": "Great Smoky Mountains National Park",
    "state": "NC",
    "totalSites": 142
  },
  "window": { "startDate": "2026-11-10", "endDate": "2026-11-13", "nights": 3 },
  "summary": {
    "totalSites": 142,
    "sitesWithAnyAvailability": 37,
    "sitesAvailableWholeWindow": 31,
    "firstFullyAvailableDate": "2026-11-10"
  },
  "sites": [
    {
      "campsiteId": "3251",
      "site": "B006",
      "loop": "Loop B & C",
      "siteType": "STANDARD NONELECTRIC",
      "reserveType": "Site-Specific",
      "nightsAvailable": 3,
      "fullWindowAvailable": true,
      "days": [
        { "date": "2026-11-10", "status": "available" },
        { "date": "2026-11-11", "status": "available" },
        { "date": "2026-11-12", "status": "available" }
      ]
    }
  ],
  "bookingUrl": "https://www.recreation.gov/camping/campgrounds/232486",
  "note": "Live site-level availability from recreation.gov — the same data behind the site's own booking calendar. This endpoint is public and needs no API key. Availability moves fast; re-check before relying on it.",
  "retrievedAt": "2026-08-07T03:55:00.000Z"
}
```

Field notes:

- **`availabilitySource`** — `"recreation.gov"` is live and real.
  `"fixture"` means the live endpoint was unreachable and the figures are a
  deterministic simulation. The `note` says so explicitly. Do not present
  simulated availability as bookable.
- `days[].status` is `available` | `reserved` | `not-available` |
  `not-reservable` | `unknown`.
- Sites are sorted whole-window-available first, then by nights available.
- `window.nights` is checkout minus checkin, so a 3-night window covers 3 dates
  and the last `days` entry is the night before `endDate`.
- `campground` is `null` when the id is outside the fixture catalog and RIDB is
  not configured — availability still works, you just get no metadata.
- The service queries recreation.gov a calendar month at a time and merges the
  months your window spans.
- **This route does not book.** `bookingUrl` is where a human reserves.

**Errors**

| Status | Case |
| --- | --- |
| 400 | Non-numeric `campgroundId`; `endDate` not after `startDate`; window over 31 nights; malformed dates |
| 402 | No/invalid payment |
| 502 | Upstream error |

---

## GET /health — free

```json
{
  "ok": true,
  "service": "x402-campsites",
  "searchSource": "fixture",
  "availabilitySource": "recreation.gov (public, keyless — called live)",
  "rails": ["base-sepolia", "solana"]
}
```

## GET /catalog — free

The fixture catalog's campground ids. They are **real** recreation.gov facility
ids, so you can go straight to a live availability lookup without paying for a
search. Any numeric recreation.gov facility id works on `/availability`, not just
these.

```json
{ "campgroundId": "232486", "name": "Smokemont Campground", "parkName": "Great Smoky Mountains National Park", "state": "NC", "totalSites": 142 }
```

## GET /.well-known/x402 — free

The x402 discovery manifest: every paid resource with its price, both networks,
an `accepts[]` preview of the live challenge, and input/output schemas.
Index-ready for x402scan.com, the x402 Bazaar, and agentic.market.

## GET /skill.md — free

The agent-facing instruction file, served from the running host.
