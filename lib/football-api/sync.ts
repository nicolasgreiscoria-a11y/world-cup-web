import { createAdminClient } from "@/lib/supabase/server"

const BASE_URL = "https://api.football-data.org/v4"

interface FDTeam {
  id: number
  name: string
  tla: string
  crest: string
}

interface FDScore {
  home: number | null
  away: number | null
}

interface FDMatch {
  id: number
  utcDate: string
  status: string
  matchday: number | null
  stage: string
  homeTeam: { id: number; name: string | null }
  awayTeam: { id: number; name: string | null }
  score: {
    fullTime: FDScore
  }
}

interface FDStandingRow {
  position: number
  team: { id: number; name: string }
  playedGames: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

interface FDStandingGroup {
  stage: string
  type: string
  group: string | null
  table: FDStandingRow[]
}

async function fdFetch<T>(
  path: string,
  apiKey: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "X-Auth-Token": apiKey },
      next: { revalidate: 0 },
    })

    if (res.status === 429) {
      return { data: null, error: "Rate limit reached (429). Try again in a minute." }
    }
    if (!res.ok) {
      const text = await res.text()
      return { data: null, error: `API error ${res.status}: ${text.slice(0, 200)}` }
    }

    const json = (await res.json()) as T
    return { data: json, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fetch error"
    return { data: null, error: msg }
  }
}

function mapStatus(apiStatus: string): "scheduled" | "live" | "finished" {
  if (apiStatus === "FINISHED" || apiStatus === "AWARDED") return "finished"
  if (apiStatus === "IN_PLAY" || apiStatus === "PAUSED" || apiStatus === "HALFTIME") return "live"
  return "scheduled"
}

// football-data.org TLA is 3-letters. We store country_code as the TLA directly
// (iso2 mapping is complex — TLA is more reliable for flag lookups anyway).
function tlaToCountryCode(tla: string): string {
  return tla.toLowerCase().slice(0, 3)
}

