import { supabaseBrowser } from './supabase';

// ============================================================================
// Public read helpers — usable from client components OR server components.
// Backed by the Supabase anon key, constrained by RLS to confirmed data only.
// ============================================================================

export interface PublicRosterEntry {
  id: string;
  team_id: string;
  team_slug: string;
  full_name: string;
  jersey_number: number | null;
  is_youth: boolean;
  created_at: string;
}

export interface TeamRosterCount {
  team_id: string;
  team_slug: string;
  max_roster: number;
  confirmed_count: number;
  spots_remaining: number;
  is_full: boolean;
}

/** Get all confirmed registrations for a team, sorted by jersey number then name. */
export async function getPublicRosterByTeamSlug(
  slug: string
): Promise<PublicRosterEntry[]> {
  const { data, error } = await supabaseBrowser
    .from('public_roster')
    .select('*')
    .eq('team_slug', slug)
    .order('jersey_number', { ascending: true, nullsFirst: false })
    .order('full_name', { ascending: true });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[getPublicRosterByTeamSlug] error', { slug, error });
    return [];
  }
  return data ?? [];
}

/** Get roster count + spots remaining for a single team. */
export async function getTeamRosterCount(
  slug: string
): Promise<TeamRosterCount | null> {
  const { data, error } = await supabaseBrowser
    .from('team_roster_counts')
    .select('*')
    .eq('team_slug', slug)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[getTeamRosterCount] error', { slug, error });
    return null;
  }
  return data;
}

/** Get roster counts for all teams in one query. */
export async function getAllTeamRosterCounts(): Promise<TeamRosterCount[]> {
  const { data, error } = await supabaseBrowser
    .from('team_roster_counts')
    .select('*');

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[getAllTeamRosterCounts] error', error);
    return [];
  }
  return data ?? [];
}
