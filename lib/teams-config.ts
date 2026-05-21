/**
 * Central configuration for the 6 PHAmily Classic teams.
 *
 * This is the single source of truth — every other module that needs to know
 * about teams (registration form, roster pages, admin, webhook handler) reads
 * from here. If a team detail changes (cap, sport, etc.), change it here.
 *
 * The Shopify product GIDs were created in the WhenceCameYou University store
 * via the MCP tool and are tied to the products there. If those products are
 * recreated, these GIDs must be updated to match.
 */

export type Region = 'NJ' | 'NY';
export type Sport = 'basketball' | 'kickball' | 'knights-of-pythagoras';
export type AgeGroup = 'adult' | 'youth';

export interface Team {
  /** URL-safe slug used for /teams/[slug] routes */
  slug: string;
  /** Display name */
  name: string;
  /** Short display name for compact UI */
  shortName: string;
  region: Region;
  sport: Sport;
  ageGroup: AgeGroup;
  /** Hard roster cap — enforced at registration time */
  maxRoster: number;
  /** Shopify product GID for the team registration product */
  shopifyProductGid: string;
  /** Numeric Shopify product ID (last segment of GID) — useful for some APIs */
  shopifyProductId: string;
  /** Display order in team pickers and roster grids */
  displayOrder: number;
}

export const TEAMS: readonly Team[] = [
  {
    slug: 'nj-basketball',
    name: 'NJ Classic Basketball Team',
    shortName: 'NJ Basketball',
    region: 'NJ',
    sport: 'basketball',
    ageGroup: 'adult',
    maxRoster: 15,
    shopifyProductGid: 'gid://shopify/Product/10438339002549',
    shopifyProductId: '10438339002549',
    displayOrder: 1,
  },
  {
    slug: 'ny-basketball',
    name: 'NY Classic Basketball Team',
    shortName: 'NY Basketball',
    region: 'NY',
    sport: 'basketball',
    ageGroup: 'adult',
    maxRoster: 15,
    shopifyProductGid: 'gid://shopify/Product/10438339690677',
    shopifyProductId: '10438339690677',
    displayOrder: 2,
  },
  {
    slug: 'nj-kickball',
    name: 'NJ Classic Kickball Team',
    shortName: 'NJ Kickball',
    region: 'NJ',
    sport: 'kickball',
    ageGroup: 'adult',
    maxRoster: 15,
    shopifyProductGid: 'gid://shopify/Product/10438339821749',
    shopifyProductId: '10438339821749',
    displayOrder: 3,
  },
  {
    slug: 'ny-kickball',
    name: 'NY Classic Kickball Team',
    shortName: 'NY Kickball',
    region: 'NY',
    sport: 'kickball',
    ageGroup: 'adult',
    maxRoster: 15,
    shopifyProductGid: 'gid://shopify/Product/10438339887285',
    shopifyProductId: '10438339887285',
    displayOrder: 4,
  },
  {
    slug: 'nj-knights',
    name: 'NJ Youth Games Team',
    shortName: 'NJ Youth Games',
    region: 'NJ',
    sport: 'knights-of-pythagoras',
    ageGroup: 'youth',
    maxRoster: 15,
    shopifyProductGid: 'gid://shopify/Product/10438339920053',
    shopifyProductId: '10438339920053',
    displayOrder: 5,
  },
  {
    slug: 'ny-knights',
    name: 'NY Youth Games Team',
    shortName: 'NY Youth Games',
    region: 'NY',
    sport: 'knights-of-pythagoras',
    ageGroup: 'youth',
    maxRoster: 15,
    shopifyProductGid: 'gid://shopify/Product/10438339985589',
    shopifyProductId: '10438339985589',
    displayOrder: 6,
  },
] as const;

/** The PHAmily Classic spectator ticket Shopify product. */
export const SPECTATOR_TICKET = {
  shopifyProductGid: 'gid://shopify/Product/10438340051125',
  shopifyProductId: '10438340051125',
  price: 20,
} as const;

/** Hard registration deadline. Past this, /register redirects to /register/closed. */
export const REGISTRATION_DEADLINE_ISO = '2026-07-13T03:59:59Z'; // July 12, 11:59:59 PM ET
export const REGISTRATION_DEADLINE_DISPLAY = 'July 12, 2026';

/** Event details (for forms, confirmation pages, emails). */
export const EVENT = {
  name: 'Interstate PHAmily Classic',
  date: 'August 29, 2026',
  dateISO: '2026-08-29',
  venue: 'Riverbank State Park',
  venueAddress: '679 Riverside Drive, New York, NY 10031',
  presenter: 'Adelphic Union Lodge #14',
  registrationFee: 100,
} as const;

/** Available jersey sizes by age group. */
export const JERSEY_SIZES = {
  adult: ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const,
  youth: ['YS', 'YM', 'YL', 'S', 'M', 'L'] as const,
};

/** Available shorts sizes by age group. */
export const SHORTS_SIZES = {
  adult: ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const,
  youth: ['YS', 'YM', 'YL', 'S', 'M', 'L'] as const,
};

// ===== Lookups =====

export function getTeamBySlug(slug: string): Team | undefined {
  return TEAMS.find((t) => t.slug === slug);
}

export function getTeamByProductGid(gid: string): Team | undefined {
  return TEAMS.find((t) => t.shopifyProductGid === gid);
}

export function getTeamByProductId(id: string): Team | undefined {
  return TEAMS.find((t) => t.shopifyProductId === id);
}

/** Returns teams sorted by displayOrder. Always use this in UI rather than TEAMS directly. */
export function getOrderedTeams(): Team[] {
  return [...TEAMS].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function isRegistrationOpen(now: Date = new Date()): boolean {
  return now < new Date(REGISTRATION_DEADLINE_ISO);
}
