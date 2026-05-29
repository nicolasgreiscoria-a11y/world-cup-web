"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import MatchCard from "./MatchCard"
import { KnockoutBracketTree, type BracketMatch } from "./KnockoutBracketTree"
import type { Team, Match, GroupPick } from "@/types/database"
import { THIRD_COMBINATIONS, WINNER_GROUPS } from "@/lib/thirdCombinations"

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
  thirds_key?: string
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

  // Derive R32 teams from group picks — official FIFA WC2026 bracket order
  function deriveR32(): Array<{ team1: Team | null; team2: Team | null; matchNum: number }> {
    const w = (g: string) => getTeam(picksByGroup[g]?.picked_1st_id)
    const r = (g: string) => getTeam(picksByGroup[g]?.picked_2nd_id)

    const thirdsKey = picksJson?.thirds_key ?? null
    const thirdGroupAssignment = thirdsKey ? (THIRD_COMBINATIONS[thirdsKey] ?? null) : null

    // Build winner-group → assigned-third-group mapping (index aligned to WINNER_GROUPS)
    const thirdByWinnerGroup: Partial<Record<string, string>> = {}
    if (thirdGroupAssignment) {
      WINNER_GROUPS.forEach((wg, i) => {
        thirdByWinnerGroup[wg] = thirdGroupAssignment[i]
      })
    }
    const getThird = (wg: string) => {
      const tg = thirdByWinnerGroup[wg]
      return tg ? getTeam(picksByGroup[tg]?.picked_3rd_id) : null
    }

    return [
      // Left side top
      { matchNum: 1,  team1: w("E"), team2: getThird("E") },   // 1E vs 3ABCDF
      { matchNum: 2,  team1: w("I"), team2: getThird("I") },   // 1I vs 3CDFGH
      { matchNum: 3,  team1: r("A"), team2: r("B") },          // 2A vs 2B
      { matchNum: 4,  team1: w("F"), team2: r("C") },          // 1F vs 2C
      // Left side bottom
      { matchNum: 5,  team1: r("K"), team2: r("L") },          // 2K vs 2L
      { matchNum: 6,  team1: w("H"), team2: r("J") },          // 1H vs 2J
      { matchNum: 7,  team1: w("D"), team2: getThird("D") },   // 1D vs 3BEFIJ
      { matchNum: 8,  team1: w("G"), team2: getThird("G") },   // 1G vs 3AEHIJ
      // Right side top
      { matchNum: 9,  team1: w("C"), team2: r("F") },          // 1C vs 2F
      { matchNum: 10, team1: r("E"), team2: r("I") },          // 2E vs 2I
      { matchNum: 11, team1: w("A"), team2: getThird("A") },   // 1A vs 3CEFHI
      { matchNum: 12, team1: w("L"), team2: getThird("L") },   // 1L vs 3EHIJK
      // Right side bottom
      { matchNum: 13, team1: w("J"), team2: r("H") },          // 1J vs 2H
      { matchNum: 14, team1: r("D"), team2: r("G") },          // 2D vs 2G
      { matchNum: 15, team1: w("B"), team2: getThird("B") },   // 1B vs 3EFGIJ
      { matchNum: 16, team1: w("K"), team2: getThird("K") },   // 1K vs 3DEIJL
    ]
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

  // Build BracketMatch arrays for the desktop tree
  function toBracketMatches(
    items: Array<{ team1: Team | null; team2: Team | null; matchNum: number }>,
    roundKey: string
  ): BracketMatch[] {
    return items.map(({ team1, team2, matchNum }) => {
      const realWinnerId = getRealWinner(roundKey, matchNum)
      return {
        matchNum,
        teamA: team1,
        teamB: team2,
        winnerId: realWinnerId ?? getPickedWinner(roundKey as keyof PicksJson, matchNum),
        realWinnerId,
        status: getStatus(roundKey, matchNum),
      }
    })
  }

  const finalTeam1 = getTeam(getPickedWinner("sf", 1))
  const finalTeam2 = getTeam(getPickedWinner("sf", 2))
  const thirdTeam1 = sf[0]
    ? getTeam(getPickedWinner("sf", 1) === sf[0].team1?.id ? sf[0].team2?.id ?? null : sf[0].team1?.id ?? null)
    : null
  const thirdTeam2 = sf[1]
    ? getTeam(getPickedWinner("sf", 2) === sf[1].team1?.id ? sf[1].team2?.id ?? null : sf[1].team1?.id ?? null)
    : null

  const finalRealWinnerId = getRealWinner("final", 1)
  const finalBracketMatch: BracketMatch = {
    matchNum: 1,
    teamA: finalTeam1,
    teamB: finalTeam2,
    winnerId: finalRealWinnerId ?? getPickedWinner("final", 1),
    realWinnerId: finalRealWinnerId,
    status: getStatus("final", 1),
  }

  const thirdRealWinnerId = getRealWinner("third_place", 1)
  const thirdBracketMatch: BracketMatch = {
    matchNum: 1,
    teamA: thirdTeam1,
    teamB: thirdTeam2,
    winnerId: thirdRealWinnerId ?? getPickedWinner("third_place", 1),
    realWinnerId: thirdRealWinnerId,
    status: getStatus("third_place", 1),
  }

  // Groups tab content (shared between mobile + desktop)
  function GroupsGrid({ compact }: { compact?: boolean }) {
    return (
      <div className={cn(
        "grid gap-2",
        compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-4"
      )}>
        {GROUP_NAMES.map((g) => {
          const pick = picksByGroup[g]
          const groupTeams = teams.filter((t) => t.group_name === g)
          return (
            <div
              key={g}
              className={cn(
                "rounded border border-gray-200 bg-white overflow-hidden",
                compact ? "text-xs" : "rounded-lg"
              )}
            >
              <div className={cn(
                "px-2 py-1 bg-gray-50 font-semibold text-gray-700 border-b",
                !compact && "px-3 py-2 text-sm"
              )}>
                Group {g}
              </div>
              {groupTeams.map((t) => {
                const pos =
                  pick?.picked_1st_id === t.id ? "1" :
                  pick?.picked_2nd_id === t.id ? "2" :
                  pick?.picked_3rd_id === t.id ? "3" : null
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1",
                      pos === "1" && "bg-yellow-50",
                      pos === "2" && "bg-gray-50",
                      pos === "3" && "bg-orange-50",
                    )}
                  >
                    <img
                      src={`https://flagcdn.com/16x12/${t.country_code.toLowerCase()}.png`}
                      alt="" width={16} height={12} className="rounded-sm flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                    <span className="truncate flex-1">{t.name}</span>
                    {pos && !compact && (
                      <span className={cn(
                        "text-xs ml-auto",
                        pos === "1" ? "text-yellow-600" : pos === "2" ? "text-gray-500" : "text-orange-500"
                      )}>
                        {POSITION_LABELS[pos]}
                      </span>
                    )}
                    {pos && compact && (
                      <span className={cn(
                        "text-xs ml-auto",
                        pos === "1" ? "text-yellow-600" : pos === "2" ? "text-gray-500" : "text-orange-500"
                      )}>
                        {pos}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  // Mobile tab content
  const tabContent: Record<RoundTab, React.ReactNode> = {
    Groups: <GroupsGrid />,
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
            pickedWinnerId={getPickedWinner("third_place", 1)}
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
            pickedWinnerId={getPickedWinner("final", 1)}
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

      {/* Desktop: groups + bracket tree side by side */}
      <div className="hidden md:block overflow-x-auto">
        <div className="flex gap-6 p-6 min-w-max items-start">
          {/* Groups column */}
          <div className="shrink-0 w-[480px]">
            <div className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1 border-b mb-2">
              Groups
            </div>
            <GroupsGrid compact />
          </div>

          {/* Knockout bracket tree */}
          <KnockoutBracketTree
            r32={toBracketMatches(r32, "r32")}
            r16={toBracketMatches(r16, "r16")}
            qf={toBracketMatches(qf, "qf")}
            sf={toBracketMatches(sf, "sf")}
            final={finalBracketMatch}
            thirdPlace={thirdBracketMatch}
          />
        </div>
      </div>
    </div>
  )
}
