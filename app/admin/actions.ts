"use server"

import { syncWorldCup } from "@/lib/football-api/sync"
import { applyScoresForAllBrackets } from "@/lib/applyScores"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/")

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single()

  if (!profile?.is_admin) redirect("/")
}

export async function triggerSync() {
  const syncResult = await syncWorldCup()

  if (syncResult.error) {
    redirect(`/admin?error=${encodeURIComponent(syncResult.error)}`)
  }

  let scoresUpdated = 0
  try {
    const scoreResult = await applyScoresForAllBrackets()
    scoresUpdated = scoreResult.updated
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    redirect(`/admin?error=${encodeURIComponent(message)}`)
  }

  redirect(
    `/admin?synced=1&teams=${syncResult.teamsSeeded ?? 0}&matches=${syncResult.matchesUpdated ?? 0}&scores=${scoresUpdated}`
  )
}

export async function updateMatchScore(formData: FormData) {
  await requireAdmin()

  const matchId = formData.get("matchId") as string
  const score1 = Number(formData.get("score1"))
  const score2 = Number(formData.get("score2"))
  const team1Id = formData.get("team1Id") as string
  const team2Id = formData.get("team2Id") as string

  const winnerId =
    score1 > score2 ? team1Id : score2 > score1 ? team2Id : null

  const supabase = await createAdminClient()
  const { error } = await supabase
    .from("matches")
    .update({ score1, score2, winner_id: winnerId, status: "finished" })
    .eq("id", matchId)

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`)
  }

  let scoresUpdated = 0
  try {
    const scoreResult = await applyScoresForAllBrackets()
    scoresUpdated = scoreResult.updated
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    redirect(`/admin?error=${encodeURIComponent(message)}`)
  }

  redirect(`/admin?synced=1&scores=${scoresUpdated}`)
}

export async function applyScores() {
  await requireAdmin()

  let scoresUpdated = 0
  try {
    const scoreResult = await applyScoresForAllBrackets()
    scoresUpdated = scoreResult.updated
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    redirect(`/admin?error=${encodeURIComponent(message)}`)
  }

  redirect(`/admin?synced=1&scores=${scoresUpdated}`)
}

export async function resetAllScores() {
  await requireAdmin()

  const supabase = await createAdminClient()

  // Clear all match results
  await supabase
    .from("matches")
    .update({ score1: null, score2: null, winner_id: null, status: "scheduled" })
    .neq("status", "scheduled")

  // Reset group standings
  await supabase
    .from("group_standings")
    .update({ position: null, played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0 })
    .gte("played", 0)

  // Zero out all bracket points
  await supabase.from("brackets").update({ total_points: 0 }).gte("total_points", 0)
  await supabase.from("group_picks").update({ points_earned: 0 }).gte("points_earned", 0)
  await supabase.from("bracket_picks").update({ points_earned: 0 }).gte("points_earned", 0)
  await supabase.from("match_score_picks").update({ points_earned: 0 }).gte("points_earned", 0)

  redirect("/admin?reset=1")
}
