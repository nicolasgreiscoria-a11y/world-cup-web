import { NextRequest, NextResponse } from "next/server"
import { syncWorldCup } from "@/lib/football-api/sync"
import { applyScoresForAllBrackets } from "@/lib/applyScores"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const syncResult = await syncWorldCup()

  if (syncResult.error) {
    return NextResponse.json({ ...syncResult, scoresUpdated: 0 }, { status: 500 })
  }

  let scoresUpdated = 0
  try {
    const scoreResult = await applyScoresForAllBrackets()
    scoresUpdated = scoreResult.updated
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error applying scores"
    return NextResponse.json({ ...syncResult, scoresUpdated: 0, scoresError: message }, { status: 500 })
  }

  return NextResponse.json({ ...syncResult, scoresUpdated })
}
