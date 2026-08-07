# Tutorial: from clone to your first paid campsite lookup

Install → env → run → first 402 → paid call → reading the artifact → mainnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-campsites
cd x402-campsites
npm install
```

Requires Node 18+.

## 2. Configure

```bash
cp .env.example .env
```

`.env.example` ships with working defaults for **both payment rails**, so the
service runs immediately. Change these two to receive funds yourself:

```
# EVM (Base / Base Sepolia) USDC receive address
PAY_TO_ADDRESS=0x40252CFDF8B20Ed757D61ff157719F33Ec332402
# Solana USDC receive address
SOLANA_PAY_TO_ADDRESS=WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
```

Every paid route offers both rails and the caller picks. If you only want one,
delete the other address — that rail is dropped from the 402 challenge with a
warning, and the remaining rail keeps working.

### Campground data: one key, and one endpoint that needs none

```
RIDB_API_KEY=
```

| Route | Upstream | Key |
| --- | --- | --- |
| `/search` | RIDB — the official Recreation Information Database | **Free key.** Without it, a deterministic fixture catalog labelled `source: "fixture"`. |
| `/availability/:id` | recreation.gov availability API | **None.** Public and keyless, called live. |

Get a free RIDB key at [ridb.recreation.gov/profile](https://ridb.recreation.gov/profile)
— sign in, then "Generate API key". No card, no approval wait.

The important part: **availability works with no key at all**, because the
endpoint behind recreation.gov's own booking calendar is public. And the fixture
catalog uses **real** recreation.gov facility ids, so an availability lookup on a
fixture search result still returns genuine data. Without a key you lose catalog
breadth, not the live availability.

## 3. Run the server

```bash
npm run dev
```

The startup banner shows both rails and both data sources:

```
  Payment rails (USDC — the client picks):
    evm    base-sepolia   USDC → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402  via https://x402.org/facilitator
    solana solana         USDC → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW  via https://facilitator.payai.network

  Search source:       fixture catalog — set RIDB_API_KEY (free) for the full live catalog
  Availability source: recreation.gov (public, keyless) — called live

  Paid routes (x402, USDC on Base or Solana):
    GET /search                      $0.002  campgrounds + amenities
    GET /availability/:campgroundId  $0.003  site-level availability
```

## 4. Free campground ids

```bash
curl -s http://localhost:4025/catalog | jq '.campgrounds[]'
```

```json
{ "campgroundId": "232486", "name": "Smokemont Campground", "parkName": "Great Smoky Mountains National Park", "state": "NC", "totalSites": 142 }
```

These are real facility ids, free to fetch. If you already know the campground
you want, skip the paid search entirely.

## 5. Your first 402

```bash
curl -s "http://localhost:4025/search?state=CA" \
  | jq '.accepts[] | {network, asset, payTo, maxAmountRequired}'
```

```json
{
  "network": "base-sepolia",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
  "maxAmountRequired": "2000"
}
{
  "network": "solana",
  "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
  "maxAmountRequired": "2000"
}
```

`HTTP/1.1 402 Payment Required` with an `accepts[]` array holding **one entry per
rail** — price in atomic USDC (6 decimals, so `2000` = $0.002), the network, the
`payTo` address, and the USDC contract or mint.

## 6. A paid call

### Base (EVM)

You need a wallet with Base Sepolia USDC (free from the
[Circle faucet](https://faucet.circle.com)). Base Sepolia ETH is **not** needed —
x402 uses gasless EIP-3009 transfers.

```bash
export PRIVATE_KEY=0xYourTestKey
npm run client
```

`examples/agent-client.ts` reads the free catalog, searches NC ($0.002), checks
live site availability at the first result ($0.003), and prints the decoded
`X-PAYMENT-RESPONSE` settlement receipt. Half a cent total.

### Solana

Pick the `solana` entry from `accepts[]` instead, sign an SPL USDC transfer to
its `payTo`, and send the same base64 `X-PAYMENT` envelope. Any Solana-capable
x402 client does this. Both rails end at the same 200 and the same artifact —
only `X-PAYMENT-RESPONSE` differs, naming the rail that settled.

## 7. Reading the artifacts

### `/search`

```json
{
  "source": "fixture",
  "count": 4,
  "campgrounds": [
    {
      "campgroundId": "232447",
      "name": "Upper Pines Campground",
      "agency": "NPS",
      "parkName": "Yosemite National Park",
      "state": "CA",
      "latitude": 37.7361111, "longitude": -119.5625,
      "totalSites": 235,
      "reservable": true,
      "amenities": ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "BEAR_LOCKER", "SHOWERS_NEARBY"],
      "feePerNightUsd": 36,
      "reservationUrl": "https://www.recreation.gov/camping/campgrounds/232447"
    }
  ]
}
```

`campgroundId` is the recreation.gov facility id and the input to the next call.
On live RIDB, `feePerNightUsd` is `null` — RIDB does not publish a single nightly
fee on the facility record.

### `/availability/:campgroundId`

```json
{
  "source": "fixture",
  "availabilitySource": "recreation.gov",
  "campgroundId": "232486",
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
  "bookingUrl": "https://www.recreation.gov/camping/campgrounds/232486"
}
```

Look at those two source fields, because they are independent:

- **`availabilitySource`** — `"recreation.gov"` means the availability is real
  and live. `"fixture"` means that endpoint was unreachable and the numbers are a
  deterministic simulation; the `note` says so in plain language, and you must
  not present them as bookable.
- **`source`** — where the campground *metadata* came from. `"fixture"` here is
  harmless and common.

The response above is the normal case: fixture catalog, live availability.

Sites are sorted with whole-window availability first. `window.nights` is
checkout minus checkin, so a 3-night window covers 3 dates.

**This service does not book.** `bookingUrl` is where a human finishes the
reservation.

## 8. Going to mainnet

```
NETWORK=base                     # EVM rail: base-sepolia -> base mainnet
SOLANA_NETWORK=mainnet-beta      # Solana rail (already the default)
FACILITATOR_URL=https://your-mainnet-facilitator.example   # EVM rail
SOLANA_FACILITATOR_URL=https://facilitator.payai.network    # Solana rail (default)
PUBLIC_BASE_URL=https://campsites.example.com
RIDB_API_KEY=<free key>
UPSTREAM_USER_AGENT=your-service/1.0 (+https://your-domain.example)
```

- Facilitators are rail-specific. `FACILITATOR_URL` must settle Base mainnet
  (e.g. Coinbase CDP's x402 facilitator); `SOLANA_FACILITATOR_URL` must settle
  Solana and defaults to PayAI (`https://facilitator.payai.network`), since
  x402.org does not settle Solana at all.
- `PAY_TO_ADDRESS` and `SOLANA_PAY_TO_ADDRESS` now receive real USDC.
- `PUBLIC_BASE_URL` makes the `resource` field in your 402 quotes match your
  public URL — agents and facilitators check it.
- Set a real `UPSTREAM_USER_AGENT` identifying your deployment. recreation.gov's
  availability endpoint is public but not contractual; be a good citizen, keep
  request volume sane, and be reachable if its operators need to contact you.
- Get the free `RIDB_API_KEY` so search covers the full catalog rather than the
  eight-campground fixture set.

## Where to next

- [API reference](api.md)
- [For AI agents](agents.md) — discovery, MCP, listings
- [examples/curl.md](https://github.com/nirholas/x402-campsites/blob/main/examples/curl.md) — the raw wire flow
