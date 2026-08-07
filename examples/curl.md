# Raw x402 flow with curl

Exactly what happens on the wire: 402 → pay → 200.

## 1. Free routes first

```bash
curl -s http://localhost:4025/health | jq
curl -s http://localhost:4025/catalog | jq '.campgrounds[] | {campgroundId, name, state}'
```

```json
{ "campgroundId": "232486", "name": "Smokemont Campground", "state": "NC" }
```

`/catalog` gives you **real** recreation.gov facility ids for free. If you
already know which campground you want, skip the paid search and go straight to
availability.

## 2. Hit a paid route without payment → HTTP 402

```bash
curl -si "http://localhost:4025/search?state=CA" | head -40
```

You get `402 Payment Required` and a JSON body with **one payment-requirements
object per rail** — Base and Solana:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header required — pay in USDC on Base or Solana, your pick.",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/search",
      "description": "Campground search — location, agency, site count, amenities, and booking link",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": { "name": "USDC", "version": "2" }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "2000",
      "resource": "http://localhost:4025/search",
      "description": "Campground search — location, agency, site count, amenities, and booking link",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": { "name": "USDC", "decimals": 6 }
    }
  ]
}
```

`maxAmountRequired` is atomic USDC (6 decimals): `2000` = $0.002 — the same price
on either rail. Filter to the rail you can pay:

```bash
curl -s "http://localhost:4025/search?state=CA" \
  | jq '.accepts[] | select(.network | startswith("solana"))'
```

## 3. Pay

The `X-PAYMENT` header is base64 JSON wrapping a signature for the rail you
picked — an EIP-3009 USDC transfer authorization on Base, or a signed SPL USDC
transfer on Solana. Neither is practical to produce with curl alone, so use the
bundled client, which does the 402 → sign → retry loop for you (EVM rail):

```bash
export PRIVATE_KEY=0x…   # funded Base Sepolia wallet (https://faucet.circle.com)
npm run client
```

Under the hood it re-sends the same request as:

```bash
curl -s "http://localhost:4025/search?state=CA" \
  -H "X-PAYMENT: <base64 signed payment payload>"
```

The envelope it base64-encodes looks like this — swap `network` and the payload
shape to settle on Solana instead:

```json
{ "x402Version": 1, "scheme": "exact", "network": "base-sepolia",
  "payload": { "signature": "0x…", "authorization": { "from": "0x…", "to": "0x40252C…", "value": "2000", "…": "…" } } }
```

```json
{ "x402Version": 1, "scheme": "exact", "network": "solana",
  "payload": { "transaction": "<base64 signed SPL transfer>" } }
```

The server reads `network`, matches it to the rail you were quoted, then verifies
and settles through that rail's facilitator — `x402.org` for Base, PayAI for
Solana.

## 4. HTTP 200 with the artifact and settlement receipt

The 200 body is the campgrounds themselves. The `X-PAYMENT-RESPONSE` header is
the base64 settlement receipt:

```bash
curl -si … | grep -i x-payment-response | cut -d' ' -f2 | base64 -d | jq
```

```json
{ "success": true, "rail": "solana", "network": "solana",
  "transaction": "5v8…", "payer": "9xQ…" }
```

`rail` tells you which chain settled it.

## 5. Reading a search result

```bash
curl -s "http://localhost:4025/search?state=CA" -H "X-PAYMENT: <base64 payload>" \
  | jq '{source, count, first: .campgrounds[0] | {campgroundId, name, parkName, totalSites, amenities}}'
```

```json
{
  "source": "fixture",
  "count": 4,
  "first": {
    "campgroundId": "232447",
    "name": "Upper Pines Campground",
    "parkName": "Yosemite National Park",
    "totalSites": 235,
    "amenities": ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "BEAR_LOCKER", "SHOWERS_NEARBY"]
  }
}
```

`source: "fixture"` means `RIDB_API_KEY` is unset. Those `campgroundId` values
are still **real** recreation.gov facility ids, so step 6 returns live data
regardless.

## 6. Site-level availability ($0.003)

```bash
curl -s "http://localhost:4025/availability/232486?startDate=2026-11-10&endDate=2026-11-13" \
  -H "X-PAYMENT: <base64 payload>" \
  | jq '{availabilitySource, window, summary, first: .sites[0]}'
```

```json
{
  "availabilitySource": "recreation.gov",
  "window": { "startDate": "2026-11-10", "endDate": "2026-11-13", "nights": 3 },
  "summary": {
    "totalSites": 142,
    "sitesWithAnyAvailability": 37,
    "sitesAvailableWholeWindow": 31,
    "firstFullyAvailableDate": "2026-11-10"
  },
  "first": {
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
}
```

Just the sites free for the entire window:

```bash
curl -s "http://localhost:4025/availability/232486?startDate=2026-11-10&endDate=2026-11-13" \
  -H "X-PAYMENT: <base64 payload>" \
  | jq '[.sites[] | select(.fullWindowAvailable) | {site, loop, siteType}]'
```

## 7. The field that decides whether to trust it

`availabilitySource` — not `source`:

| Field | Says |
| --- | --- |
| `availabilitySource: "recreation.gov"` | Real live availability |
| `availabilitySource: "fixture"` | The live endpoint was unreachable; the numbers are a deterministic **simulation**. Do not present them as bookable. |
| `source` | Where the campground *metadata* came from (`ridb` or `fixture`). Independent of the above. |

A response can legitimately read `"source": "fixture"` with
`"availabilitySource": "recreation.gov"` — fixture catalog, live availability.

## 8. Booking

This service reports availability; it does not reserve anything. `bookingUrl` in
the response is where a human completes the reservation:

```
https://www.recreation.gov/camping/campgrounds/232486
```
