import type { Team } from "@/types/database"

export interface GroupMatchInput {
  id: string
  team1_id: string
  team2_id: string
}

export interface ScoreEntry {
  score1: number | null
  score2: number | null
}

export interface TeamStanding {
  teamId: string
  position: 1 | 2 | 3 | 4
  played: number
  wins: number
  draws: number
  losses: number
  gf: number
  ga: number
  gd: number
  points: number
}

export interface BestThirdEntry {
  groupName: string
  teamId: string
  points: number
  gd: number
  gf: number
  name: string
}

function getResult(score1: number, score2: number): "team1" | "draw" | "team2" {
  if (score1 > score2) return "team1"
  if (score2 > score1) return "team2"
  return "draw"
}

/**
 * Compute group standings from predicted match scores.
 * Tiebreaker order: points → GD → GF → head-to-head (pts → GD → GF) → FIFA ranking → alphabetical
 */
export function computeGroupStandings(
  teams: Team[],
  matches: GroupMatchInput[],
  scores: Record<string, ScoreEntry>
): TeamStanding[] {
  const stats: Record<string, { played: number; wins: number; draws: number; losses: number; gf: number; ga: number; points: number }> = {}

  for (const t of teams) {
    stats[t.id] = { played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }
  }

  for (const m of matches) {
    const entry = scores[m.id]
    if (entry === undefined || entry.score1 === null || entry.score2 === null) continue

    const { score1, score2 } = entry as { score1: number; score2: number }
    const result = getResult(score1, score2)

    if (stats[m.team1_id]) {
      stats[m.team1_id].played++
      stats[m.team1_id].gf += score1
      stats[m.team1_id].ga += score2
      if (result === "team1") { stats[m.team1_id].wins++; stats[m.team1_id].points += 3 }
      else if (result === "draw") { stats[m.team1_id].draws++; stats[m.team1_id].points += 1 }
      else stats[m.team1_id].losses++
    }

    if (stats[m.team2_id]) {
      stats[m.team2_id].played++
      stats[m.team2_id].gf += score2
      stats[m.team2_id].ga += score1
      if (result === "team2") { stats[m.team2_id].wins++; stats[m.team2_id].points += 3 }
      else if (result === "draw") { stats[m.team2_id].draws++; stats[m.team2_id].points += 1 }
      else stats[m.team2_id].losses++
    }
  }

  const teamMap = new Map(teams.map((t) => [t.id, t]))

  const rows = teams.map((t) => {
    const s = stats[t.id]
    return { teamId: t.id, ...s, gd: s.gf - s.ga }
  })

  // Sort with head-to-head tiebreaker
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf

    // Head-to-head: look at mutual match(es)
    const h2hMatches = matches.filter(
      (m) =>
        (m.team1_id === a.teamId && m.team2_id === b.teamId) ||
        (m.team1_id === b.teamId && m.team2_id === a.teamId)
    )

    let aH2HPts = 0, bH2HPts = 0, aH2HGD = 0, bH2HGD = 0, aH2HGF = 0, bH2HGF = 0

    for (const m of h2hMatches) {
      const entry = scores[m.id]
      if (!entry || entry.score1 === null || entry.score2 === null) continue
      const { score1, score2 } = entry as { score1: number; score2: number }
      const result = getResult(score1, score2)

      if (m.team1_id === a.teamId) {
        aH2HGF += score1; bH2HGF += score2
        aH2HGD += score1 - score2; bH2HGD += score2 - score1
        if (result === "team1") aH2HPts += 3
        else if (result === "draw") { aH2HPts += 1; bH2HPts += 1 }
        else bH2HPts += 3
      } else {
        bH2HGF += score1; aH2HGF += score2
        bH2HGD += score1 - score2; aH2HGD += score2 - score1
        if (result === "team1") bH2HPts += 3
        else if (result === "draw") { aH2HPts += 1; bH2HPts += 1 }
        else aH2HPts += 3
      }
    }

    if (bH2HPts !== aH2HPts) return bH2HPts - aH2HPts
    if (bH2HGD !== aH2HGD) return bH2HGD - aH2HGD
    if (bH2HGF !== aH2HGF) return bH2HGF - aH2HGF

    // FIFA ranking (lower = better)
    const rankA = teamMap.get(a.teamId)?.fifa_ranking ?? 999
    const rankB = teamMap.get(b.teamId)?.fifa_ranking ?? 999
    if (rankA !== rankB) return rankA - rankB

    // Alphabetical fallback
    const nameA = teamMap.get(a.teamId)?.name ?? ""
    const nameB = teamMap.get(b.teamId)?.name ?? ""
    return nameA.localeCompare(nameB)
  })

  return rows.map((r, i) => ({
    teamId: r.teamId,
    position: (i + 1) as 1 | 2 | 3 | 4,
    played: r.played,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
    gf: r.gf,
    ga: r.ga,
    gd: r.gd,
    points: r.points,
  }))
}

