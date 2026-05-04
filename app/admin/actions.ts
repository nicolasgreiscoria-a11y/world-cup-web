"use server"

import { syncWorldCup } from "@/lib/football-api/sync"
import { applyScoresForAllBrackets } from "@/lib/applyScores"

export async function triggerSync(): Promise<{
  matchesUpdated?: number
  teamsSeeded?: number
  scoresUpdated?: number
  error?: string
}> {
  const syncResult = await syncWorldCup()

  if (syncResult.error) {
    return { ...syncResult, scoresUpdated: 0 }
  }

  let scoresUpdated = 0
  try {
    const scoreResult = await applyScoresForAllBrackets()
    scoresUpdated = scoreResult.updated
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return { ...syncResult, scoresUpdated: 0, error: message }
  }

  return { ...syncResult, scoresUpdated }
}
