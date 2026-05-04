"use client"

import { cn } from "@/lib/utils"
import type { Team } from "@/types/database"

interface MatchCardProps {
  team1: Team | null
  team2: Team | null
  pickedWinnerId: string | null
  realWinnerId?: string | null
  realScore1?: number | null
  realScore2?: number | null
  status?: "scheduled" | "live" | "finished"
  isSmall?: boolean
}

function TeamRow({
  team,
  isPicked,
  isWinner,
  isLoser,
  score,
  isSmall,
}: {
  team: Team | null
  isPicked: boolean
  isWinner: boolean
  isLoser: boolean
  score?: number | null
  isSmall?: boolean
}) {
  if (!team) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 text-gray-400", isSmall && "py-1.5 px-2")}>
        <span className="text-xs">TBD</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 transition-colors",
        isSmall && "py-1.5 px-2",
        isPicked && !isLoser && "bg-blue-50 font-medium",
        isWinner && "bg-green-50 font-semibold",
        isLoser && "opacity-40 line-through",
      )}
    >
      {/* Flag */}
      <img
        src={`https://flagcdn.com/20x15/${team.country_code.toLowerCase()}.png`}
        alt={team.country_code}
        width={20}
        height={15}
        className="rounded-sm object-cover flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
      />
      <span className={cn("truncate", isSmall ? "text-xs" : "text-sm")}>
        {team.name}
      </span>
      {score != null && (
        <span className="ml-auto text-sm font-semibold text-gray-700">{score}</span>
      )}
    </div>
  )
}

export default function MatchCard({
  team1,
  team2,
  pickedWinnerId,
  realWinnerId,
  realScore1,
  realScore2,
  status = "scheduled",
  isSmall = false,
}: MatchCardProps) {
  const isFinished = status === "finished"
  const isLive = status === "live"

  const team1IsWinner = isFinished && realWinnerId === team1?.id
  const team2IsWinner = isFinished && realWinnerId === team2?.id
  const team1IsLoser = isFinished && realWinnerId !== null && realWinnerId !== team1?.id
  const team2IsLoser = isFinished && realWinnerId !== null && realWinnerId !== team2?.id

  const team1IsPicked = pickedWinnerId === team1?.id
  const team2IsPicked = pickedWinnerId === team2?.id

  return (
    <div
      className={cn(
        "rounded-lg border bg-white overflow-hidden",
        isFinished ? "border-gray-200" : "border-gray-200",
        isLive && "border-yellow-400 ring-1 ring-yellow-300",
        isSmall ? "min-w-[140px]" : "min-w-[180px]",
      )}
    >
      {isLive && (
        <div className="flex items-center gap-1 px-3 py-1 bg-yellow-50 text-xs text-yellow-700 font-medium">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          LIVE
        </div>
      )}
      <TeamRow
        team={team1}
        isPicked={team1IsPicked}
        isWinner={team1IsWinner}
        isLoser={team1IsLoser}
        score={isLive || isFinished ? realScore1 : undefined}
        isSmall={isSmall}
      />
      <div className="border-t border-gray-100" />
      <TeamRow
        team={team2}
        isPicked={team2IsPicked}
        isWinner={team2IsWinner}
        isLoser={team2IsLoser}
        score={isLive || isFinished ? realScore2 : undefined}
        isSmall={isSmall}
      />
    </div>
  )
}
