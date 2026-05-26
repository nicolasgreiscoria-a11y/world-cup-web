import type { GroupPick, GroupStanding, Match, MatchScorePick } from "@/types/database"

interface PickEntry {
  match: number
  winner_id: string
}

interface PicksJson {
  r32?: PickEntry[]
  r16?: PickEntry[]
  qf?: PickEntry[]
  sf?: PickEntry[]
  third_place?: { winner_id: string }
  final?: { winner_id: string }
}

export type { PicksJson, PickEntry }

export interface ScoringContext {
  realGroupStandings: GroupStanding[]
  realMatches: Match[]
}

const ROUND_POINTS: Record<string, number> = {
  r32: 3,
  r16: 5,
  qf: 8,
  sf: 12,
  third_place: 5,
  final: 20,
}

/**
 * Score a single group pick.
 * +2 if picked_1st_id matches the team at position=1 for that group.
 * +1 if picked_2nd_id matches the team at position=2 for that group.
 * +1 if picked_3rd_id matches the team at position=3 for that group
 *    AND that team advanced (position=3 means they are an advancing third —
 *    the tournament selects the best 8 third-place teams, so any group_standings
 *    row with position=3 is considered an advancing third).
 */
export function scoreGroupPick(
  pick: GroupPick,
  ctx: ScoringContext
): number {
  const groupStandings = ctx.realGroupStandings.filter(
    (s) => s.group_name === pick.group_name
  )

  let points = 0

  // 1st place: 2 pts
  if (pick.picked_1st_id) {
    const first = groupStandings.find((s) => s.position === 1)
    if (first && first.team_id === pick.picked_1st_id) {
      points += 2
    }
  }

  // 2nd place: 1 pt
  if (pick.picked_2nd_id) {
    const second = groupStandings.find((s) => s.position === 2)
    if (second && second.team_id === pick.picked_2nd_id) {
      points += 1
    }
  }

  // Advancing third: 1 pt
  // Any team that finished 3rd in their group is considered an advancing third
  // (the 8 best third-place teams advance; position=3 indicates they made it).
  if (pick.picked_3rd_id) {
    const third = groupStandings.find((s) => s.position === 3)
    if (third && third.team_id === pick.picked_3rd_id) {
      points += 1
    }
  }

  return points
}

/**
 * Score all knockout-round picks from picks_json.
 * For each pick entry, find the real match by (round, match_number),
 * and award points if winner_id matches.
 */
export function scoreKnockoutPicks(
  picksJson: PicksJson,
  ctx: ScoringContext
): number {
  let points = 0

  const knockoutRounds = ["r32", "r16", "qf", "sf"] as const

  for (const round of knockoutRounds) {
    const picks = picksJson[round]
    if (!picks) continue
    const roundPts = ROUND_POINTS[round]

    for (const pick of picks) {
      const realMatch = ctx.realMatches.find(
        (m) => m.round === round && m.match_number === pick.match
      )
      if (
        realMatch &&
        realMatch.winner_id &&
        realMatch.winner_id === pick.winner_id
      ) {
        points += roundPts
      }
    }
  }

  // Third place match
  if (picksJson.third_place?.winner_id) {
    const realMatch = ctx.realMatches.find((m) => m.round === "third_place")
    if (
      realMatch &&
      realMatch.winner_id &&
      realMatch.winner_id === picksJson.third_place.winner_id
    ) {
      points += ROUND_POINTS.third_place
    }
  }

  // Final
  if (picksJson.final?.winner_id) {
    const realMatch = ctx.realMatches.find((m) => m.round === "final")
    if (
      realMatch &&
      realMatch.winner_id &&
      realMatch.winner_id === picksJson.final.winner_id
    ) {
      points += ROUND_POINTS.final
    }
  }

  return points
}

/**
 * Score match-level predictions for group stage matches.
 * +1 for correct result (W/D/L), +3 total for exact score.
 */
export function scoreMatchPredictions(
  matchScorePicks: Pick<MatchScorePick, "match_id" | "predicted_score1" | "predicted_score2">[],
  realMatches: Match[]
): number {
  let points = 0

  for (const pick of matchScorePicks) {
    const real = realMatches.find((m) => m.id === pick.match_id)
    if (!real || real.status !== "finished" || real.score1 === null || real.score2 === null) {
      continue
    }

    const predictedResult =
      pick.predicted_score1 > pick.predicted_score2
        ? "team1"
        : pick.predicted_score1 < pick.predicted_score2
        ? "team2"
        : "draw"
    const realResult =
      real.score1 > real.score2 ? "team1" : real.score1 < real.score2 ? "team2" : "draw"

    if (
      pick.predicted_score1 === real.score1 &&
      pick.predicted_score2 === real.score2
    ) {
      points += 3 // exact score (includes correct result)
    } else if (predictedResult === realResult) {
      points += 1 // correct result only
    }
  }

  return points
}

/**
 * Total bracket score: sum of all group picks + match score picks + knockout picks.
 */
export function totalBracketScore(
  groupPicks: GroupPick[],
  picksJson: PicksJson,
  ctx: ScoringContext,
  matchScorePicks?: Pick<MatchScorePick, "match_id" | "predicted_score1" | "predicted_score2">[]
): number {
  const groupTotal = groupPicks.reduce(
    (sum, pick) => sum + scoreGroupPick(pick, ctx),
    0
  )
  const knockoutTotal = scoreKnockoutPicks(picksJson, ctx)
  const matchTotal = matchScorePicks ? scoreMatchPredictions(matchScorePicks, ctx.realMatches) : 0
  return groupTotal + knockoutTotal + matchTotal
}
