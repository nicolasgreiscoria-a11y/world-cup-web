"use server"

import { syncWorldCup } from "@/lib/football-api/sync"
import { applyScoresForAllBrackets } from "@/lib/applyScores"
import { redirect } from "next/navigation"

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
