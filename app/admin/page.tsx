import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { triggerSync } from "./actions"
import type { Match } from "@/types/database"

const ROUND_LABELS: Record<string, string> = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-Finals",
  sf: "Semi-Finals",
  third_place: "Third Place Play-off",
  final: "Final",
}

const ROUND_ORDER = ["group", "r32", "r16", "qf", "sf", "third_place", "final"]

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  if (user.email !== process.env.ADMIN_EMAIL) {
    redirect("/")
  }

  // Fetch all matches then look up team names separately to avoid FK hint issues
  const { data: rawMatches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true })

  const baseMatches = (rawMatches ?? []) as Match[]

  // Build a team id → name map
  const { data: allTeams } = await supabase.from("teams").select("id, name")
  const teamNameById = new Map<string, string>()
  for (const t of allTeams ?? []) {
    teamNameById.set(t.id, t.name)
  }

  const matches = baseMatches.map((m) => ({
    ...m,
    team1: m.team1_id ? { name: teamNameById.get(m.team1_id) ?? "TBD" } : null,
    team2: m.team2_id ? { name: teamNameById.get(m.team2_id) ?? "TBD" } : null,
  }))

  // Group by round
  const byRound = new Map<string, typeof matches>()
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? []
    arr.push(m)
    byRound.set(m.round, arr)
  }

  const totalMatches = matches.length
  const finishedMatches = matches.filter((m) => m.status === "finished").length
  const liveMatches = matches.filter((m) => m.status === "live").length

  return (
    <main className="flex-1 bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl space-y-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Admin Panel</h1>
          <p className="mt-1 text-sm text-slate-500">World Cup 2026 management</p>
        </div>

        {/* Sync section */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Sync Scores</h2>
          <div className="mb-6 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-2xl font-bold text-slate-900">{totalMatches}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Matches</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <p className="text-2xl font-bold text-emerald-700">{finishedMatches}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Finished</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4">
              <p className="text-2xl font-bold text-amber-700">{liveMatches}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Live</p>
            </div>
          </div>

          <form
            action={async () => {
              "use server"
              await triggerSync()
            }}
          >
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Sync Scores from football-data.org
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-400">
            Pulls live results from the football-data.org API, updates match scores and group
            standings, then recalculates all bracket points.
          </p>
        </section>

        {/* Matches list */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Matches</h2>
          </div>

          {matches.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-400">No matches in database yet. Run a sync to populate.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {ROUND_ORDER.map((round) => {
                const roundMatches = byRound.get(round)
                if (!roundMatches || roundMatches.length === 0) return null
                return (
                  <div key={round}>
                    <div className="bg-slate-50 px-6 py-2">
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {ROUND_LABELS[round] ?? round}
                      </h3>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {roundMatches.map((m) => (
                          <tr key={m.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-6 py-2.5 text-slate-600 w-32 shrink-0">
                              {m.kickoff_at
                                ? new Date(m.kickoff_at).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "TBD"}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-800 text-right">
                              {m.team1?.name ?? "TBD"}
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-900 tabular-nums w-20">
                              {m.status === "scheduled"
                                ? "vs"
                                : `${m.score1 ?? "?"} - ${m.score2 ?? "?"}`}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-800">
                              {m.team2?.name ?? "TBD"}
                            </td>
                            <td className="px-6 py-2.5 text-right">
                              <StatusBadge status={m.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Manual override note */}
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="mb-2 text-sm font-bold text-amber-900">Manual Overrides</h2>
          <p className="text-sm text-amber-800">
            To manually correct a match score or standings entry, edit rows directly in the{" "}
            <strong>Supabase dashboard</strong> under Table Editor. After editing, run a sync to
            recalculate all bracket scores.
          </p>
        </section>
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "finished") {
    return (
      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        FT
      </span>
    )
  }
  if (status === "live") {
    return (
      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 animate-pulse">
        LIVE
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
      Scheduled
    </span>
  )
}