/**
 * Compute standings for all groups at once.
 * Returns a map from group_name to sorted standings array.
 */
export function computeAllGroupStandings(
  teams: Team[],
  allGroupMatches: GroupMatchInput[],
  scores: Record<string, ScoreEntry>
): Record<string, TeamStanding[]> {
  const groupTeams: Record<string, Team[]> = {}
  for (const t of teams) {
    if (!groupTeams[t.group_name]) groupTeams[t.group_name] = []
    groupTeams[t.group_name].push(t)
  }

  const groupMatches: Record<string, GroupMatchInput[]> = {}
  for (const m of allGroupMatches) {
    // group matches have round === 'group'
    // determine group by looking up team
    const team = teams.find((t) => t.id === m.team1_id)
    const grp = team?.group_name
    if (!grp) continue
    if (!groupMatches[grp]) groupMatches[grp] = []
    groupMatches[grp].push(m)
  }

  const result: Record<string, TeamStanding[]> = {}
  for (const grp of Object.keys(groupTeams)) {
    result[grp] = computeGroupStandings(
      groupTeams[grp],
      groupMatches[grp] ?? [],
      scores
    )
  }
  return result
}

/**
 * Derive group_picks-style { first, second, third } from computed standings.
 * Returns a map from group_name to { first, second, third } (team IDs).
 */
export function deriveGroupPicks(
  standings: Record<string, TeamStanding[]>
): Record<string, { first: string; second: string; third: string }> {
  const picks: Record<string, { first: string; second: string; third: string }> = {}
  for (const [grp, rows] of Object.entries(standings)) {
    const first = rows.find((r) => r.position === 1)?.teamId ?? ""
    const second = rows.find((r) => r.position === 2)?.teamId ?? ""
    const third = rows.find((r) => r.position === 3)?.teamId ?? ""
    picks[grp] = { first, second, third }
  }
  return picks
}

/**
 * Compute the 8 best advancing third-place teams from all 12 groups.
 * Tiebreaker: points → GD → GF → alphabetical by team name
 */
export function computeBestThirds(
  thirds: BestThirdEntry[]
): string[] {
  const sorted = [...thirds].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return a.name.localeCompare(b.name)
  })
  return sorted.slice(0, 8).map((t) => t.teamId)
}

/**
 * Build BestThirdEntry list from computed standings.
 */
export function buildThirdsFromStandings(
  standings: Record<string, TeamStanding[]>,
  teams: Team[]
): BestThirdEntry[] {
  const teamMap = new Map(teams.map((t) => [t.id, t]))
  const thirds: BestThirdEntry[] = []

  for (const [grp, rows] of Object.entries(standings)) {
    const third = rows.find((r) => r.position === 3)
    if (third) {
      thirds.push({
        groupName: grp,
        teamId: third.teamId,
        points: third.points,
        gd: third.gd,
        gf: third.gf,
        name: teamMap.get(third.teamId)?.name ?? "",
      })
    }
  }

  return thirds
}
