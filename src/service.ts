/**
 * Campsite domain logic.
 *
 *  - `searchCampgrounds` uses RIDB when `RIDB_API_KEY` is set, deterministic
 *    fixtures otherwise. `source` says which you got.
 *  - `availability` calls the **keyless, live** recreation.gov availability
 *    endpoint — the same one behind the site's booking calendar — so real
 *    site-level data is returned with no key configured at all. Only if that
 *    endpoint is unreachable does it fall back to a deterministic simulation,
 *    and `availabilitySource` says so.
 */
import {
  fixtureCampgroundById,
  fixtureCampgrounds,
  hash,
  rng,
  type Campground,
} from "./fixtures.js";
import { UpstreamError, recGovGet, ridbEnabled, ridbGet } from "./ridb.js";

export class BadRequestError extends Error {}
export class NotFoundError extends Error {}
export { UpstreamError };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WINDOW_NIGHTS = 31;

// ————— search —————

export interface SearchParams {
  query: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMiles: number;
  limit: number;
}

export function parseSearchParams(q: Record<string, unknown>): SearchParams {
  const query = str(q.query ?? q.q);
  const state = str(q.state)?.toUpperCase() ?? null;
  const lat = num(q.latitude ?? q.lat);
  const lon = num(q.longitude ?? q.lon ?? q.lng);
  const radiusMiles = clamp(num(q.radiusMiles ?? q.radius) ?? 50, 1, 500);
  const limit = clamp(num(q.limit) ?? 10, 1, 50);

  if ((lat === null) !== (lon === null)) {
    throw new BadRequestError("latitude and longitude must be supplied together");
  }
  if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lon as number) > 180)) {
    throw new BadRequestError("latitude/longitude out of range");
  }
  if (state !== null && !/^[A-Z]{2}$/.test(state)) {
    throw new BadRequestError("state must be a 2-letter code, e.g. CA");
  }
  if (!query && !state && lat === null) {
    throw new BadRequestError(
      "Give at least one of: query (text), state (2-letter code), or latitude+longitude",
    );
  }
  return { query: query ?? null, state, latitude: lat, longitude: lon, radiusMiles, limit };
}

export interface SearchResult {
  source: "ridb" | "fixture";
  query: SearchParams;
  count: number;
  campgrounds: Campground[];
  note: string;
  retrievedAt: string;
}

interface RidbFacility {
  FacilityID?: string;
  FacilityName?: string;
  FacilityDescription?: string;
  FacilityLatitude?: number;
  FacilityLongitude?: number;
  FacilityTypeDescription?: string;
  Reservable?: boolean;
  FACILITYADDRESS?: Array<{ AddressStateCode?: string }>;
  ORGANIZATION?: Array<{ OrgAbbrevName?: string }>;
  RECAREA?: Array<{ RecAreaName?: string }>;
  CAMPSITE?: unknown[];
  ACTIVITY?: Array<{ ActivityName?: string }>;
}

