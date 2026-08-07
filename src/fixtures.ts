// Fixture data — used for campground SEARCH when RIDB_API_KEY is unset.
//
// These are REAL recreation.gov facility ids, names, and coordinates, verified
// against the live site. That is deliberate: an availability lookup on a fixture
// search result still hits the live keyless recreation.gov endpoint and returns
// genuine site-level data. What the fixture supplies is the *catalog* — the
// search, filtering, and the amenity/fee metadata that would otherwise come from
// RIDB. Those amenity and fee values are representative, not authoritative.
//
// Availability itself is never fixtured unless the live endpoint is unreachable,
// and when that happens the response says so via `availabilitySource`.

export interface Campground {
  campgroundId: string;
  name: string;
  agency: string;
  parkName: string;
  state: string;
  latitude: number;
  longitude: number;
  totalSites: number;
  reservable: boolean;
  amenities: string[];
  feePerNightUsd: number | null;
  description: string;
  reservationUrl: string;
}

/** Fixture catalog — real facility ids so /availability stays live. */
const CAMPGROUNDS: Campground[] = [
  {
    campgroundId: "232447",
    name: "Upper Pines Campground",
    agency: "NPS",
    parkName: "Yosemite National Park",
    state: "CA",
    latitude: 37.7361111,
    longitude: -119.5625,
    totalSites: 235,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "BEAR_LOCKER", "SHOWERS_NEARBY"],
    feePerNightUsd: 36,
    description: "Yosemite Valley's largest campground, open year-round and walking distance from Happy Isles.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/232447",
  },
  {
    campgroundId: "232450",
    name: "Lower Pines Campground",
    agency: "NPS",
    parkName: "Yosemite National Park",
    state: "CA",
    latitude: 37.7408333,
    longitude: -119.5666667,
    totalSites: 74,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "BEAR_LOCKER"],
    feePerNightUsd: 36,
    description: "Valley-floor campground along the Merced River, with Half Dome views from several loops.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/232450",
  },
  {
    campgroundId: "232449",
    name: "North Pines Campground",
    agency: "NPS",
    parkName: "Yosemite National Park",
    state: "CA",
    latitude: 37.7419444,
    longitude: -119.5655556,
    totalSites: 81,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "BEAR_LOCKER", "HORSE_STAGING"],
    feePerNightUsd: 36,
    description: "Quiet loop between the Merced and Tenaya Creek, close to the Mirror Lake trailhead.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/232449",
  },
  {
    campgroundId: "232463",
    name: "Moraine Park Campground",
    agency: "NPS",
    parkName: "Rocky Mountain National Park",
    state: "CO",
    latitude: 40.3625,
    longitude: -105.6019444,
    totalSites: 236,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "RANGER_PROGRAMS"],
    feePerNightUsd: 35,
    description: "Ponderosa-shaded sites above Moraine Park, prime elk-viewing country in autumn.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/232463",
  },
  {
    campgroundId: "234059",
    name: "Devils Garden Campground",
    agency: "NPS",
    parkName: "Arches National Park",
    state: "UT",
    latitude: 38.7769444,
    longitude: -109.5891667,
    totalSites: 51,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE"],
    feePerNightUsd: 25,
    description: "The only campground inside Arches, tucked among slickrock fins at the end of the park road.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/234059",
  },
  {
    campgroundId: "232487",
    name: "Elkmont Campground",
    agency: "NPS",
    parkName: "Great Smoky Mountains National Park",
    state: "TN",
    latitude: 35.65875708,
    longitude: -83.58274051,
    totalSites: 211,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "FISHING"],
    feePerNightUsd: 30,
    description: "The Smokies' largest campground, on the Little River with synchronous firefly viewing in June.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/232487",
  },
  {
    campgroundId: "232486",
    name: "Smokemont Campground",
    agency: "NPS",
    parkName: "Great Smoky Mountains National Park",
    state: "NC",
    latitude: 35.55644997,
    longitude: -83.3116255,
    totalSites: 142,
    reservable: true,
    amenities: ["FLUSH_TOILETS", "DRINKING_WATER", "FIRE_RING", "PICNIC_TABLE", "HORSE_TRAILS"],
    feePerNightUsd: 30,
    description: "Year-round campground on the Oconaluftee River, on the park's quieter North Carolina side.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/232486",
  },
  {
    campgroundId: "233359",
    name: "Point Reyes National Seashore Campground",
    agency: "NPS",
    parkName: "Point Reyes National Seashore",
    state: "CA",
    latitude: 38.04121,
    longitude: -122.800354,
    totalSites: 51,
    reservable: true,
    amenities: ["VAULT_TOILETS", "DRINKING_WATER", "PICNIC_TABLE", "HIKE_IN", "FOOD_STORAGE"],
    feePerNightUsd: 30,
    description: "Hike-in coastal sites across four backcountry camps; no vehicle access to any of them.",
    reservationUrl: "https://www.recreation.gov/camping/campgrounds/233359",
  },
];

export function fixtureCampgrounds(): Campground[] {
  return CAMPGROUNDS;
}

export function fixtureCampgroundById(id: string): Campground | undefined {
  return CAMPGROUNDS.find((c) => c.campgroundId === id);
}

/** FNV-1a 32-bit — stable, dependency-free string hash. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) seeded from the query. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
