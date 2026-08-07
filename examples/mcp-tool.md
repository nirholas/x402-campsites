# Exposing x402-campsites as an MCP tool for Claude

Any MCP server can wrap this service so Claude (or another MCP client) can find
campgrounds and check site availability with a funded wallet. The pattern: one
tool per route, `x402-fetch` for payment, the artifact returned as the tool
result.

The service is dual-rail — every 402 quotes USDC on **Base** and on **Solana**.
`x402-fetch` settles the EVM rail, which is what this server uses; swap in a
Solana x402 client if your agent's wallet holds USDC there instead. Nothing else
changes: same routes, same prices, same artifacts.

## Minimal MCP server (TypeScript)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.CAMPSITES_URL ?? "http://localhost:4025";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
// Cap each call at $0.05 so a sweep across campgrounds can never run away.
const payFetch = wrapFetchWithPayment(fetch, account, 50_000n);

const server = new McpServer({ name: "x402-campsites", version: "0.1.0" });

// Free — real campground ids, so the model can skip a paid search when it
// already knows the campground.
server.tool(
  "campground_catalog",
  "Well-known recreation.gov campground ids. Free — check here before paying for a search.",
  {},
  async () => {
    const r = await fetch(`${BASE_URL}/catalog`);
    return { content: [{ type: "text", text: await r.text() }] };
  },
);

server.tool(
  "search_campgrounds",
  "Find campgrounds by text, state, or coordinates. Returns location, site count, amenities and a booking link. Costs $0.002 in USDC.",
  {
    query: z.string().optional().describe("Free text, e.g. 'Yosemite'"),
    state: z.string().length(2).optional().describe("2-letter state code, e.g. CA"),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    radiusMiles: z.number().int().min(1).max(500).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async (args) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) if (v !== undefined) qs.set(k, String(v));
    const r = await payFetch(`${BASE_URL}/search?${qs}`);
    return { content: [{ type: "text", text: await r.text() }] };
  },
);

server.tool(
  "check_availability",
  "Site-level availability for one campground over a date window. Returns which individual sites are free on which nights. Costs $0.003 in USDC.",
  {
    campgroundId: z.string().describe("Numeric recreation.gov facility id, e.g. 232486"),
    startDate: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
    endDate: z.string().optional().describe("YYYY-MM-DD, defaults to startDate + 3, max 31 nights"),
    limit: z.number().int().min(1).max(300).optional(),
  },
  async ({ campgroundId, startDate, endDate, limit }) => {
    const qs = new URLSearchParams();
    if (startDate) qs.set("startDate", startDate);
    if (endDate) qs.set("endDate", endDate);
    if (limit) qs.set("limit", String(limit));
    const r = await payFetch(`${BASE_URL}/availability/${encodeURIComponent(campgroundId)}?${qs}`);
    return { content: [{ type: "text", text: await r.text() }] };
  },
);

// Free — which data sources is this deployment on?
server.tool("service_info", "Data sources and accepted payment rails (free)", {}, async () => {
  const r = await fetch(`${BASE_URL}/health`);
  return { content: [{ type: "text", text: await r.text() }] };
});

await server.connect(new StdioServerTransport());
```

## claude_desktop_config.json

```json
{
  "mcpServers": {
    "x402-campsites": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-server.ts"],
      "env": {
        "CAMPSITES_URL": "http://localhost:4025",
        "PRIVATE_KEY": "0x… funded Base Sepolia key"
      }
    }
  }
}
```

## Three things to put in your system prompt

**`availabilitySource` decides whether availability is real.**
`"recreation.gov"` is live data. `"fixture"` means the live endpoint was
unreachable and the numbers are a deterministic simulation — the model must not
tell a user a site is bookable in that case. Note this is a *different* field
from `source`, which only describes where the campground metadata came from; a
response can correctly read `"source": "fixture"` with
`"availabilitySource": "recreation.gov"`.

**Try `campground_catalog` before `search_campgrounds`.** It is free and covers
the popular parks. Paying $0.002 to rediscover Upper Pines is waste.

**This service does not book.** It reports availability and returns a
`bookingUrl`. A model should hand that link to the user, never imply it has held
or reserved a site. Availability also moves fast — say when the data was
retrieved (`retrievedAt`) rather than presenting it as durable.

## Spending safety

`wrapFetchWithPayment(fetch, account, 50_000n)` refuses any single call above
$0.05. The pattern to watch is a sweep: `check_availability` across ten
campgrounds is $0.03 and reads as a single user request, so bound the fan-out in
your agent rather than relying on the per-call cap. For budgets, per-merchant
caps, and approval thresholds see the x402-agent-wallet pattern in the
[x402 Suite](https://github.com/nirholas/x402-suite).
