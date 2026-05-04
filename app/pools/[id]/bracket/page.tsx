import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import BracketViewer from "@/components/bracket/BracketViewer"
import type { GroupPick } from "@/types/database"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ user?: string }>
}

export default async function PoolBracketPage({ params, searchParams }: Props) {
  const { id: poolId } = await params
  const { user: targetUserId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?redirect=/pools/${poolId}/bracket`)

  // Load pool
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, invite_code, locked_at")
    .eq("id", poolId)
    .single()

  if (!pool) notFound()

  // Load all pool members with their profiles and bracket status
  const { data: members } = await supabase
    .from("pool_members")
    .select("user_id")
    .eq("pool_id", poolId)

  const memberIds = members?.map((m) => m.user_id) ?? []

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", memberIds)

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id, user_id, submitted_at, total_points, picks_json")
    .eq("pool_id", poolId)

  // Determine which bracket to show
  const viewUserId = targetUserId ?? user.id
  const targetBracket = brackets?.find((b) => b.user_id === viewUserId)

  // Load all teams
  const { data: teams } = await supabase
    .from("teams")
    .select("*")
    .order("group_name")
    .order("name")

  // Load group picks for the target bracket
  let groupPicks: GroupPick[] = []
  if (targetBracket) {
    const { data: gp } = await supabase
      .from("group_picks")
      .select("*")
      .eq("bracket_id", targetBracket.id)
    groupPicks = gp ?? []
  }

  // Load real matches (for scoring overlay)
  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .in("round", ["r32", "r16", "qf", "sf", "final", "third_place"])

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))
  const viewerName = profileMap[viewUserId] ?? "Unknown"

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link href={`/pools/${poolId}`} className="text-sm text-blue-600 hover:underline">
                ← {pool.name}
              </Link>
              <h1 className="text-xl font-bold mt-1">
                {viewUserId === user.id ? "My Bracket" : `${viewerName}'s Bracket`}
              </h1>
            </div>

            {/* Member selector */}
            {memberIds.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Viewing:</span>
                <div className="flex gap-1 flex-wrap">
                  {memberIds.map((uid) => (
                    <Link
                      key={uid}
                      href={uid === user.id
                        ? `/pools/${poolId}/bracket`
                        : `/pools/${poolId}/bracket?user=${uid}`}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        viewUserId === uid
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {profileMap[uid] ?? uid.slice(0, 8)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!targetBracket || !targetBracket.submitted_at ? (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-500 text-lg">
            {viewUserId === user.id
              ? "You haven't submitted your bracket yet."
              : `${viewerName} hasn't submitted their bracket yet.`}
          </p>
          {viewUserId === user.id && new Date() < new Date(pool.locked_at) && (
            <Link
              href={`/bracket/fill?pool=${poolId}`}
              className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Fill My Bracket
            </Link>
          )}
        </div>
      ) : (teams?.length ?? 0) === 0 ? (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-500">Tournament data not yet available. Check back closer to June 11.</p>
        </div>
      ) : (
        <BracketViewer
          teams={teams ?? []}
          groupPicks={groupPicks}
          picksJson={(targetBracket.picks_json as Record<string, unknown> | null) as Parameters<typeof BracketViewer>[0]["picksJson"]}
          matches={matches ?? []}
        />
      )}
    </div>
  )
}
