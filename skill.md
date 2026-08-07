# x402-campsites — agent skill

Campground search and site-level availability from Recreation.gov, priced per
lookup. Find campgrounds by text, state, or coordinates, then ask which
individual sites are free over a date window — each as a single paid HTTP call
with the answer in the response body. No account, no booking session: you pay a
fifth of a cent in USDC over the x402 protocol.

**Two upstreams, two different honesty rules — read the source fields:**

| Route | Upstream | Key needed | Fallback |
| --- | --- | --- | --- |
| `/search` | RIDB (official Recreation Information Database) | Free `RIDB_API_KEY` | Fixture catalog, labelled `source: "fixture"` |
| `/availability/:id` | recreation.gov availability API | **None — keyless, called live** | Only if that endpoint is unreachable, and `availabilitySource` says `"fixture"` |

The fixture catalog carries **real recreation.gov facility ids**, so an
availability lookup on a fixture search result still returns live data.

**Base URL**: `{BASE_URL}` (e.g. `http://localhost:4025` when self-hosted)

Machine-readable price sheet: `{BASE_URL}/.well-known/x402`

## Endpoints

### GET /search — $0.002
Campground search. **At least one** of `query`, `state`, or
`latitude`+`longitude` is required.

| Param | Required | Notes |
| --- | --- | --- |
| `query` | one of | Free text, e.g. `Yosemite`. Alias: `q`. |
| `state` | one of | 2-letter state code, e.g. `CA` |
| `latitude` + `longitude` | one of | Must be supplied together |
| `radiusMiles` | no | 1–500, default 50. Only used with coordinates. |
| `limit` | no | 1–50, default 10 |

```
GET /search?state=CA
```

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

Keep `campgroundId` — it is the recreation.gov facility id and the input to the
availability call. On live RIDB, `feePerNightUsd` is `null`: RIDB does not
publish a single nightly fee on the facility record.

### GET /availability/:campgroundId — $0.003
Site-level availability over a date window.

| Param | Required | Notes |
| --- | --- | --- |
| `campgroundId` | yes (path) | Numeric recreation.gov facility id, e.g. `232486` |
| `startDate` | no | `YYYY-MM-DD`, defaults to today |
| `endDate` | no | `YYYY-MM-DD`, defaults to `startDate + 3`. Max 31 nights. |
| `limit` | no | 1–300 sites, default 50 |

```
GET /availability/232486?startDate=2026-11-10&endDate=2026-11-13
```

```json
{
  "source": "fixture",
  "availabilitySource": "recreation.gov",
  "campgroundId": "232486",
  "campground": { "name": "Smokemont Campground", "parkName": "Great Smoky Mountains National Park", "state": "NC" },
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

How to read it:

- **`availabilitySource` is the field that matters.** `"recreation.gov"` means
  real live availability. `"fixture"` means that endpoint was unreachable and the
  numbers are a deterministic simulation — **never present those as bookable**.
  Note that `source` is a *different* field describing where the campground
  metadata came from; it can say `"fixture"` while availability is fully live.
- Sites are sorted with whole-window availability first, then by nights free.
- `days[].status` is `available` | `reserved` | `not-available` |
  `not-reservable` | `unknown`.
- `window.nights` is checkout minus checkin, so a 3-night window covers 3 dates.
- This service **does not book**. `bookingUrl` is where a human completes the
  reservation.

### GET /health, GET /catalog — free
`/health` reports both data sources. `/catalog` lists the fixture catalog's real
facility ids so you can go straight to a live availability lookup without paying
for a search first.

## Payment

**Pay in USDC on Base or Solana — your client picks the rail.**

- Protocol: **x402** (HTTP 402 → signed USDC authorization → retry with `X-PAYMENT`)
- Asset: **USDC** on both rails
- Facilitators are rail-specific: `https://x402.org/facilitator` settles the EVM
  rail (override: `FACILITATOR_URL`), `https://facilitator.payai.network` settles
  the Solana rail (override: `SOLANA_FACILITATOR_URL`)

| Rail | Network | payTo |
| --- | --- | --- |
| EVM | `base-sepolia` (default) or `base` via `NETWORK=base` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` |
| Solana | `solana` (default) or `solana-devnet` via `SOLANA_NETWORK=devnet` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` |

The first unpaid request returns `402` with an `accepts[]` array holding **one
entry per rail**. Pick either, sign for that network, and retry with
`X-PAYMENT: <base64 payload>`:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header required — pay in USDC on Base or Solana, your pick.",
  "accepts": [
    { "scheme": "exact", "network": "base-sepolia", "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/search", "mimeType": "application/json" },
    { "scheme": "exact", "network": "solana", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/search", "mimeType": "application/json" }
  ]
}
```

`maxAmountRequired` is atomic USDC (6 decimals): `2000` = $0.002. The settlement
receipt — including which rail settled it — arrives in the `X-PAYMENT-RESPONSE`
response header.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | No search criteria given; malformed `state`/coordinates; non-numeric `campgroundId`; `endDate` not after `startDate`; window over 31 nights |
| 402 | Payment required or payment invalid — body carries `accepts[]` for both rails |
| 404 | Not found |
| 502 | Upstream error (RIDB in live search mode) |

## Budgeting notes for agents

- `GET /catalog` is free and gives you real campground ids. If you already know
  the campground, skip `/search` entirely and pay only the $0.003 availability
  lookup.
- Search then check one campground: $0.005.
- Checking N campgrounds costs $0.003 each — narrow with `/search` first rather
  than sweeping.
- Availability moves fast. A result minutes old may already be stale; that is a
  property of campsite inventory, not of this API.
- Read `maxAmountRequired` from the 402 rather than hardcoding, so an operator's
  repricing never surprises you.

Discovery: this file (`skill.md`, also served at `{BASE_URL}/skill.md`) +
[`/.well-known/x402`]({BASE_URL}/.well-known/x402) + `openapi.json`.

Contact: nichxbt@gmail.com