function normalizeFacility(f: RidbFacility): Campground {
  const id = String(f.FacilityID ?? "");
  return {
    campgroundId: id,
    name: String(f.FacilityName ?? "Unnamed campground"),
    agency: String(f.ORGANIZATION?.[0]?.OrgAbbrevName ?? ""),
    parkName: String(f.RECAREA?.[0]?.RecAreaName ?? ""),
    state: String(f.FACILITYADDRESS?.[0]?.AddressStateCode ?? ""),
    latitude: Number(f.FacilityLatitude ?? 0),
    longitude: Number(f.FacilityLongitude ?? 0),
    totalSites: Array.isArray(f.CAMPSITE) ? f.CAMPSITE.length : 0,
    reservable: Boolean(f.Reservable),
    amenities: (f.ACTIVITY ?? [])
      .map((a) => String(a.ActivityName ?? "").toUpperCase().replace(/\s+/g, "_"))
      .filter(Boolean),
    feePerNightUsd: null, // RIDB does not expose a single nightly fee on the facility record
    description: stripHtml(String(f.FacilityDescription ?? "")).slice(0, 400),
    reservationUrl: `https://www.recreation.gov/camping/campgrounds/${id}`,
  };
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchCampgrounds(p: SearchParams): Promise<SearchResult> {
  if (ridbEnabled()) {
    const params: Record<string, string> = {
      limit: String(p.limit),
      offset: "0",
      full: "true",
      activity: "CAMPING",
    };
    if (p.query) params.query = p.query;
    if (p.state) params.state = p.state;
    if (p.latitude !== null && p.longitude !== null) {
      params.latitude = String(p.latitude);
      params.longitude = String(p.longitude);
      params.radius = String(p.radiusMiles);
    }
    const data = (await ridbGet("/facilities", params)) as { RECDATA?: RidbFacility[] };
    const campgrounds = (data.RECDATA ?? []).map(normalizeFacility);
    return {
      source: "ridb",
      query: p,
      count: campgrounds.length,
      campgrounds,
      note: "Live Recreation Information Database (RIDB) results. feePerNightUsd is null because RIDB does not publish a single nightly fee on the facility record.",
      retrievedAt: new Date().toISOString(),
    };
  }

  // Fixture search over a small catalog of real recreation.gov facilities.
  let list = fixtureCampgrounds();
  if (p.state) list = list.filter((c) => c.state === p.state);
  if (p.query) {
    const q = p.query.toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.parkName.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }
  if (p.latitude !== null && p.longitude !== null) {
    const lat = p.latitude;
    const lon = p.longitude;
    list = list
      .map((c) => ({ c, d: haversineMiles(lat, lon, c.latitude, c.longitude) }))
      .filter((x) => x.d <= p.radiusMiles)
      .sort((a, b) => a.d - b.d)
      .map((x) => x.c);
  }
  return {
    source: "fixture",
    query: p,
    count: Math.min(list.length, p.limit),
    campgrounds: list.slice(0, p.limit),
    note: "Fixture catalog — RIDB_API_KEY is not set. These are REAL recreation.gov facility ids, names, and coordinates, so GET /availability/:campgroundId on any of them still returns live data. The amenity and fee values are representative, not authoritative. Set RIDB_API_KEY (free) for the full live catalog.",
    retrievedAt: new Date().toISOString(),
  };
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ————— availability —————

export interface DayStatus {
  date: string;
  status: "available" | "reserved" | "not-available" | "not-reservable" | "unknown";
}

export interface SiteAvailability {
  campsiteId: string;
  site: string;
  loop: string;
  siteType: string;
  reserveType: string;
  nightsAvailable: number;
  fullWindowAvailable: boolean;
  days: DayStatus[];
}

export interface AvailabilityResult {
  source: "ridb" | "fixture";
  availabilitySource: "recreation.gov" | "fixture";
  campgroundId: string;
  campground: Campground | null;
  window: { startDate: string; endDate: string; nights: number };
  summary: {
    totalSites: number;
    sitesWithAnyAvailability: number;
    sitesAvailableWholeWindow: number;
    firstFullyAvailableDate: string | null;
  };
  sites: SiteAvailability[];
  bookingUrl: string;
  note: string;
  retrievedAt: string;
}

export function parseWindow(q: Record<string, unknown>): { startDate: string; endDate: string; nights: number } {
  const startDate = str(q.startDate ?? q.start) ?? today();
  const endDate = str(q.endDate ?? q.end) ?? addDays(startDate, 3);
  if (!ISO_DATE.test(startDate)) throw new BadRequestError("startDate must be YYYY-MM-DD");
  if (!ISO_DATE.test(endDate)) throw new BadRequestError("endDate must be YYYY-MM-DD");
  const nights = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
  if (nights <= 0) throw new BadRequestError("endDate must be after startDate");
  if (nights > MAX_WINDOW_NIGHTS) {
    throw new BadRequestError(`date window must be ${MAX_WINDOW_NIGHTS} nights or fewer`);
  }
  return { startDate, endDate, nights };
}

interface RecGovMonth {
  campsites?: Record<
    string,
    {
      campsite_id?: string;
      site?: string;
      loop?: string;
      campsite_type?: string;
      campsite_reserve_type?: string;
      availabilities?: Record<string, string>;
    }
  >;
}

/** recreation.gov serves availability a month at a time, keyed by first-of-month. */
function monthsCovering(startDate: string, nights: number): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start.getTime() + nights * 86_400_000);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    out.push(cursor.toISOString().replace(/\.\d{3}Z$/, ".000Z"));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function mapStatus(raw: string): DayStatus["status"] {
  const s = raw.toLowerCase();
  if (s === "available") return "available";
  if (s === "reserved") return "reserved";
  if (s === "not available" || s === "not_available") return "not-available";
  if (s.includes("not reservable")) return "not-reservable";
  return "unknown";
}

export async function availability(
  campgroundId: string,
  window: { startDate: string; endDate: string; nights: number },
  limit: number,
): Promise<AvailabilityResult> {
  if (!/^\d+$/.test(campgroundId)) {
    throw new BadRequestError("campgroundId must be a numeric recreation.gov facility id, e.g. 232447");
  }

  const campground = await resolveCampground(campgroundId);
  const nightDates = Array.from({ length: window.nights }, (_, i) => addDays(window.startDate, i));

  let sites: SiteAvailability[];
  let availabilitySource: AvailabilityResult["availabilitySource"];
  let note: string;

  try {
    const merged = new Map<string, SiteAvailability>();
    for (const monthStart of monthsCovering(window.startDate, window.nights)) {
      const data = (await recGovGet(`/availability/campground/${campgroundId}/month`, {
        start_date: monthStart,
      })) as RecGovMonth;
      for (const [id, raw] of Object.entries(data.campsites ?? {})) {
        const existing = merged.get(id) ?? {
          campsiteId: String(raw.campsite_id ?? id),
          site: String(raw.site ?? ""),
          loop: String(raw.loop ?? ""),
          siteType: String(raw.campsite_type ?? ""),
          reserveType: String(raw.campsite_reserve_type ?? ""),
          nightsAvailable: 0,
          fullWindowAvailable: false,
          days: [],
        };
        for (const [isoDay, status] of Object.entries(raw.availabilities ?? {})) {
          const day = isoDay.slice(0, 10);
          if (!nightDates.includes(day)) continue;
          if (!existing.days.some((d) => d.date === day)) {
            existing.days.push({ date: day, status: mapStatus(status) });
          }
        }
        merged.set(id, existing);
      }
    }
    if (merged.size === 0) {
      throw new UpstreamError("recreation.gov returned no campsites for this facility");
    }
    sites = [...merged.values()];
    availabilitySource = "recreation.gov";
    note =
      "Live site-level availability from recreation.gov — the same data behind the site's own booking calendar. This endpoint is public and needs no API key. Availability moves fast; re-check before relying on it.";
  } catch (err) {
    // Live availability is the point of this route, so say plainly when it is
    // simulated rather than quietly returning plausible-looking nonsense.
    sites = simulateAvailability(campgroundId, campground, nightDates);
    availabilitySource = "fixture";
    note = `Live recreation.gov availability was unreachable (${(err as Error).message}). These figures are DETERMINISTIC SIMULATION, not real availability — do not present them as bookable. Retry, or check ${bookingUrl(campgroundId)} directly.`;
  }

  for (const s of sites) {
    s.days.sort((a, b) => a.date.localeCompare(b.date));
    s.nightsAvailable = s.days.filter((d) => d.status === "available").length;
    s.fullWindowAvailable = s.nightsAvailable === window.nights && s.days.length === window.nights;
  }
  sites.sort(
    (a, b) => Number(b.fullWindowAvailable) - Number(a.fullWindowAvailable) || b.nightsAvailable - a.nightsAvailable,
  );

  const firstFullyAvailableDate =
    nightDates.find((d) => sites.some((s) => s.days.some((x) => x.date === d && x.status === "available"))) ??
    null;

  return {
    source: ridbEnabled() ? "ridb" : "fixture",
    availabilitySource,
    campgroundId,
    campground,
    window,
    summary: {
      totalSites: sites.length,
      sitesWithAnyAvailability: sites.filter((s) => s.nightsAvailable > 0).length,
      sitesAvailableWholeWindow: sites.filter((s) => s.fullWindowAvailable).length,
      firstFullyAvailableDate,
    },
    sites: sites.slice(0, limit),
    bookingUrl: bookingUrl(campgroundId),
    note,
    retrievedAt: new Date().toISOString(),
  };
}

function bookingUrl(id: string): string {
  return `https://www.recreation.gov/camping/campgrounds/${id}`;
}

async function resolveCampground(id: string): Promise<Campground | null> {
  const fixture = fixtureCampgroundById(id);
  if (fixture) return fixture;
  if (!ridbEnabled()) return null;
  try {
    const data = (await ridbGet(`/facilities/${encodeURIComponent(id)}`, { full: "true" })) as RidbFacility;
    return data?.FacilityID ? normalizeFacility(data) : null;
  } catch {
    return null; // metadata is a nicety; availability is the artifact
  }
}

/** Deterministic stand-in used only when live availability is unreachable. */
function simulateAvailability(
  campgroundId: string,
  campground: Campground | null,
  nightDates: string[],
): SiteAvailability[] {
  const total = Math.min(campground?.totalSites ?? 40, 40);
  const out: SiteAvailability[] = [];
  for (let i = 0; i < total; i++) {
    const rand = rng(hash(`${campgroundId}|${i}|${nightDates[0]}`));
    const loop = String.fromCharCode(65 + (i % 4));
    out.push({
      campsiteId: `fx-${campgroundId}-${i}`,
      site: String(i + 1).padStart(3, "0"),
      loop: `Loop ${loop}`,
      siteType: i % 5 === 0 ? "RV_NONELECTRIC" : "STANDARD_NONELECTRIC",
      reserveType: "Site-Specific",
      nightsAvailable: 0,
      fullWindowAvailable: false,
      days: nightDates.map((date) => ({
        date,
        status: rand() > 0.72 ? ("available" as const) : ("reserved" as const),
      })),
    });
  }
  return out;
}

// ————— helpers —————

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export type { Campground };
