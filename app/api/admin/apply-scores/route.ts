import { NextRequest, NextResponse } from "next/server"
import { applyScoresForAllBrackets } from "@/lib/applyScores"

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const adminSecret = process.env.ADMIN_SECRET

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await applyScoresForAllBrackets()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
