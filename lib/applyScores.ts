import { createAdminClient } from "@/lib/supabase/server"
import { totalBracketScore } from "@/lib/scoring"
import type { PicksJson } from "@/lib/scoring"
import type { GroupPick, GroupStanding, Match, MatchScorePick } from "@/types/database"

export async function applyScoresForAllBrackets(
  _projectId?: string
): Promise<{ updated: number }> {
  const supabase = await createAdminClient()

  // 1. Fetch all real group standings where position is set
  const { data: groupStandings, error: gsError } = await supabase
    .from("group_standings")
    .select("*")
    .not("position", "is", null)

  if (gsError) {
    throw new Error(`Failed to fetch group_standings: ${gsError.message}`)
  }

  // 2. Fetch all finished matches (for both knockout scoring and match prediction scoring)
  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "finished")

  if (matchError) {
    throw new Error(`Failed to fetch matches: ${matchError.message}`)
  }

  // 3. Fetch all match_score_picks for submitted brackets (batch)
  const { data: allMatchScorePicks, error: mspError } = await supabase
    .from("match_score_picks")
    .select("bracket_id, match_id, predicted_score1, predicted_score2")

  if (mspError) {
    throw new Error(`Failed to fetch match_score_picks: ${mspError.message}`)
  }

  const matchScorePicksByBracket = new Map<string, MatchScorePick[]>()
  for (const pick of allMatchScorePicks ?? []) {
    const list = matchScorePicksByBracket.get(pick.bracket_id) ?? []
    list.push(pick as MatchScorePick)
    matchScorePicksByBracket.set(pick.bracket_id, list)
  }

  const ctx = {
    realGroupStandings: (groupStandings ?? []) as GroupStanding[],
    realMatches: (matches ?? []) as Match[],
  }

  // 4. Fetch all submitted brackets
  const { data: brackets, error: bracketsError } = await supabase
    .from("brackets")
    .select("id, user_id, picks_json")
    .not("submitted_at", "is", null)

  if (bracketsError) {
    throw new Error(`Failed to fetch brackets: ${bracketsError.message}`)
  }

  if (!brackets || brackets.length === 0) {
    return { updated: 0 }
  }

  let updated = 0

  for (const bracket of brackets) {
    // 5a. Fetch group picks for this bracket
    const { data: groupPicks, error: gpError } = await supabase
      .from("group_picks")
      .select("*")
      .eq("bracket_id", bracket.id)

    if (gpError) {
      console.error(
        `Failed to fetch group_picks for bracket ${bracket.id}: ${gpError.message}`
      )
      continue
    }

    const picksJson = (bracket.picks_json ?? {}) as PicksJson
    const matchScorePicks = matchScorePicksByBracket.get(bracket.id)

    // 5b. Calculate total score (includes match prediction bonus if available)
    const totalPoints = totalBracketScore(
      (groupPicks ?? []) as GroupPick[],
      picksJson,
      ctx,
      matchScorePicks
    )

    // 4c. Update brackets.total_points
    const { error: updateError } = await supabase
      .from("brackets")
      .update({ total_points: totalPoints })
      .eq("id", bracket.id)

    if (updateError) {
      console.error(
        `Failed to update bracket ${bracket.id}: ${updateError.message}`
      )
      continue
    }

    updated++
  }

  return { updated }
}
