import { createClient } from "@/lib/supabase/server"
import type { GroupStanding, Team } from "@/types/database"

interface StandingWithTeam extends GroupStanding {
  team: Team
}

interface GroupData {
  letter: string
  standings: StandingWithTeam[]
}

const ALL_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]

export default async function GroupsPage() {
  const supabase = await createClient()

  const { data: rawStandings } = await supabase
    .from("group_standings")
    .select("*, team:teams(*)")
    .order("points", { ascending: false })

  // Cast — Supabase returns the join inline
  const standings = (rawStandings ?? []) as unknown as StandingWithTeam[]

  const hasData = standings.length > 0

  // Group and sort per FIFA tiebreakers: points → GD → GF
  const groups: GroupData[] = ALL_GROUPS.map((letter) => {
    const rows = standings
      .filter((s) => s.group_name === letter)
      .sort((a, b) => {
        const ptsDiff = b.points - a.points
        if (ptsDiff !== 0) return ptsDiff
        const gdA = a.goals_for - a.goals_against
        const gdB = b.goals_for - b.goals_against
        const gdDiff = gdB - gdA
        if (gdDiff !== 0) return gdDiff
        return b.goals_for - a.goals_for
      })
    return { letter, standings: rows }
  })

  return (
    <main className="flex-1 bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-900">
          Group Stage Standings
        </h1>
        <p className="mb-10 text-sm text-slate-500">
          2026 FIFA World Cup &mdash; 12 groups, 48 teams
        </p>

        {!hasData ? (
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-16 text-center shadow-sm">
            <p className="text-lg font-medium text-slate-700">
              Standings will update once the tournament begins (June 11, 2026)
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Check back after the first group-stage matches kick off.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) =>
              group.standings.length === 0 ? null : (
                <GroupTable key={group.letter} group={group} />
              )
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function GroupTable({ group }: { group: GroupData }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-slate-900 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white">
          Group {group.letter}
        </h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 text-left w-6">Pos</th>
            <th className="px-3 py-2 text-left">Team</th>
            <th className="px-2 py-2 text-center">P</th>
            <th className="px-2 py-2 text-center">W</th>
            <th className="px-2 py-2 text-center">D</th>
            <th className="px-2 py-2 text-center">L</th>
            <th className="px-2 py-2 text-center">GF</th>
            <th className="px-2 py-2 text-center">GA</th>
            <th className="px-2 py-2 text-center">GD</th>
            <th className="px-2 py-2 text-center font-bold text-slate-600">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.standings.map((s, idx) => {
            const gd = s.goals_for - s.goals_against
            const advances = idx < 2
            return (
              <tr
                key={s.id}
                className={[
                  "border-b border-slate-50 last:border-0",
                  advances ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-transparent",
                ].join(" ")}
              >
                <td className="px-3 py-2 text-center text-slate-400 font-medium">{idx + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {s.team?.flag_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.team.flag_url}
                        alt={s.team.name}
                        className="h-4 w-6 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="inline-block h-4 w-6 rounded-sm bg-slate-200" />
                    )}
                    <span className="font-medium text-slate-800 truncate max-w-[100px]">
                      {s.team?.name ?? "TBD"}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2 text-center text-slate-600">{s.played}</td>
                <td className="px-2 py-2 text-center text-slate-600">{s.wins}</td>
                <td className="px-2 py-2 text-center text-slate-600">{s.draws}</td>
                <td className="px-2 py-2 text-center text-slate-600">{s.losses}</td>
                <td className="px-2 py-2 text-center text-slate-600">{s.goals_for}</td>
                <td className="px-2 py-2 text-center text-slate-600">{s.goals_against}</td>
                <td className="px-2 py-2 text-center text-slate-600">
                  {gd > 0 ? `+${gd}` : gd}
                </td>
                <td className="px-2 py-2 text-center font-bold text-slate-900">{s.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
