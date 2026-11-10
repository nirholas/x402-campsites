---
name: campsite-search-api
description: Search campgrounds and check site-level availability over a date window through a self-hosted x402-campsites server backed by Recreation.gov. Use when an agent plans a camping trip and needs real availability.
---

# x402-campsites

Campground search uses the official RIDB API (free `RIDB_API_KEY`; without it a
fixture catalog is used and responses say `source: "fixture"`). Availability
calls the keyless recreation.gov availability API live and reports
`availabilitySource`. The fixture catalog uses real facility ids, so
availability for a fixture result is still live data.

## Run the server

It is a self-hosted Node server (Express, Node 18 or newer). Run it from a clone:

```bash
git clone https://github.com/nirholas/x402-campsites && cd x402-campsites
npm install
cp .env.example .env     # then adjust; see the comments in the file
npm run dev              # tsx src/server.ts, listens on PORT (default 4025)
```

`npm run build` then `npm start` runs the compiled server. `npm run client`
runs `examples/agent-client.ts`, a reference paying client. Set `PAY_TO_ADDRESS`
and `SOLANA_PAY_TO_ADDRESS` to your own wallets to be paid yourself.

Upstream settings: `RIDB_API_KEY`, `RIDB_API_BASE`, `REC_GOV_API_BASE`,
`UPSTREAM_USER_AGENT`, `UPSTREAM_TIMEOUT_MS`.

## Routes

| Route | Price | Notes |
| --- | --- | --- |
| `GET /search` | $0.002 | one of `query` (alias `q`), `state` (2 letters), or `latitude` plus `longitude`; optional `radiusMiles` 1 to 500 (default 50), `limit` 1 to 50 (default 10) |
| `GET /availability/:campgroundId` | $0.003 | numeric facility id; optional `startDate` (YYYY-MM-DD, default today), `endDate` (default start + 3, max 31 nights), `limit` 1 to 300 (default 50) |
| `GET /catalog` | free | known campgrounds with ids, use it to avoid a paid search |
| `GET /health`, `GET /skill.md`, `GET /.well-known/x402` | free | |

Day status is `available`, `reserved` or `not-available`. Errors: 400 for
missing criteria, malformed state or coordinates, a non-numeric id, `endDate`
not after `startDate`, or a window over 31 nights; 502 on an upstream error in
live search.

## Example

```bash
curl -s http://localhost:4025/catalog
curl -i "http://localhost:4025/availability/232486?startDate=2026-09-04&endDate=2026-09-07"   # 402 first
```

## Paying (x402)

Paid routes follow the x402 protocol. An unpaid call returns HTTP 402 with an
`accepts` array listing USDC on Base and USDC on Solana. Sign for one rail,
retry with the base64 payload in the `X-PAYMENT` header, and the 200 body
carries the result; the settlement receipt is in the `X-PAYMENT-RESPONSE`
header. Clients: `x402-fetch` (EVM), `@three-ws/x402-payment-modal` (browser,
both rails), or any x402 client. The rail networks are chosen by `NETWORK`
(EVM, `base-sepolia` by default) and `SOLANA_NETWORK` in `.env`; see
`.env.example`. Settlement moves real USDC on the chosen network: show the user
the recipient, amount and network and get an explicit yes before every paid call.