export async function syncWorldCup(): Promise<{
  matchesUpdated: number
  teamsSeeded: number
  error?: string
}> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY
  if (!apiKey || apiKey.trim() === "") {
    return { matchesUpdated: 0, teamsSeeded: 0, error: "FOOTBALL_DATA_API_KEY not configured" }
  }

  const supabase = await createAdminClient()
  let teamsSeeded = 0
  let matchesUpdated = 0

  try {
    // -------------------------------------------------------------------------
    // Step 1 — Seed teams (only when the table is empty)
    // -------------------------------------------------------------------------
    const { count: teamCount } = await supabase
      .from("teams")
      .select("*", { count: "exact", head: true })

    if (teamCount === 0 || teamCount === null) {
      // First fetch standings to get group membership per team
      const standingsRes = await fdFetch<{ standings: FDStandingGroup[] }>(
        "/competitions/WC/standings",
        apiKey
      )
      const groupByTeamId = new Map<number, string>()

      if (standingsRes.data?.standings) {
        for (const group of standingsRes.data.standings) {
          if (group.type === "TOTAL" && group.group) {
            // API returns "Group A" or "GROUP_A" depending on season — extract just the letter
            const letter = group.group.replace(/^(Group\s+|GROUP_)/i, "").trim()
            for (const row of group.table) {
              groupByTeamId.set(row.team.id, letter)
            }
          }
        }
      }

      const teamsRes = await fdFetch<{ teams: FDTeam[] }>(
        "/competitions/WC/teams",
        apiKey
      )

      if (teamsRes.error) {
        return { matchesUpdated: 0, teamsSeeded: 0, error: teamsRes.error }
      }

      const teams = teamsRes.data?.teams ?? []

      for (const t of teams) {
        const groupName = groupByTeamId.get(t.id) ?? "A"
        const { error } = await supabase.from("teams").upsert(
          {
            name: t.name,
            country_code: tlaToCountryCode(t.tla),
            flag_url: t.crest ?? null,
            group_name: groupName,
            fifa_ranking: null,
          },
          { onConflict: "name" }
        )
        if (!error) teamsSeeded++
      }
    }

    // Build a name → id map for team lookups
    const { data: allTeams } = await supabase.from("teams").select("id, name")
    const teamIdByName = new Map<string, string>()
    for (const t of allTeams ?? []) {
      teamIdByName.set(t.name, t.id)
    }

    // -------------------------------------------------------------------------
    // Step 2 & 4 — Sync matches for all stages
    // -------------------------------------------------------------------------
    const stageToRound: Record<string, string> = {
      GROUP_STAGE: "group",
      LAST_32: "r32",
      LAST_16: "r16",
      QUARTER_FINALS: "qf",
      SEMI_FINALS: "sf",
      FINAL: "final",
      THIRD_PLACE: "third_place",
    }

    const stagesToFetch = [
      "GROUP_STAGE",
      "LAST_32",
      "LAST_16",
      "QUARTER_FINALS",
      "SEMI_FINALS",
      "THIRD_PLACE",
      "FINAL",
    ]

    for (const stage of stagesToFetch) {
      const res = await fdFetch<{ matches: FDMatch[] }>(
        `/competitions/WC/matches?stage=${stage}`,
        apiKey
      )

      if (res.error) {
        console.error(`Sync: error fetching stage ${stage}: ${res.error}`)
        continue
      }

      const matches = res.data?.matches ?? []
      const round = stageToRound[stage] ?? "group"

      for (const m of matches) {
        const status = mapStatus(m.status)
        const score1 = m.score.fullTime.home
        const score2 = m.score.fullTime.away
        const team1Id = m.homeTeam.name ? (teamIdByName.get(m.homeTeam.name) ?? null) : null
        const team2Id = m.awayTeam.name ? (teamIdByName.get(m.awayTeam.name) ?? null) : null

        let winnerId: string | null = null
        if (status === "finished" && score1 !== null && score2 !== null) {
          if (score1 > score2) winnerId = team1Id
          else if (score2 > score1) winnerId = team2Id
          // draws in group stage stay null for winner_id
        }

        const { error } = await supabase.from("matches").upsert(
          {
            external_id: m.id.toString(),
            round: round as import("@/types/database").Round,
            match_number: m.matchday ?? matches.indexOf(m) + 1,
            team1_id: team1Id,
            team2_id: team2Id,
            score1: score1 ?? null,
            score2: score2 ?? null,
            winner_id: winnerId,
            status,
            kickoff_at: m.utcDate,
          },
          { onConflict: "external_id" }
        )

        if (!error) matchesUpdated++
        else console.error(`Sync: upsert match ${m.id} failed: ${error.message}`)
      }
    }

    // -------------------------------------------------------------------------
    // Step 3 — Update group_standings
    // -------------------------------------------------------------------------
    const standingsRes = await fdFetch<{ standings: FDStandingGroup[] }>(
      "/competitions/WC/standings",
      apiKey
    )

    if (standingsRes.data?.standings) {
      for (const group of standingsRes.data.standings) {
        if (group.type !== "TOTAL" || !group.group) continue
        const letter = group.group.replace(/^(Group\s+|GROUP_)/i, "").trim()

        for (const row of group.table) {
          const teamId = teamIdByName.get(row.team.name)
          if (!teamId) continue

          await supabase.from("group_standings").upsert(
            {
              team_id: teamId,
              group_name: letter,
              played: row.playedGames,
              wins: row.won,
              draws: row.draw,
              losses: row.lost,
              goals_for: row.goalsFor,
              goals_against: row.goalsAgainst,
              points: row.points,
              position: row.position,
            },
            { onConflict: "team_id" }
          )
        }
      }
    }

    return { matchesUpdated, teamsSeeded }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error during sync"
    console.error("syncWorldCup error:", message)
    return { matchesUpdated, teamsSeeded, error: message }
  }
}
