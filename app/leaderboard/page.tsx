import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import type { LeaderboardEntry } from "@/types/database"

export default async function GlobalLeaderboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?redirect=/leaderboard")
  }

  // Fetch all leaderboard entries, ordered by pool then rank
  const { data: entries } = await supabase
    .from("leaderboard")
    .select("pool_id, user_id, display_name, avatar_url, total_points, rank")
    .order("pool_id", { ascending: true })
    .order("rank", { ascending: true })

  // Fetch pool names for display
  const poolIds = [...new Set((entries ?? []).map((e) => e.pool_id))]
  const { data: pools } = poolIds.length > 0
    ? await supabase
        .from("pools")
        .select("id, name")
        .in("id", poolIds)
    : { data: [] }

  const poolNameMap = new Map((pools ?? []).map((p) => [p.id, p.name]))

  // Group entries by pool
  const byPool = new Map<string, LeaderboardEntry[]>()
  for (const entry of entries ?? []) {
    const list = byPool.get(entry.pool_id) ?? []
    list.push(entry)
    byPool.set(entry.pool_id, list)
  }

  return (
    <main className="flex-1 bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Global
          </p>
          <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            All pools ranked by total points
          </p>
        </div>

        {byPool.size === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              No scores yet. Check back once matches are played.
            </p>
          </div>
        )}

        {Array.from(byPool.entries()).map(([poolId, poolEntries]) => {
          const poolName = poolNameMap.get(poolId) ?? "Pool"
          return (
            <section key={poolId}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-slate-800">
                  {poolName}
                </h2>
                <Link
                  href={`/pools/${poolId}`}
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  View pool
                </Link>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-12 px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Player</th>
                      <th className="px-4 py-3 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolEntries.map((entry) => (
                      <tr
                        key={entry.user_id}
                        className={`border-b border-slate-100 last:border-0 ${
                          entry.user_id === user.id ? "bg-slate-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-400">
                          {entry.rank}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {entry.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={entry.avatar_url}
                                alt={entry.display_name}
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-500">
                                {entry.display_name?.[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="font-medium text-slate-800">
                              {entry.display_name}
                              {entry.user_id === user.id && (
                                <span className="ml-1 text-xs text-slate-400">
                                  (you)
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {entry.total_points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
