import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { BracketCompareClient } from "@/components/bracket/BracketCompareClient"
import type { KnockoutPicksJson } from "@/app/bracket/actions"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ComparePage({ params }: Props) {
  const { id: poolId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect(`/login?redirect=/pools/${poolId}/compare`)

  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, locked_at")
    .eq("id", poolId)
    .single()

  if (!pool) notFound()

  // Compare is only available once the tournament has started
  const isLocked = new Date(pool.locked_at) <= new Date()
  if (!isLocked) redirect(`/pools/${poolId}`)

  // Verify the user is a pool member
  const { data: membership } = await supabase
    .from("pool_members")
    .select("id")
    .eq("pool_id", poolId)
    .eq("user_id", user.id)
    .single()

  if (!membership) redirect("/pools")

  // Load all members
  const { data: memberRows } = await supabase
    .from("pool_members")
    .select("user_id")
    .eq("pool_id", poolId)

  const memberIds = memberRows?.map((m) => m.user_id) ?? []

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", memberIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name]))

  // Load all submitted brackets for this pool
  const { data: brackets } = await supabase
    .from("brackets")
    .select("user_id, picks_json, submitted_at")
    .eq("pool_id", poolId)
    .not("submitted_at", "is", null)

  const bracketByUser = Object.fromEntries(
    (brackets ?? []).map((b) => [b.user_id, b.picks_json as KnockoutPicksJson | null])
  )

  // Load all teams for flag display
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, country_code")

  const teamById = Object.fromEntries(
    (teams ?? []).map((t) => [t.id, { name: t.name, country_code: t.country_code }])
  )

  const members = memberIds.map((uid) => ({
    id: uid,
    name: profileMap[uid] ?? uid.slice(0, 8),
    picks: bracketByUser[uid] ?? null,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href={`/pools/${poolId}`} className="text-sm text-blue-600 hover:underline">
            ← {pool.name}
          </Link>
          <h1 className="text-xl font-bold mt-1">Compare Brackets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select two players to compare their knockout picks</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {members.length < 2 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-400">
            Need at least two pool members to compare brackets.
          </div>
        ) : (
          <BracketCompareClient
            members={members}
            teamById={teamById}
            currentUserId={user.id}
          />
        )}
      </div>
    </div>
  )
}
