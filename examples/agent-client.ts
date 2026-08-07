/**
 * Agent client example: find campgrounds, then check which individual sites are
 * free over a date window — paying per lookup with x402.
 *
 * This service is dual-rail: every 402 quotes USDC on **Base** and on **Solana**,
 * and the client picks. `x402-fetch` settles the EVM rail, which is what this
 * example uses; the commented section at the bottom shows the Solana form, and
 * examples/curl.md has the raw wire format for both.
 *
 * Usage:
 *   export PRIVATE_KEY=0x…                  # testnet wallet with Base Sepolia USDC
 *   export BASE_URL=http://localhost:4025   # optional
 *   npm run client
 *
 * Free testnet USDC on Base Sepolia: https://faucet.circle.com
 */
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4025";
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error(
    "Set PRIVATE_KEY to a funded Base Sepolia wallet key (free USDC: https://faucet.circle.com)",
  );
  process.exit(1);
}

const account = privateKeyToAccount(pk as `0x${string}`);
// Third argument caps spend at 100000 atomic USDC units = $0.10 per call.
const payFetch = wrapFetchWithPayment(fetch, account, 100_000n);

// 1. Free: which data sources is this deployment on?
const health = await (await fetch(`${BASE_URL}/health`)).json();
console.log(`Service: ${health.service}`);
console.log(`  search source:       ${health.searchSource}`);
console.log(`  availability source: ${health.availabilitySource}`);
console.log(`  rails: ${health.rails}`);

// 2. Free: real campground ids. If you already know the campground you want,
//    skip the paid search entirely and go straight to availability.
const catalog = await (await fetch(`${BASE_URL}/catalog`)).json();
console.log(`\nFree catalog — ${catalog.campgrounds.length} real recreation.gov ids:`);
for (const c of catalog.campgrounds.slice(0, 4)) {
  console.log(`  ${c.campgroundId.padEnd(8)} ${c.name} (${c.state}, ${c.totalSites} sites)`);
}

// 3. Free: inspect the unpaid 402 to see both rails and the exact price.
const quote = await (await fetch(`${BASE_URL}/search?state=NC`)).json();
console.log("\n402 quote — accepted rails:");
for (const a of quote.accepts ?? []) {
  console.log(
    `  ${String(a.network).padEnd(14)} ${String(a.maxAmountRequired).padStart(8)} atomic USDC → ${a.payTo}`,
  );
}

// 4. Paid ($0.002): search.
console.log("\nSearching campgrounds in NC …");
const searchRes = await payFetch(`${BASE_URL}/search?state=NC`);
if (!searchRes.ok) {
  console.error(`Search failed: ${searchRes.status}`, await searchRes.text());
  process.exit(1);
}
const search = await searchRes.json();
console.log(`Source: ${search.source}  found: ${search.count}`);
for (const c of search.campgrounds) {
  console.log(
    `  ${c.campgroundId.padEnd(8)} ${c.name.padEnd(34)} ${String(c.totalSites).padStart(4)} sites  ${c.parkName}`,
  );
}
if (search.source === "fixture") {
  console.log("  (fixture catalog — set RIDB_API_KEY for the full live catalog)");
}

const receipt = searchRes.headers.get("x-payment-response");
if (receipt) {
  console.log("\nX-PAYMENT-RESPONSE (settlement receipt):");
  console.log(JSON.stringify(decodeXPaymentResponse(receipt), null, 2));
}

// 5. Paid ($0.003): live site-level availability for the first result.
const target = search.campgrounds[0];
const startDate = "2026-11-10";
const endDate = "2026-11-13";
console.log(`\nChecking ${target.name} for ${startDate} → ${endDate} …`);
const avail = await (
  await payFetch(`${BASE_URL}/availability/${target.campgroundId}?startDate=${startDate}&endDate=${endDate}`)
).json();

// This is the field to branch on: "recreation.gov" is real, "fixture" is not.
if (avail.availabilitySource !== "recreation.gov") {
  console.log(`  !! availabilitySource=${avail.availabilitySource} — SIMULATED, do not treat as bookable`);
  console.log(`  ${avail.note}`);
} else {
  console.log("  availabilitySource: recreation.gov (live)");
}

const s = avail.summary;
console.log(
  `  ${s.sitesAvailableWholeWindow} of ${s.totalSites} sites free for all ${avail.window.nights} nights` +
    ` (${s.sitesWithAnyAvailability} have at least one night)`,
);
console.log(`  first date with any opening: ${s.firstFullyAvailableDate ?? "none in window"}`);

for (const site of avail.sites.filter((x: { fullWindowAvailable: boolean }) => x.fullWindowAvailable).slice(0, 5)) {
  console.log(`    site ${site.site.padEnd(6)} ${site.loop.padEnd(14)} ${site.siteType}`);
}

console.log(`\n  Book at: ${avail.bookingUrl}`);
console.log("  (this service reports availability; it does not reserve anything)");
console.log("\nTotal spent this run: $0.005 (search $0.002 + availability $0.003)");

// ————— Paying on the Solana rail instead —————
//
// Same routes, same prices, same artifacts — only the signature differs. Pick
// the Solana entry out of `accepts`, sign an SPL USDC transfer for it, and send
// the envelope in X-PAYMENT:
//
//   const unpaid = await fetch(`${BASE_URL}/search?state=NC`);
//   const { accepts } = await unpaid.json();
//   const sol = accepts.find((a) => String(a.network).startsWith("solana"));
//   //   sol.asset             → the USDC SPL mint
//   //   sol.payTo             → the operator's Solana address
//   //   sol.maxAmountRequired → atomic USDC (6 decimals), e.g. "2000" = $0.002
//   //   sol.extra?.feePayer   → sponsor paying the SOL network fee, if offered
//
//   // Build + sign the SPL transfer with your Solana wallet or @solana/kit,
//   // then base64-wrap it:
//   const header = Buffer.from(JSON.stringify({
//     x402Version: 1,
//     scheme: "exact",
//     network: sol.network,
//     payload: { transaction: signedTxBase64 },
//   })).toString("base64");
//
//   const res = await fetch(`${BASE_URL}/search?state=NC`, { headers: { "X-PAYMENT": header } });
//   const campgrounds = await res.json();   // identical shape to the EVM path
