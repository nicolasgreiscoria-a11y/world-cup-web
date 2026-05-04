"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import MatchCard from "./MatchCard"
import type { Team, Match, GroupPick } from "@/types/database"

interface PickEntry {
  match: number
  winner_id: string
}

interface PicksJson {
  r32?: PickEntry[]
  r16?: PickEntry[]
  qf?: PickEntry[]
  sf?: PickEntry[]
  third_place?: { winner_id: string }
  final?: { winner_id: string }
}

interface BracketViewerProps {
  teams: Team[]
  groupPicks: GroupPick[]
  picksJson: PicksJson | null
  matches: Match[]
}

const ROUNDS = ["Groups", "R32", "R16", "QF", "SF", "Final"] as const
type RoundTab = (typeof ROUNDS)[number]

const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]

const POSITION_LABELS: Record<string, string> = {
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
}

export default function BracketViewer({ teams, groupPicks, picksJson, matches }: BracketViewerProps) {
  const [activeTab, setActiveTab] = useState<RoundTab>("R32")

  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))
  const picksByGroup = Object.fromEntries(groupPicks.map((p) => [p.group_name, p]))

  // Real match lookup by round + match_number
  const matchLookup = Object.fromEntries(
    matches.map((m) => [`${m.round}-${m.match_number}`, m])
  )

  function getTeam(id: string | null | undefined): Team | null {
    return id ? (teamById[id] ?? null) : null
  }

  function getPickedWinner(round: keyof PicksJson, matchNum: number): string | null {
    if (!picksJson) return null
    if (round === "third_place") return picksJson.third_place?.winner_id ?? null
    if (round === "final") return picksJson.final?.winner_id ?? null
    const entries = picksJson[round] as PickEntry[] | undefined
    return entries?.find((e) => e.match === matchNum)?.winner_id ?? null
  }

  function getRealWinner(round: string, matchNum: number): string | null {
    return matchLookup[`${round}-${matchNum}`]?.winner_id ?? null
  }

  function getStatus(round: string, matchNum: number): "scheduled" | "live" | "finished" {
    return (matchLookup[`${round}-${matchNum}`]?.status ?? "scheduled") as "scheduled" | "live" | "finished"
  }

  // Derive R32 teams from group picks (same logic as fill wizard)
  function deriveR32(): Array<{ team1: Team | null; team2: Team | null; matchNum: number }> {
    const w = (g: string) => getTeam(picksByGroup[g]?.picked_1st_id)
    const r = (g: string) => getTeam(picksByGroup[g]?.picked_2nd_id)
    const thirds = GROUP_NAMES.map((g) => getTeam(picksByGroup[g]?.picked_3rd_id))
      .filter(Boolean)
      .slice(0, 8) as Team[]

    const part1 = ["A","B","D","E","G","I","K","L"].map((g, i) => ({
      team1: w(g), team2: thirds[i] ?? null, matchNum: i + 1,
    }))
    const part2 = [
      { team1: w("C"), team2: r("F"), matchNum: 9 },
      { team1: w("F"), team2: r("C"), matchNum: 10 },
      { team1: w("J"), team2: r("H"), matchNum: 11 },
      { team1: w("H"), team2: r("J"), matchNum: 12 },
    ]
    const part3 = [
      { team1: r("A"), team2: r("B"), matchNum: 13 },
      { team1: r("G"), team2: r("D"), matchNum: 14 },
      { team1: r("I"), team2: r("E"), matchNum: 15 },
      { team1: r("K"), team2: r("L"), matchNum: 16 },
    ]
    return [...part1, ...part2, ...part3]
  }

  function deriveKnockout(
    round: "r16" | "qf" | "sf",
    prevRound: "r32" | "r16" | "qf",
    count: number
  ): Array<{ team1: Team | null; team2: Team | null; matchNum: number }> {
    return Array.from({ length: count }, (_, i) => {
      const m1 = i * 2 + 1
      const m2 = i * 2 + 2
      return {
        team1: getTeam(getPickedWinner(prevRound, m1)),
        team2: getTeam(getPickedWinner(prevRound, m2)),
        matchNum: i + 1,
      }
    })
  }

  const r32 = deriveR32()
  const r16 = deriveKnockout("r16", "r32", 8)
  const qf = deriveKnockout("qf", "r16", 4)
  const sf = deriveKnockout("sf", "qf", 2)

  // Groups tab content
  function GroupsTab() {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {GROUP_NAMES.map((g) => {
          const pick = picksByGroup[g]
          const groupTeams = teams.filter((t) => t.group_name === g)
          return (
            <div key={g} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 font-semibold text-sm text-gray-700 border-b">
                Group {g}
              </div>
              <div className="divide-y divide-gray-100">
                {groupTeams.map((t) => {
                  const pos =
                    pick?.picked_1st_id === t.id ? "1" :
                    pick?.picked_2nd_id === t.id ? "2" :
                    pick?.picked_3rd_id === t.id ? "3" : null
                  return (
                    <div key={t.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm",
                      pos === "1" && "bg-yellow-50",
                      pos === "2" && "bg-gray-50",
                      pos === "3" && "bg-orange-50",
                    )}>
                      <img
                        src={`https://flagcdn.com/20x15/${t.country_code.toLowerCase()}.png`}
                        alt="" width={20} height={15} className="rounded-sm"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                      />
                      <span className="truncate flex-1">{t.name}</span>
                      {pos && (
                        <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded",
                          pos === "1" ? "bg-yellow-100 text-yellow-700" :
                          pos === "2" ? "bg-gray-200 text-gray-600" :
                          "bg-orange-100 text-orange-700"
                        )}>{POSITION_LABELS[pos]}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  function RoundColumn({
    label,
    matches: roundMatches,
    roundKey,
  }: {
    label: string
    matches: Array<{ team1: Team | null; team2: Team | null; matchNum: number }>
    roundKey: string
  }) {
    return (
      <div className="flex flex-col gap-2 min-w-[200px]">
        <div className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b">
          {label}
        </div>
        <div className="flex flex-col gap-2">
          {roundMatches.map(({ team1, team2, matchNum }) => (
            <MatchCard
              key={matchNum}
              team1={team1}
              team2={team2}
              pickedWinnerId={getPickedWinner(roundKey as keyof PicksJson, matchNum)}
              realWinnerId={getRealWinner(roundKey, matchNum)}
              status={getStatus(roundKey, matchNum)}
              isSmall
            />
          ))}
        </div>
      </div>
    )
  }

  const finalTeam1 = getTeam(getPickedWinner("sf", 1))
  const finalTeam2 = getTeam(getPickedWinner("sf", 2))
  const thirdTeam1 = sf[0] ? getTeam(getPickedWinner("sf", 1) === sf[0].team1?.id ? sf[0].team2?.id ?? null : sf[0].team1?.id ?? null) : null
  const thirdTeam2 = sf[1] ? getTeam(getPickedWinner("sf", 2) === sf[1].team1?.id ? sf[1].team2?.id ?? null : sf[1].team1?.id ?? null) : null

  const tabContent: Record<RoundTab, React.ReactNode> = {
    Groups: <GroupsTab />,
    R32: (
      <div className="flex flex-col gap-2 p-4">
        {r32.map(({ team1, team2, matchNum }) => (
          <MatchCard key={matchNum} team1={team1} team2={team2}
            pickedWinnerId={getPickedWinner("r32", matchNum)}
            realWinnerId={getRealWinner("r32", matchNum)}
            status={getStatus("r32", matchNum)} />
        ))}
      </div>
    ),
    R16: (
      <div className="flex flex-col gap-2 p-4">
        {r16.map(({ team1, team2, matchNum }) => (
          <MatchCard key={matchNum} team1={team1} team2={team2}
            pickedWinnerId={getPickedWinner("r16", matchNum)}
            realWinnerId={getRealWinner("r16", matchNum)}
            status={getStatus("r16", matchNum)} />
        ))}
      </div>
    ),
    QF: (
      <div className="flex flex-col gap-2 p-4">
        {qf.map(({ team1, team2, matchNum }) => (
          <MatchCard key={matchNum} team1={team1} team2={team2}
            pickedWinnerId={getPickedWinner("qf", matchNum)}
            realWinnerId={getRealWinner("qf", matchNum)}
            status={getStatus("qf", matchNum)} />
        ))}
      </div>
    ),
    SF: (
      <div className="flex flex-col gap-2 p-4">
        {sf.map(({ team1, team2, matchNum }) => (
          <MatchCard key={matchNum} team1={team1} team2={team2}
            pickedWinnerId={getPickedWinner("sf", matchNum)}
            realWinnerId={getRealWinner("sf", matchNum)}
            status={getStatus("sf", matchNum)} />
        ))}
      </div>
    ),
    Final: (
      <div className="flex flex-col gap-6 p-4 items-center">
        <div className="w-full max-w-xs">
          <p className="text-xs text-center text-gray-500 mb-2 font-medium uppercase tracking-wide">
            3rd Place Match
          </p>
          <MatchCard
            team1={thirdTeam1}
            team2={thirdTeam2}
            pickedWinnerId={getPickedWinner("third_place", 0)}
            realWinnerId={getRealWinner("third_place", 1)}
            status={getStatus("third_place", 1)}
          />
        </div>
        <div className="w-full max-w-xs">
          <p className="text-xs text-center text-gray-500 mb-2 font-medium uppercase tracking-wide">
            Final
          </p>
          <MatchCard
            team1={finalTeam1}
            team2={finalTeam2}
            pickedWinnerId={getPickedWinner("final", 0)}
            realWinnerId={getRealWinner("final", 1)}
            status={getStatus("final", 1)}
          />
        </div>
        {picksJson?.final?.winner_id && (
          <div className="text-center mt-2">
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide font-medium">Predicted Champion</p>
            <div className="flex items-center gap-2 justify-center">
              <img
                src={`https://flagcdn.com/32x24/${teamById[picksJson.final.winner_id]?.country_code.toLowerCase()}.png`}
                alt="" width={32} height={24} className="rounded"
              />
              <span className="text-lg font-bold">
                {teamById[picksJson.final.winner_id]?.name ?? "—"}
              </span>
              <span className="text-xl">🏆</span>
            </div>
          </div>
        )}
      </div>
    ),
  }

  return (
    <div className="w-full">
      {/* Mobile / tablet: tabs */}
      <div className="md:hidden">
        <div className="flex overflow-x-auto border-b border-gray-200 bg-white sticky top-0 z-10">
          {ROUNDS.map((r) => (
            <button
              key={r}
              onClick={() => setActiveTab(r)}
              className={cn(
                "flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === r
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div>{tabContent[activeTab]}</div>
      </div>

      {/* Desktop: horizontal scroll bracket */}
      <div className="hidden md:block overflow-x-auto">
        <div className="flex gap-6 p-6 min-w-max items-start">
          <div className="min-w-[520px]">
            <div className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b mb-2">
              Groups
            </div>
            <div className="grid grid-cols-3 gap-2">
              {GROUP_NAMES.map((g) => {
                const pick = picksByGroup[g]
                const groupTeams = teams.filter((t) => t.group_name === g)
                return (
                  <div key={g} className="rounded border border-gray-200 bg-white overflow-hidden text-xs">
                    <div className="px-2 py-1 bg-gray-50 font-semibold text-gray-700 border-b">Group {g}</div>
                    {groupTeams.map((t) => {
                      const pos = pick?.picked_1st_id === t.id ? "1" : pick?.picked_2nd_id === t.id ? "2" : pick?.picked_3rd_id === t.id ? "3" : null
                      return (
                        <div key={t.id} className={cn("flex items-center gap-1 px-2 py-1",
                          pos === "1" && "bg-yellow-50", pos === "2" && "bg-gray-50", pos === "3" && "bg-orange-50"
                        )}>
                          <img src={`https://flagcdn.com/16x12/${t.country_code.toLowerCase()}.png`} alt="" width={16} height={12} className="rounded-sm flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                          <span className="truncate flex-1">{t.name}</span>
                          {pos && <span className={cn("text-xs ml-auto", pos==="1"?"text-yellow-600":pos==="2"?"text-gray-500":"text-orange-500")}>{pos}st</span>}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          <RoundColumn label="R32" roundKey="r32" matches={r32} />
          <RoundColumn label="R16" roundKey="r16" matches={r16} />
          <RoundColumn label="QF" roundKey="qf" matches={qf} />
          <RoundColumn label="SF" roundKey="sf" matches={sf} />

          {/* Final column */}
          <div className="flex flex-col gap-4 min-w-[200px]">
            <div className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b">
              Final
            </div>
            <div>
              <p className="text-xs text-gray-400 text-center mb-1">3rd Place</p>
              <MatchCard team1={thirdTeam1} team2={thirdTeam2}
                pickedWinnerId={getPickedWinner("third_place", 0)}
                realWinnerId={getRealWinner("third_place", 1)}
                status={getStatus("third_place", 1)} isSmall />
            </div>
            <div>
              <p className="text-xs text-gray-400 text-center mb-1">Champion</p>
              <MatchCard team1={finalTeam1} team2={finalTeam2}
                pickedWinnerId={getPickedWinner("final", 0)}
                realWinnerId={getRealWinner("final", 1)}
                status={getStatus("final", 1)} isSmall />
            </div>
            {picksJson?.final?.winner_id && (
              <div className="text-center mt-1">
                <div className="flex items-center gap-1.5 justify-center">
                  <img src={`https://flagcdn.com/24x18/${teamById[picksJson.final.winner_id]?.country_code.toLowerCase()}.png`}
                    alt="" width={24} height={18} className="rounded" />
                  <span className="font-bold text-sm">{teamById[picksJson.final.winner_id]?.name}</span>
                  <span>🏆</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
