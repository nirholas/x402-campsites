# For AI agents

How an autonomous agent discovers this service, pays, and what it gets back.

## Discovery

Three artifacts are published for machines:

1. **[`skill.md`](https://github.com/nirholas/x402-campsites/blob/main/skill.md)**
   (repo root, also served at `{BASE_URL}/skill.md`) — plain-language
   instructions an LLM can read directly: endpoints, prices, params, response
   schemas, error codes, and budgeting notes.
2. **`{BASE_URL}/.well-known/x402`** — the machine-readable price sheet
   (`x402Version`, `resources[]` with price/networks/asset/input+outputSchema).
   Each resource carries an `accepts[]` array listing **both rails**, so a
   budgeting agent knows before it spends whether it can pay from its Base
   balance, its Solana balance, or either. Registries like
   [x402scan.com](https://x402scan.com), the **x402 Bazaar**, and
   [agentic.market](https://agentic.market) index this format — submit your
   deployment URL there so agents find you without prior knowledge.
3. **`openapi.json`** (OpenAPI 3.1, including the 402 response schema) for
   codegen-style clients.

## Paying — two rails, your pick

Every paid route answers an unpaid request with a 402 whose `accepts[]` array
holds one payment-requirements object per rail:

| Rail | Network | Asset | payTo | Facilitator |
| --- | --- | --- | --- | --- |
| EVM | `base-sepolia` (or `base`) | USDC | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `x402.org/facilitator` |
| Solana | `solana` (or `solana-devnet`) | USDC | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `facilitator.payai.network` |

Match on `network`, sign for that chain, and retry with `X-PAYMENT`. The price,
the route, and the returned artifact are identical either way.

### EVM with `x402-fetch`

```ts
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const payFetch = wrapFetchWithPayment(fetch, privateKeyToAccount(process.env.PRIVATE_KEY), 50_000n);
const res = await payFetch(
  "https://campsites.example.com/availability/232486?startDate=2026-11-10&endDate=2026-11-13",
);
const { availabilitySource, summary, sites } = await res.json();   // delivered now
```

The wrapper handles 402 → sign EIP-3009 USDC authorization → retry. The third
argument caps spend in atomic units: `50_000n` refuses anything over $0.05.

### Solana

```ts
const res = await fetch(url);                        // 402
const { accepts } = await res.json();
const sol = accepts.find(a => a.network.startsWith("solana"));

// Build an SPL USDC transfer of `sol.maxAmountRequired` (atomic, 6 decimals)
// to `sol.payTo` for the mint in `sol.asset`, sign it, and wrap it:
const header = Buffer.from(JSON.stringify({
  x402Version: 1, scheme: "exact", network: sol.network,
  payload: { transaction: signedTxBase64 },
})).toString("base64");

const paid = await fetch(url, { headers: { "X-PAYMENT": header } });
const artifact = await paid.json();
```

If `extra.feePayer` is present on the Solana accept, that sponsor account pays
the SOL network fee — the caller needs only USDC.

## Check `/catalog` before paying for a search

`GET /catalog` is free and returns real recreation.gov facility ids for the
popular parks. If the campground you want is there, skip `/search` and pay only
the $0.003 availability lookup.

## What you get back

- **`/search`** — campgrounds with location, agency, park, site count, amenity
  codes, a nightly fee where available, and a booking link.
- **`/availability/:id`** — a per-site breakdown (`site`, `loop`, `siteType`,
  and a day-by-day status array) plus a summary: how many sites have any
  availability, how many are free the whole window, and the first date with an
  opening. Sorted whole-window-available first.
- The USDC settlement receipt is in the `X-PAYMENT-RESPONSE` response header —
  base64 JSON with `rail` (`evm` | `solana`), `network`, `transaction`, and
  `payer`. Decode with `decodeXPaymentResponse` from `x402-fetch`, or
  `JSON.parse(atob(header))`.

Nothing here is a job you come back for. Every paid response contains the thing
you bought.

## The one field that decides whether availability is real

**`availabilitySource`**, not `source`. They are different fields and they can
disagree:

| `availabilitySource` | Meaning |
| --- | --- |
| `"recreation.gov"` | Real live availability from the endpoint behind recreation.gov's own booking calendar |
| `"fixture"` | That endpoint was unreachable. The numbers are a **deterministic simulation** — never tell a user a site is bookable |

`source` only describes where the campground *metadata* came from (`ridb` or
`fixture`). The ordinary no-key configuration produces
`"source": "fixture"` with `"availabilitySource": "recreation.gov"` — fixture
catalog, genuine live availability — because the fixture entries carry real
facility ids.

Branch on `availabilitySource`. Getting this backwards is the one way this
service can make an agent confidently wrong.

## This service reports; it does not book

There is no reservation endpoint. Every availability response carries a
`bookingUrl` pointing at recreation.gov, and that is where a human completes the
booking. An agent should hand over the link, never imply it has held a site.

Availability also moves fast — campsite inventory turns over in minutes during
release windows. Cite `retrievedAt` rather than presenting a result as durable.

## Budgeting

- `/catalog` and `/health`: **free**.
- Search: **$0.002**.
- Availability for one campground: **$0.003**.
- The runaway pattern is a sweep — checking ten campgrounds is $0.03 and reads as
  one user request. Narrow with `/search` first, and bound the fan-out in your
  agent rather than relying on a per-call spend cap.
- Read `maxAmountRequired` from the 402 rather than hardcoding prices, so an
  operator's repricing never surprises you.

## MCP integration

To give Claude these abilities as tools (`campground_catalog`,
`search_campgrounds`, `check_availability`, plus a free `service_info`), see
[`examples/mcp-tool.md`](https://github.com/nirholas/x402-campsites/blob/main/examples/mcp-tool.md) —
a complete MCP server plus the `claude_desktop_config.json` entry and the
system-prompt lines that keep a model honest about `availabilitySource`.

## Operator checklist for agent traffic

- Keep `/.well-known/x402` accurate — agents budget from it before paying, and it
  must list both rails if you accept both.
- Keep both `PAY_TO_ADDRESS` and `SOLANA_PAY_TO_ADDRESS` set unless you mean to
  turn a rail off; dropping one halves the wallets that can pay you.
- Get the free `RIDB_API_KEY` so search covers the full catalog rather than the
  eight-campground fixture set.
- Set a real `UPSTREAM_USER_AGENT`. The recreation.gov availability endpoint is
  public but not contractual — keep request volume sane and stay reachable.
- Set `PUBLIC_BASE_URL` in production so the `resource` in your 402 matches your
  real URL.
- List the deployment on x402scan.com / the x402 Bazaar / agentic.market.

Questions or listing help: **nichxbt@gmail.com**
