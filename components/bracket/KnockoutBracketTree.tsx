"use client"

import { cn } from "@/lib/utils"
import type { Team } from "@/types/database"

const BRACKET_HEIGHT = 840

export interface BracketMatch {
  matchNum: number
  teamA: Team | null
  teamB: Team | null
  labelA?: string
  labelB?: string
  winnerId: string | null
  realWinnerId?: string | null
  status?: "scheduled" | "live" | "finished"
}

export type KnockoutRound = "r32" | "r16" | "qf" | "sf" | "third_place" | "final"

interface KnockoutBracketTreeProps {
  r32: BracketMatch[]
  r16: BracketMatch[]
  qf: BracketMatch[]
  sf: BracketMatch[]
  thirdPlace: BracketMatch
  final: BracketMatch
  onPick?: (round: KnockoutRound, matchNum: number, teamId: string) => void
}

function TeamRow({
  team,
  label,
  isPicked,
  isWinner,
  isLoser,
  onClick,
}: {
  team: Team | null
  label?: string
  isPicked: boolean
  isWinner: boolean
  isLoser: boolean
  onClick?: () => void
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick() } : undefined}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 w-full select-none",
        onClick && "cursor-pointer",
        onClick && !isLoser && "hover:bg-slate-100",
        onClick && isLoser && "hover:bg-slate-50",
        isWinner && "bg-green-50",
        isPicked && !isWinner && !isLoser && "bg-blue-50",
        isLoser && "opacity-40",
      )}
    >
      {team ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://flagcdn.com/16x12/${team.country_code.toLowerCase()}.png`}
            alt=""
            width={16}
            height={12}
            className="rounded-sm shrink-0 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          <span className={cn(
            "text-xs truncate flex-1 leading-none",
            (isWinner || isPicked) && !isLoser ? "font-semibold" : "font-normal",
            isWinner ? "text-green-700" : isPicked && !isLoser ? "text-blue-700" : "text-slate-700",
            isLoser && "line-through",
          )}>
            {team.name}
          </span>
          {isWinner && <span className="text-green-600 text-xs ml-auto shrink-0">✓</span>}
          {isPicked && !isWinner && !isLoser && <span className="text-blue-500 text-xs ml-auto shrink-0">›</span>}
        </>
      ) : (
        <span className="text-xs text-slate-300 italic truncate">{label ?? "TBD"}</span>
      )}
    </div>
  )
}

function TreeMatchCard({
  match,
  onPick,
}: {
  match: BracketMatch
  onPick?: (teamId: string) => void
}) {
  const { teamA, teamB, winnerId, realWinnerId, status, labelA, labelB } = match
  const isFinished = status === "finished"

  const effectiveWinnerId = isFinished ? (realWinnerId ?? null) : winnerId
  const hasPick = effectiveWinnerId !== null

  const teamAWins = hasPick && effectiveWinnerId === teamA?.id
  const teamBWins = hasPick && effectiveWinnerId === teamB?.id
  const teamALoses = hasPick && !teamAWins
  const teamBLoses = hasPick && !teamBWins

  const teamAPicked = !isFinished && winnerId === teamA?.id
  const teamBPicked = !isFinished && winnerId === teamB?.id

  return (
    <div className={cn(
      "rounded border bg-white overflow-hidden shrink-0 w-[150px]",
      status === "live" ? "border-yellow-400" : "border-slate-200",
    )}>
      {status === "live" && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-700 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
          LIVE
        </div>
      )}
      <TeamRow
        team={teamA}
        label={labelA}
        isPicked={teamAPicked}
        isWinner={teamAWins}
        isLoser={teamALoses}
        onClick={onPick && teamA && !isFinished ? () => onPick(teamA.id) : undefined}
      />
      <div className="h-px bg-slate-100" />
      <TeamRow
        team={teamB}
        label={labelB}
        isPicked={teamBPicked}
        isWinner={teamBWins}
        isLoser={teamBLoses}
        onClick={onPick && teamB && !isFinished ? () => onPick(teamB.id) : undefined}
      />
    </div>
  )
}

function BracketColumn({
  label,
  matches,
  showConnector,
  onPick,
}: {
  label: string
  matches: BracketMatch[]
  showConnector: boolean
  onPick?: (matchNum: number, teamId: string) => void
}) {
  return (
    <div className="flex flex-col shrink-0">
      <div className="h-7 flex items-center justify-center border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex flex-col" style={{ height: BRACKET_HEIGHT }}>
        {matches.map((match, i) => {
          const isTop = i % 2 === 0
          return (
            <div key={match.matchNum} className="flex-1 flex items-center min-h-0">
              <TreeMatchCard
                match={match}
                onPick={onPick ? (teamId) => onPick(match.matchNum, teamId) : undefined}
              />
              {showConnector && (
                <div className="self-stretch w-4 flex flex-col shrink-0">
                  {isTop ? (
                    <>
                      <div className="flex-1" />
                      <div className="flex-1 border-r-2 border-b-2 border-slate-200 rounded-br" />
                    </>
                  ) : (
                    <>
                      <div className="flex-1 border-r-2 border-t-2 border-slate-200 rounded-tr" />
                      <div className="flex-1" />
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function KnockoutBracketTree({
  r32, r16, qf, sf, thirdPlace, final, onPick,
}: KnockoutBracketTreeProps) {
  function makePicker(round: KnockoutRound) {
    if (!onPick) return undefined
    return (matchNum: number, teamId: string) => onPick(round, matchNum, teamId)
  }

  const finalWinnerId = final.status === "finished"
    ? (final.realWinnerId ?? final.winnerId)
    : final.winnerId
  const championTeam = finalWinnerId === final.teamA?.id
    ? final.teamA
    : finalWinnerId === final.teamB?.id
    ? final.teamB
    : null

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex items-start min-w-max">
          <BracketColumn
            label="R32"
            matches={r32}
            showConnector
            onPick={makePicker("r32")}
          />
          <BracketColumn
            label="R16"
            matches={r16}
            showConnector
            onPick={makePicker("r16")}
          />
          <BracketColumn
            label="QF"
            matches={qf}
            showConnector
            onPick={makePicker("qf")}
          />
          <BracketColumn
            label="SF"
            matches={sf}
            showConnector
            onPick={makePicker("sf")}
          />
          {/* Finals column — bronze final (top half) + championship final (bottom half) */}
          <div className="flex flex-col shrink-0">
            <div className="h-7 flex items-center justify-center border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Finals</span>
            </div>
            <div
              className="flex flex-col"
              style={{ height: BRACKET_HEIGHT }}
            >
              {/* Top half: 3rd Place */}
              <div className="flex flex-col justify-center items-start gap-2 px-2 flex-1 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">3rd Place</p>
                <TreeMatchCard
                  match={thirdPlace}
                  onPick={makePicker("third_place") ? (teamId) => onPick!("third_place", 1, teamId) : undefined}
                />
              </div>
              {/* Bottom half: Final + Champion */}
              <div className="flex flex-col justify-center items-start gap-2 px-2 flex-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Final</p>
                <TreeMatchCard
                  match={final}
                  onPick={makePicker("final") ? (teamId) => onPick!("final", 1, teamId) : undefined}
                />
                {championTeam && (
                  <div className="w-[150px] text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Champion</p>
                    <div className="flex items-center gap-1.5 justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://flagcdn.com/20x15/${championTeam.country_code.toLowerCase()}.png`}
                        alt=""
                        width={20}
                        height={15}
                        className="rounded-sm"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                      />
                      <span className="text-sm font-bold text-slate-800">{championTeam.name}</span>
                      <span>🏆</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
