# x402-campsites

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![x402](https://img.shields.io/badge/payments-x402-0052ff.svg)](https://x402.org)
[![USDC on Base + Solana](https://img.shields.io/badge/USDC-Base%20%2B%20Solana-2775ca.svg)](https://x402.org)

Campground search and **live site-level availability** from Recreation.gov,
priced per lookup.

**Pay in USDC on Base or Solana — your client picks the rail.**

## Why x402 for this

Campsite availability is the definition of a question worth a fraction of a cent
and worthless a week later. "Is anything free at Smokemont the second weekend of
November?" has a short shelf life, no reuse value, and no business case for a
subscription — but real cost to answer, since it means fanning out across a
month-at-a-time upstream and folding the result into a date window.

x402 fits that shape exactly: the server quotes a third of a cent in the 402, the
client signs a USDC transfer and retries, and the 200 body **is** the site list.
Nothing to sign up for, nothing left over afterwards.

## Quickstart

```bash
git clone https://github.com/nirholas/x402-campsites
cd x402-campsites && npm install
cp .env.example .env            # ships with working payTo addresses — edit to get paid yourself
npm run dev                     # service at http://localhost:4025
```

**Availability needs no API key** — see [Real backend](#real-backend--api-keys).

Free campground ids:

```bash
curl -s http://localhost:4025/catalog | jq '.campgrounds[0]'
```

```json
{ "campgroundId": "232486", "name": "Smokemont Campground", "parkName": "Great Smoky Mountains National Park", "state": "NC", "totalSites": 142 }
```

First 402, no wallet needed:

```bash
curl -s "http://localhost:4025/search?state=CA" \
  | jq '.accepts[] | {network, payTo, maxAmountRequired}'
```

```json
{ "network": "base-sepolia", "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402", "maxAmountRequired": "2000" }
{ "network": "solana",       "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW", "maxAmountRequired": "2000" }
```

Two rails in one challenge — pay whichever you hold.

Full paid flow (funded Base Sepolia wallet — free USDC at [faucet.circle.com](https://faucet.circle.com)):

```bash
export PRIVATE_KEY=0x…
npm run client
```

## API

| Route | Price | What you get back |
| --- | --- | --- |
| `GET /search` | $0.002 | Campgrounds by text, state, or coordinates — location, site count, amenities, booking link |
| `GET /availability/:campgroundId` | $0.003 | Site-level availability over a date window, plus a summary of what is bookable |
| `GET /health` | free | Both data sources and their live status |
| `GET /catalog` | free | Real recreation.gov campground ids |
| `GET /.well-known/x402` | free | Machine-readable price sheet, both rails |
| `GET /skill.md` | free | Agent-facing instructions |

Search then check one campground is **$0.005**. If you already have the id from
the free catalog, it is just the **$0.003** availability lookup.

Full details: [docs/api.md](docs/api.md).

## How x402 works

1. `GET /search` with no payment → **402** + an `accepts[]` array with **one entry per rail** (price, network, payTo, USDC mint/contract).
2. The client picks a rail and signs for it — an EIP-3009 USDC transfer authorization on Base, or an SPL USDC transfer on Solana.
3. Retry with `X-PAYMENT: <base64 signed payload>`.
4. The server verifies + settles through that rail's facilitator and answers **200** with the campgrounds. The settlement receipt — tx hash plus which rail settled it — rides in the `X-PAYMENT-RESPONSE` header.

```
GET /search?…                    402  accepts: [ base-sepolia USDC , solana USDC ]
GET /search?…  X-PAYMENT: …      200  { source, campgrounds: [...] }   +  X-PAYMENT-RESPONSE
```

### Dual-rail configuration

| Rail | Default network | Mainnet switch | payTo env | Facilitator env (default) |
| --- | --- | --- | --- | --- |
| EVM (Base) | `base-sepolia` | `NETWORK=base` | `PAY_TO_ADDRESS` | `FACILITATOR_URL` (`x402.org/facilitator`) |
| Solana | `solana` | already mainnet; `SOLANA_NETWORK=devnet` for testing | `SOLANA_PAY_TO_ADDRESS` | `SOLANA_FACILITATOR_URL` (`facilitator.payai.network`) |

Facilitators are rail-specific: `x402.org` settles base-sepolia and does not
settle Solana at all, which is why the Solana rail defaults to PayAI.

Both addresses default to the x402 Suite's public receive addresses so the demo
runs with zero setup — set your own to receive funds. A rail with a missing or
malformed address is dropped from `accepts` with a warning; the other keeps
working.

## Real backend / API keys

Two upstreams, with genuinely different key requirements:

| Route | Upstream | Key needed | Fallback |
| --- | --- | --- | --- |
| `/search` | RIDB — the official Recreation Information Database | **Free** `RIDB_API_KEY` | Deterministic fixture catalog, labelled `source: "fixture"` |
| `/availability/:id` | recreation.gov availability API | **None — public and keyless** | Deterministic simulation, only if that endpoint is unreachable |

Free RIDB key at [ridb.recreation.gov/profile](https://ridb.recreation.gov/profile)
— sign in, generate a key. No card, no approval wait.

**The part that matters works with no key.** Availability comes from the same
public endpoint behind recreation.gov's own booking calendar, called live. And
the fixture catalog carries **real** recreation.gov facility ids and coordinates,
so an availability lookup on a fixture search result still returns genuine
site-level data. Without a RIDB key you lose catalog breadth — eight
well-known campgrounds instead of the full database — not live availability.

**Being honest about the fallbacks.** Two independent source fields say exactly
what you got:

- `source` — where the campground *metadata* came from (`ridb` | `fixture`).
  Fixture amenity and fee values are representative, not authoritative.
- `availabilitySource` — where the *availability* came from
  (`recreation.gov` | `fixture`). **This is the one to branch on.** `"fixture"`
  means the live endpoint was unreachable and the numbers are a deterministic
  simulation; the response `note` says so in plain language, and they must never
  be presented as bookable.

The ordinary no-key response reads `"source": "fixture"` with
`"availabilitySource": "recreation.gov"` — and that is a good response.

**This service reports availability; it does not book.** Every availability
response carries a `bookingUrl` to recreation.gov, which is where a human
finishes the reservation.

## For AI agents

- **[skill.md](skill.md)** — agent-readable instructions for every endpoint, plus budgeting notes.
- **[/.well-known/x402](public/.well-known/x402)** — machine-readable price sheet with both rails and full input/output schemas, indexable by [x402scan.com](https://x402scan.com), the x402 Bazaar, and [agentic.market](https://agentic.market). List your deployment there so agents can find it.
- **[examples/mcp-tool.md](examples/mcp-tool.md)** — expose the service as MCP tools for Claude, including the system-prompt lines that keep a model honest about `availabilitySource`.
- **[examples/agent-client.ts](examples/agent-client.ts)** — free catalog → search → live availability with `x402-fetch`.
- **[docs/agents.md](docs/agents.md)** — discovery, both payment rails, and what each artifact contains.

## Docs

Site: **https://nirholas.github.io/x402-campsites/** —
[tutorial](docs/tutorial.md) · [API reference](docs/api.md) · [for agents](docs/agents.md)

Part of the [x402 Suite](https://github.com/nirholas/x402-suite).

## Support

Questions, bugs, or listing requests: **nichxbt@gmail.com**

## License

[Apache-2.0](LICENSE)
