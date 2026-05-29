"use client"

import { useState } from "react"
import type { KnockoutPicksJson } from "@/app/bracket/actions"

interface Member {
  id: string
  name: string
  picks: KnockoutPicksJson | null
}

interface BracketCompareClientProps {
  members: Member[]
  teamById: Record<string, { name: string; country_code: string }>
  currentUserId: string
}

const ROUND_LABELS: { key: keyof KnockoutPicksJson; label: string }[] = [
  { key: "r32", label: "Round of 32" },
  { key: "r16", label: "Round of 16" },
  { key: "qf", label: "Quarter-Finals" },
  { key: "sf", label: "Semi-Finals" },
  { key: "third_place", label: "3rd Place" },
  { key: "final", label: "Final" },
]

function Flag({ code }: { code: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
      alt=""
      width={16}
      height={12}
      className="rounded-sm inline-block"
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
    />
  )
}

function TeamLabel({ teamId, teamById }: { teamId: string | null; teamById: Record<string, { name: string; country_code: string }> }) {
  if (!teamId) return <span className="text-gray-400 text-sm">TBD</span>
  const team = teamById[teamId]
  if (!team) return <span className="text-gray-400 text-sm text-xs font-mono">{teamId.slice(0, 8)}</span>
  return (
    <span className="flex items-center gap-1 text-sm font-medium">
      <Flag code={team.country_code} />
      {team.name}
    </span>
  )
}

export function BracketCompareClient({ members, teamById, currentUserId }: BracketCompareClientProps) {
  const defaultLeft = currentUserId
  const defaultRight = members.find((m) => m.id !== currentUserId)?.id ?? members[0]?.id ?? ""

  const [leftId, setLeftId] = useState(defaultLeft)
  const [rightId, setRightId] = useState(defaultRight)

  const left = members.find((m) => m.id === leftId)
  const right = members.find((m) => m.id === rightId)

  type ArrayRound = "r32" | "r16" | "qf" | "sf"
  type SingleRound = "third_place" | "final"

  function getPickId(picks: KnockoutPicksJson | null, round: keyof KnockoutPicksJson, matchNum?: number): string | null {
    if (!picks) return null
    if (round === "third_place" || round === "final") {
      const val = picks[round as SingleRound]
      return val?.winner_id ?? null
    }
    if (round === "thirds_key") return null
    const arr = picks[round as ArrayRound]
    if (!Array.isArray(arr)) return null
    const entry = matchNum !== undefined
      ? arr.find((p) => p.match === matchNum)
      : arr[0]
    return entry?.winner_id ?? null
  }

  // Build comparison rows
  type CompareRow = {
    round: string
    matchNum?: number
    leftTeamId: string | null
    rightTeamId: string | null
    agree: boolean
  }

  const rows: CompareRow[] = []
  let totalPicks = 0
  let agreePicks = 0

  for (const { key, label } of ROUND_LABELS) {
    if (key === "thirds_key") continue

    if (key === "third_place" || key === "final") {
      const l = getPickId(left?.picks ?? null, key)
      const r = getPickId(right?.picks ?? null, key)
      const agree = l !== null && r !== null && l === r
      if (l !== null || r !== null) {
        totalPicks++
        if (agree) agreePicks++
      }
      rows.push({ round: label, leftTeamId: l, rightTeamId: r, agree })
    } else {
      const lArr = left?.picks?.[key as ArrayRound] ?? []
      const rArr = right?.picks?.[key as ArrayRound] ?? []
      const maxLen = Math.max(lArr.length, rArr.length)
      for (let i = 0; i < maxLen; i++) {
        const lPick = lArr[i]
        const rPick = rArr[i]
        const l = lPick?.winner_id ?? null
        const r = rPick?.winner_id ?? null
        const agree = l !== null && r !== null && l === r
        if (l !== null || r !== null) {
          totalPicks++
          if (agree) agreePicks++
        }
        rows.push({
          round: i === 0 ? label : "",
          matchNum: lPick?.match ?? rPick?.match,
          leftTeamId: l,
          rightTeamId: r,
          agree,
        })
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Member selectors */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Left
          </label>
          <select
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center pb-2 text-gray-400 font-bold text-sm">vs</div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Right
          </label>
          <select
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary bar */}
      {totalPicks > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-600">
            <span className="font-bold text-gray-900">{agreePicks}</span> of{" "}
            <span className="font-bold text-gray-900">{totalPicks}</span> picks in common
          </span>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-green-100 border border-green-400" />
              Same pick
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-red-100 border border-red-400" />
              Different
            </span>
          </div>
        </div>
      )}

      {/* Comparison table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 px-4 py-2">
          <span>{left?.name ?? "Left"}</span>
          <span className="text-center px-2">Round</span>
          <span className="text-right">{right?.name ?? "Right"}</span>
        </div>

        {rows.map((row, i) => (
          <div
            key={i}
            className={`grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 border-b border-gray-50 last:border-0 ${
              row.agree ? "bg-green-50" : row.leftTeamId && row.rightTeamId ? "bg-red-50" : "bg-white"
            }`}
          >
            <TeamLabel teamId={row.leftTeamId} teamById={teamById} />
            <div className="flex flex-col items-center px-3 min-w-[120px]">
              {row.round && (
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {row.round}
                </span>
              )}
              {row.agree ? (
                <span className="text-green-600 text-base leading-none">✓</span>
              ) : row.leftTeamId && row.rightTeamId ? (
                <span className="text-red-400 text-base leading-none">✗</span>
              ) : null}
            </div>
            <div className="flex justify-end">
              <TeamLabel teamId={row.rightTeamId} teamById={teamById} />
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">
            No submitted brackets to compare yet.
          </div>
        )}
      </div>
    </div>
  )
}
