"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { submitBracket } from "@/app/bracket/actions";
import type { Team, Match } from "@/types/database";
import type { MatchScorePickInput, GroupPickInput, KnockoutMatchPick, KnockoutPicksJson } from "@/app/bracket/actions";
import {
  computeAllGroupStandings,
  deriveGroupPicks,
  computeBestThirds,
  buildThirdsFromStandings,
  type TeamStanding,
  type ScoreEntry,
  type GroupMatchInput,
} from "@/lib/standingsComputer";

// ─── Types ────────────────────────────────────────────────────────────────────

// Indexed by group_name, value is { first, second, third } team IDs (derived)
type GroupPicks = Record<string, { first: string; second: string; third: string }>;

// matchId → { score1, score2 }
type GroupScores = Record<string, ScoreEntry>;

// ─── R32 matchup definitions ───────────────────────────────────────────────

interface R32Slot {
  matchNum: number;
  labelA: string;
  labelB: string;
  resolveA: (gp: GroupPicks, at: string[]) => string | null;
  resolveB: (gp: GroupPicks, at: string[]) => string | null;
}

const R32_SLOTS: R32Slot[] = [
  // Part A: Winners vs Advancing Thirds
  {
    matchNum: 1,
    labelA: "Group A Winner",
    labelB: "Advancing 3rd #1",
    resolveA: (gp) => gp["A"]?.first ?? null,
    resolveB: (_gp, at) => at[0] ?? null,
  },
  {
    matchNum: 2,
    labelA: "Group B Winner",
    labelB: "Advancing 3rd #2",
    resolveA: (gp) => gp["B"]?.first ?? null,
    resolveB: (_gp, at) => at[1] ?? null,
  },
  {
    matchNum: 3,
    labelA: "Group D Winner",
    labelB: "Advancing 3rd #3",
    resolveA: (gp) => gp["D"]?.first ?? null,
    resolveB: (_gp, at) => at[2] ?? null,
  },
  {
    matchNum: 4,
    labelA: "Group E Winner",
    labelB: "Advancing 3rd #4",
    resolveA: (gp) => gp["E"]?.first ?? null,
    resolveB: (_gp, at) => at[3] ?? null,
  },
  {
    matchNum: 5,
    labelA: "Group G Winner",
    labelB: "Advancing 3rd #5",
    resolveA: (gp) => gp["G"]?.first ?? null,
    resolveB: (_gp, at) => at[4] ?? null,
  },
  {
    matchNum: 6,
    labelA: "Group I Winner",
    labelB: "Advancing 3rd #6",
    resolveA: (gp) => gp["I"]?.first ?? null,
    resolveB: (_gp, at) => at[5] ?? null,
  },
  {
    matchNum: 7,
    labelA: "Group K Winner",
    labelB: "Advancing 3rd #7",
    resolveA: (gp) => gp["K"]?.first ?? null,
    resolveB: (_gp, at) => at[6] ?? null,
  },
  {
    matchNum: 8,
    labelA: "Group L Winner",
    labelB: "Advancing 3rd #8",
    resolveA: (gp) => gp["L"]?.first ?? null,
    resolveB: (_gp, at) => at[7] ?? null,
  },
  // Part B: Winners vs Runner-ups (cross-group)
  {
    matchNum: 9,
    labelA: "Group C Winner",
    labelB: "Group F Runner-up",
    resolveA: (gp) => gp["C"]?.first ?? null,
    resolveB: (gp) => gp["F"]?.second ?? null,
  },
  {
    matchNum: 10,
    labelA: "Group F Winner",
    labelB: "Group C Runner-up",
    resolveA: (gp) => gp["F"]?.first ?? null,
    resolveB: (gp) => gp["C"]?.second ?? null,
  },
  {
    matchNum: 11,
    labelA: "Group J Winner",
    labelB: "Group H Runner-up",
    resolveA: (gp) => gp["J"]?.first ?? null,
    resolveB: (gp) => gp["H"]?.second ?? null,
  },
  {
    matchNum: 12,
    labelA: "Group H Winner",
    labelB: "Group J Runner-up",
    resolveA: (gp) => gp["H"]?.first ?? null,
    resolveB: (gp) => gp["J"]?.second ?? null,
  },
  // Part C: Runner-up vs Runner-up
  {
    matchNum: 13,
    labelA: "Group A Runner-up",
    labelB: "Group B Runner-up",
    resolveA: (gp) => gp["A"]?.second ?? null,
    resolveB: (gp) => gp["B"]?.second ?? null,
  },
  {
    matchNum: 14,
    labelA: "Group G Runner-up",
    labelB: "Group D Runner-up",
    resolveA: (gp) => gp["G"]?.second ?? null,
    resolveB: (gp) => gp["D"]?.second ?? null,
  },
  {
    matchNum: 15,
    labelA: "Group I Runner-up",
    labelB: "Group E Runner-up",
    resolveA: (gp) => gp["I"]?.second ?? null,
    resolveB: (gp) => gp["E"]?.second ?? null,
  },
  {
    matchNum: 16,
    labelA: "Group K Runner-up",
    labelB: "Group L Runner-up",
    resolveA: (gp) => gp["K"]?.second ?? null,
    resolveB: (gp) => gp["L"]?.second ?? null,
  },
];

// Pair up R32 results into R16, QF, SF, Final
function pairWinners(winners: (string | null)[]): { a: string | null; b: string | null }[] {
  const pairs: { a: string | null; b: string | null }[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    pairs.push({ a: winners[i] ?? null, b: winners[i + 1] ?? null });
  }
  return pairs;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function FlagImg({ countryCode, name }: { countryCode: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/32x24/${countryCode.toLowerCase()}.png`}
      alt={name}
      width={32}
      height={24}
      className="rounded-sm object-cover shrink-0"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

interface MatchCardProps {
  matchNum: number;
  teamA: Team | null;
  teamB: Team | null;
  labelA: string;
  labelB: string;
  winnerId: string | null;
  onPick: (teamId: string) => void;
  round: string;
}

function MatchCard({ matchNum, teamA, teamB, labelA, labelB, winnerId, onPick, round }: MatchCardProps) {
  const isComplete = winnerId !== null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {round} &middot; Match {matchNum}
        </span>
      </div>
      <div className="p-2 space-y-1.5">
        {/* Team A */}
        <button
          onClick={() => teamA && onPick(teamA.id)}
          disabled={!teamA}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all",
            teamA
              ? winnerId === teamA.id
                ? "border-2 border-blue-500 bg-blue-50"
                : isComplete
                ? "border border-slate-100 bg-white opacity-50 hover:opacity-75"
                : "border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
              : "border border-dashed border-slate-200 bg-slate-50 cursor-not-allowed"
          )}
        >
          {teamA ? (
            <>
              <FlagImg countryCode={teamA.country_code} name={teamA.name} />
              <span className={cn("text-sm font-medium", winnerId === teamA.id ? "text-blue-700" : "text-slate-800")}>
                {teamA.name}
              </span>
              {winnerId === teamA.id && (
                <span className="ml-auto text-xs font-bold text-blue-600">WIN</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">{labelA}</span>
          )}
        </button>

        {/* VS divider */}
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-xs font-semibold text-slate-300">VS</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        {/* Team B */}
        <button
          onClick={() => teamB && onPick(teamB.id)}
          disabled={!teamB}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all",
            teamB
              ? winnerId === teamB.id
                ? "border-2 border-blue-500 bg-blue-50"
                : isComplete
                ? "border border-slate-100 bg-white opacity-50 hover:opacity-75"
                : "border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
              : "border border-dashed border-slate-200 bg-slate-50 cursor-not-allowed"
          )}
        >
          {teamB ? (
            <>
              <FlagImg countryCode={teamB.country_code} name={teamB.name} />
              <span className={cn("text-sm font-medium", winnerId === teamB.id ? "text-blue-700" : "text-slate-800")}>
                {teamB.name}
              </span>
              {winnerId === teamB.id && (
                <span className="ml-auto text-xs font-bold text-blue-600">WIN</span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400 italic">{labelB}</span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step Indicator ────────────────────────────────────────────────────────

const STEP_LABELS = [
  "Group Scores",
  "Round of 32",
  "Round of 16",
  "Quarter-Finals",
  "Semi-Finals",
  "Final",
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isDone = stepNum < currentStep;

        return (
          <div key={stepNum} className="flex items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors",
                isActive
                  ? "bg-blue-600 border-blue-600 text-white"
                  : isDone
                  ? "bg-green-500 border-green-500 text-white"
                  : "bg-white border-slate-300 text-slate-400"
              )}
            >
              {isDone ? "✓" : stepNum}
            </div>
            <span
              className={cn(
                "text-xs font-medium hidden sm:inline",
                isActive ? "text-blue-700" : isDone ? "text-green-600" : "text-slate-400"
              )}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className={cn("w-4 h-px mx-1", isDone ? "bg-green-400" : "bg-slate-200")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Group Scores Step ─────────────────────────────────────────────────────

interface GroupScoresStepProps {
  groups: Record<string, Team[]>;
  groupMatches: GroupMatchInput[];
  groupScores: GroupScores;
  allStandings: Record<string, TeamStanding[]>;
  teamById: Map<string, Team>;
  onScoreChange: (matchId: string, score1: number | null, score2: number | null) => void;
}

function GroupScoresStep({
  groups,
  groupMatches,
  groupScores,
  allStandings,
  teamById,
  onScoreChange,
}: GroupScoresStepProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(
    Object.keys(groups).sort()[0] ?? null
  );

  const matchesByGroup = useMemo(() => {
    const map: Record<string, GroupMatchInput[]> = {};
    for (const m of groupMatches) {
      const team = teamById.get(m.team1_id);
      const grp = team?.group_name;
      if (!grp) continue;
      if (!map[grp]) map[grp] = [];
      map[grp].push(m);
    }
    return map;
  }, [groupMatches, teamById]);

  const groupNames = Object.keys(groups).sort();

  const completedGroups = groupNames.filter((grp) => {
    const matches = matchesByGroup[grp] ?? [];
    return matches.length > 0 && matches.every((m) => {
      const s = groupScores[m.id];
      return s !== undefined && s.score1 !== null && s.score2 !== null;
    });
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Step 1: Group Stage Scores</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Predict the score of every group match. Standings and advancing thirds are calculated automatically.
        </p>
        <p className={cn(
          "text-sm font-semibold mt-2",
          completedGroups.length === 12 ? "text-green-600" : "text-amber-600"
        )}>
          {completedGroups.length}/12 groups fully predicted
        </p>
      </div>

      <div className="space-y-2">
        {groupNames.map((grp) => {
          const matches = matchesByGroup[grp] ?? [];
          const standings = allStandings[grp] ?? [];
          const isOpen = openGroup === grp;
          const filledCount = matches.filter((m) => {
            const s = groupScores[m.id];
            return s !== undefined;
          }).length;
          const isComplete = filledCount === matches.length && matches.length > 0;

          return (
            <div key={grp} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* Accordion header */}
              <button
                onClick={() => setOpenGroup(isOpen ? null : grp)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold shrink-0">
                  {grp}
                </span>
                <span className="text-sm font-semibold text-slate-700 flex-1">Group {grp}</span>
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  isComplete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                )}>
                  {filledCount}/{matches.length}
                </span>
                <svg
                  className={cn("w-4 h-4 text-slate-400 transition-transform", isOpen && "rotate-180")}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Accordion body */}
              {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
                  {/* Match score inputs */}
                  <div className="space-y-2 pt-3">
                    {matches.map((m) => {
                      const team1 = teamById.get(m.team1_id);
                      const team2 = teamById.get(m.team2_id);
                      const s = groupScores[m.id];

                      return (
                        <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          {/* Team 1 */}
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {team1 && <FlagImg countryCode={team1.country_code} name={team1.name} />}
                            <span className="text-sm font-medium text-slate-800 truncate">
                              {team1?.name ?? "TBD"}
                            </span>
                          </div>

                          {/* Score inputs */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={s?.score1 ?? ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? null : Math.max(0, Math.min(20, parseInt(e.target.value, 10)));
                                onScoreChange(m.id, isNaN(val as number) ? null : val, s?.score2 ?? null);
                              }}
                              className="w-10 text-center rounded-md border border-slate-300 bg-white px-1 py-1 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                            <span className="text-xs font-bold text-slate-400">-</span>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={s?.score2 ?? ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? null : Math.max(0, Math.min(20, parseInt(e.target.value, 10)));
                                onScoreChange(m.id, s?.score1 ?? null, isNaN(val as number) ? null : val);
                              }}
                              className="w-10 text-center rounded-md border border-slate-300 bg-white px-1 py-1 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="0"
                            />
                          </div>

                          {/* Team 2 */}
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                            <span className="text-sm font-medium text-slate-800 truncate text-right">
                              {team2?.name ?? "TBD"}
                            </span>
                            {team2 && <FlagImg countryCode={team2.country_code} name={team2.name} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Live standings preview */}
                  {standings.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Predicted Standings</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-100">
                              <th className="text-left pb-1 w-6">#</th>
                              <th className="text-left pb-1">Team</th>
                              <th className="text-right pb-1 w-7">P</th>
                              <th className="text-right pb-1 w-7">W</th>
                              <th className="text-right pb-1 w-7">D</th>
                              <th className="text-right pb-1 w-7">L</th>
                              <th className="text-right pb-1 w-8">GF</th>
                              <th className="text-right pb-1 w-8">GA</th>
                              <th className="text-right pb-1 w-8">GD</th>
                              <th className="text-right pb-1 w-8 font-bold">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standings.map((row) => {
                              const team = teamById.get(row.teamId);
                              const advancing = row.position === 1 || row.position === 2;
                              const potentialThird = row.position === 3;
                              return (
                                <tr
                                  key={row.teamId}
                                  className={cn(
                                    "border-b border-slate-50",
                                    advancing ? "bg-green-50" : potentialThird ? "bg-orange-50" : ""
                                  )}
                                >
                                  <td className="py-1 pr-1">
                                    <span className={cn(
                                      "inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold",
                                      advancing ? "bg-green-500 text-white" : potentialThird ? "bg-orange-400 text-white" : "bg-slate-200 text-slate-500"
                                    )}>
                                      {row.position}
                                    </span>
                                  </td>
                                  <td className="py-1">
                                    <div className="flex items-center gap-1">
                                      {team && <FlagImg countryCode={team.country_code} name={team.name} />}
                                      <span className="text-slate-700 font-medium truncate max-w-[80px]">{team?.name ?? row.teamId}</span>
                                    </div>
                                  </td>
                                  <td className="py-1 text-right text-slate-500">{row.played}</td>
                                  <td className="py-1 text-right text-slate-500">{row.wins}</td>
                                  <td className="py-1 text-right text-slate-500">{row.draws}</td>
                                  <td className="py-1 text-right text-slate-500">{row.losses}</td>
                                  <td className="py-1 text-right text-slate-500">{row.gf}</td>
                                  <td className="py-1 text-right text-slate-500">{row.ga}</td>
                                  <td className="py-1 text-right text-slate-500">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                                  <td className="py-1 text-right font-bold text-slate-800">{row.points}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="text-xs text-slate-400 mt-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />advancing &nbsp;
                          <span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />potential third
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Knockout Round Step ───────────────────────────────────────────────────

interface KnockoutStepProps {
  roundLabel: string;
  roundKey: keyof KnockoutPicksJson;
  matchups: { matchNum: number; teamAId: string | null; teamBId: string | null; labelA: string; labelB: string }[];
  picks: KnockoutMatchPick[];
  teamById: Map<string, Team>;
  onPick: (roundKey: keyof KnockoutPicksJson, matchNum: number, winnerId: string) => void;
}

function KnockoutStep({ roundLabel, roundKey, matchups, picks, teamById, onPick }: KnockoutStepProps) {
  const pickMap = new Map(picks.map((p) => [p.match, p.winner_id]));

  const pickedCount = matchups.filter((m) => pickMap.has(m.matchNum)).length;
  const total = matchups.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{roundLabel}</h2>
        <p className={cn("text-sm font-semibold mt-1", pickedCount === total ? "text-green-600" : "text-amber-600")}>
          {pickedCount}/{total} matches picked
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {matchups.map((m) => {
          const teamA = m.teamAId ? teamById.get(m.teamAId) ?? null : null;
          const teamB = m.teamBId ? teamById.get(m.teamBId) ?? null : null;
          const winnerId = pickMap.get(m.matchNum) ?? null;

          return (
            <MatchCard
              key={m.matchNum}
              matchNum={m.matchNum}
              teamA={teamA}
              teamB={teamB}
              labelA={m.labelA}
              labelB={m.labelB}
              winnerId={winnerId}
              round={roundLabel}
              onPick={(teamId) => onPick(roundKey, m.matchNum, teamId)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Final Step ─────────────────────────────────────────────────────────────

interface FinalStepProps {
  sfPicks: KnockoutMatchPick[];
  thirdPlacePick: { winner_id: string } | null;
  finalPick: { winner_id: string } | null;
  teamById: Map<string, Team>;
  sfMatchups: { matchNum: number; teamAId: string | null; teamBId: string | null }[];
  onPickThirdPlace: (winnerId: string) => void;
  onPickFinal: (winnerId: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

function FinalStep({
  sfPicks,
  thirdPlacePick,
  finalPick,
  teamById,
  sfMatchups,
  onPickThirdPlace,
  onPickFinal,
  onSubmit,
  isSubmitting,
  submitError,
}: FinalStepProps) {
  const sfPickMap = new Map(sfPicks.map((p) => [p.match, p.winner_id]));

  const finalist1 = sfPickMap.get(1) ? teamById.get(sfPickMap.get(1)!) ?? null : null;
  const finalist2 = sfPickMap.get(2) ? teamById.get(sfPickMap.get(2)!) ?? null : null;

  const sfMatch1 = sfMatchups[0];
  const sfMatch2 = sfMatchups[1];

  const sf1Winner = sfPickMap.get(1);
  const sf2Winner = sfPickMap.get(2);

  const sf1Loser = sf1Winner
    ? sf1Winner === sfMatch1?.teamAId
      ? sfMatch1.teamBId
      : sfMatch1?.teamAId
    : null;

  const sf2Loser = sf2Winner
    ? sf2Winner === sfMatch2?.teamAId
      ? sfMatch2.teamBId
      : sfMatch2?.teamAId
    : null;

  const thirdA = sf1Loser ? teamById.get(sf1Loser) ?? null : null;
  const thirdB = sf2Loser ? teamById.get(sf2Loser) ?? null : null;

  const champion = finalPick?.winner_id ? teamById.get(finalPick.winner_id) ?? null : null;

  const canSubmit = thirdPlacePick !== null && finalPick !== null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Step 6: Final + 3rd Place</h2>
        <p className="text-sm text-slate-500 mt-0.5">Pick your champion and the 3rd place winner.</p>
      </div>

      {/* 3rd Place Match */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">3rd Place Match</h3>
        <MatchCard
          matchNum={1}
          teamA={thirdA}
          teamB={thirdB}
          labelA="SF Match 1 Loser"
          labelB="SF Match 2 Loser"
          winnerId={thirdPlacePick?.winner_id ?? null}
          round="3rd Place"
          onPick={onPickThirdPlace}
        />
      </div>

      {/* Final */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">Final</h3>
        <MatchCard
          matchNum={1}
          teamA={finalist1}
          teamB={finalist2}
          labelA="SF Match 1 Winner"
          labelB="SF Match 2 Winner"
          winnerId={finalPick?.winner_id ?? null}
          round="Final"
          onPick={onPickFinal}
        />
      </div>

      {/* Champion display */}
      {champion && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Your Champion</p>
          <div className="flex items-center justify-center gap-3">
            <FlagImg countryCode={champion.country_code} name={champion.name} />
            <span className="text-2xl font-extrabold text-amber-800">{champion.name}</span>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="space-y-3 pt-4 border-t border-slate-200">
        {submitError && (
          <p className="text-sm text-red-600 font-medium">{submitError}</p>
        )}
        <button
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className={cn(
            "w-full rounded-xl px-6 py-3 text-base font-bold transition-all",
            canSubmit && !isSubmitting
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          )}
        >
          {isSubmitting ? "Submitting..." : "Submit My Bracket"}
        </button>
        <p className="text-xs text-center text-slate-400">
          Once submitted, your bracket cannot be changed.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

interface BracketFillClientProps {
  bracketId: string;
  poolId: string;
  teams: Team[];
  groupMatches: Pick<Match, "id" | "match_number" | "team1_id" | "team2_id" | "round">[];
}

export function BracketFillClient({ bracketId, poolId, teams, groupMatches }: BracketFillClientProps) {
  const router = useRouter();

  // Build lookup maps
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const groups = useMemo(() => {
    const g: Record<string, Team[]> = {};
    for (const team of teams) {
      if (!g[team.group_name]) g[team.group_name] = [];
      g[team.group_name].push(team);
    }
    return g;
  }, [teams]);

  const groupMatchInputs = useMemo(
    () => groupMatches.map((m) => ({ id: m.id, team1_id: m.team1_id ?? "", team2_id: m.team2_id ?? "" })),
    [groupMatches]
  );

  // ─── State ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1–6
  const [groupScores, setGroupScores] = useState<GroupScores>({});

  const [knockoutPicks, setKnockoutPicks] = useState<{
    r32: KnockoutMatchPick[];
    r16: KnockoutMatchPick[];
    qf: KnockoutMatchPick[];
    sf: KnockoutMatchPick[];
    third_place: { winner_id: string } | null;
    final: { winner_id: string } | null;
  }>({
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    third_place: null,
    final: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── Derived: standings from predicted scores ────────────────────────
  const allStandings = useMemo(
    () => computeAllGroupStandings(teams, groupMatchInputs, groupScores),
    [teams, groupMatchInputs, groupScores]
  );

  const derivedGroupPicks = useMemo(
    () => deriveGroupPicks(allStandings),
    [allStandings]
  );

  const advancingThirds = useMemo(() => {
    const thirds = buildThirdsFromStandings(allStandings, teams);
    return computeBestThirds(thirds);
  }, [allStandings, teams]);

  // ─── Score change handler ────────────────────────────────────────────
  const handleScoreChange = useCallback(
    (matchId: string, score1: number | null, score2: number | null) => {
      setGroupScores((prev) => {
        if (score1 === null && score2 === null) {
          const next = { ...prev };
          delete next[matchId];
          return next;
        }
        return { ...prev, [matchId]: { score1, score2 } };
      });
      // Changing group scores invalidates knockout picks since teams may shift
      setKnockoutPicks({ r32: [], r16: [], qf: [], sf: [], third_place: null, final: null });
    },
    []
  );

  // ─── Knockout pick handler ───────────────────────────────────────────
  const handleKnockoutPick = useCallback(
    (roundKey: keyof typeof knockoutPicks, matchNum: number, winnerId: string) => {
      setKnockoutPicks((prev) => {
        if (roundKey === "third_place") {
          return { ...prev, third_place: { winner_id: winnerId } };
        }
        if (roundKey === "final") {
          return { ...prev, final: { winner_id: winnerId } };
        }

        const roundPicks = prev[roundKey] as KnockoutMatchPick[];
        const updated = roundPicks.filter((p) => p.match !== matchNum);
        updated.push({ match: matchNum, winner_id: winnerId });

        const newState = { ...prev, [roundKey]: updated };

        if (roundKey === "r32") {
          newState.r16 = [];
          newState.qf = [];
          newState.sf = [];
          newState.third_place = null;
          newState.final = null;
        } else if (roundKey === "r16") {
          newState.qf = [];
          newState.sf = [];
          newState.third_place = null;
          newState.final = null;
        } else if (roundKey === "qf") {
          newState.sf = [];
          newState.third_place = null;
          newState.final = null;
        } else if (roundKey === "sf") {
          newState.third_place = null;
          newState.final = null;
        }

        return newState;
      });
    },
    []
  );

  // ─── Derive R32 matchups (using computed standings) ─────────────────
  const r32Matchups = useMemo(
    () =>
      R32_SLOTS.map((slot) => ({
        matchNum: slot.matchNum,
        labelA: slot.labelA,
        labelB: slot.labelB,
        teamAId: slot.resolveA(derivedGroupPicks, advancingThirds),
        teamBId: slot.resolveB(derivedGroupPicks, advancingThirds),
      })),
    [derivedGroupPicks, advancingThirds]
  );

  // ─── Derive R16/QF/SF matchups ───────────────────────────────────────
  const r32PickMap = new Map(knockoutPicks.r32.map((p) => [p.match, p.winner_id]));
  const r32Winners = Array.from({ length: 16 }, (_, i) => r32PickMap.get(i + 1) ?? null);
  const r16Pairs = pairWinners(r32Winners);
  const r16Matchups = r16Pairs.map((pair, i) => ({
    matchNum: i + 1,
    labelA: `R32 Match ${i * 2 + 1} Winner`,
    labelB: `R32 Match ${i * 2 + 2} Winner`,
    teamAId: pair.a,
    teamBId: pair.b,
  }));

  const r16PickMap = new Map(knockoutPicks.r16.map((p) => [p.match, p.winner_id]));
  const r16Winners = Array.from({ length: 8 }, (_, i) => r16PickMap.get(i + 1) ?? null);
  const qfPairs = pairWinners(r16Winners);
  const qfMatchups = qfPairs.map((pair, i) => ({
    matchNum: i + 1,
    labelA: `R16 Match ${i * 2 + 1} Winner`,
    labelB: `R16 Match ${i * 2 + 2} Winner`,
    teamAId: pair.a,
    teamBId: pair.b,
  }));

  const qfPickMap = new Map(knockoutPicks.qf.map((p) => [p.match, p.winner_id]));
  const qfWinners = Array.from({ length: 4 }, (_, i) => qfPickMap.get(i + 1) ?? null);
  const sfPairs = pairWinners(qfWinners);
  const sfMatchups = sfPairs.map((pair, i) => ({
    matchNum: i + 1,
    labelA: `QF Match ${i * 2 + 1} Winner`,
    labelB: `QF Match ${i * 2 + 2} Winner`,
    teamAId: pair.a,
    teamBId: pair.b,
  }));

  // ─── Validation ─────────────────────────────────────────────────────
  const isStep1Complete = useMemo(() => {
    return groupMatchInputs.length > 0 &&
      groupMatchInputs.every((m) => {
        const s = groupScores[m.id];
        return s !== undefined && s.score1 !== null && s.score2 !== null;
      });
  }, [groupMatchInputs, groupScores]);

  const isStep2Complete = knockoutPicks.r32.length === 16;
  const isStep3Complete = knockoutPicks.r16.length === 8;
  const isStep4Complete = knockoutPicks.qf.length === 4;
  const isStep5Complete = knockoutPicks.sf.length === 2;
  const isStep6Complete = knockoutPicks.third_place !== null && knockoutPicks.final !== null;

  const stepComplete = [
    isStep1Complete,
    isStep2Complete,
    isStep3Complete,
    isStep4Complete,
    isStep5Complete,
    isStep6Complete,
  ];

  const canGoNext = stepComplete[step - 1] ?? false;

  // ─── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const matchScorePicksInput: MatchScorePickInput[] = Object.entries(groupScores)
      .filter(([, s]) => s.score1 !== null && s.score2 !== null)
      .map(([match_id, s]) => ({
        match_id,
        predicted_score1: s.score1 as number,
        predicted_score2: s.score2 as number,
      }));

    const derivedGroupPicksInput: GroupPickInput[] = Object.entries(derivedGroupPicks).map(
      ([group_name, p]) => ({
        group_name,
        picked_1st_id: p.first,
        picked_2nd_id: p.second,
        picked_3rd_id: p.third,
      })
    );

    const kPicksJson: KnockoutPicksJson = {
      r32: knockoutPicks.r32,
      r16: knockoutPicks.r16,
      qf: knockoutPicks.qf,
      sf: knockoutPicks.sf,
      third_place: knockoutPicks.third_place,
      final: knockoutPicks.final,
    };

    const result = await submitBracket(
      bracketId,
      matchScorePicksInput,
      kPicksJson,
      derivedGroupPicksInput
    );

    if (result.error) {
      setSubmitError(result.error);
      setIsSubmitting(false);
      return;
    }

    router.push(`/pools/${poolId}`);
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Step {step} of 6 — {STEP_LABELS[step - 1]}
          </span>
          <span className="text-xs text-slate-400">
            {stepComplete.filter(Boolean).length}/6 steps complete
          </span>
        </div>
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6">
        {step === 1 && (
          <GroupScoresStep
            groups={groups}
            groupMatches={groupMatchInputs}
            groupScores={groupScores}
            allStandings={allStandings}
            teamById={teamById}
            onScoreChange={handleScoreChange}
          />
        )}

        {step === 2 && (
          <KnockoutStep
            roundLabel="Round of 32"
            roundKey="r32"
            matchups={r32Matchups}
            picks={knockoutPicks.r32}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 3 && (
          <KnockoutStep
            roundLabel="Round of 16"
            roundKey="r16"
            matchups={r16Matchups}
            picks={knockoutPicks.r16}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 4 && (
          <KnockoutStep
            roundLabel="Quarter-Finals"
            roundKey="qf"
            matchups={qfMatchups}
            picks={knockoutPicks.qf}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 5 && (
          <KnockoutStep
            roundLabel="Semi-Finals"
            roundKey="sf"
            matchups={sfMatchups}
            picks={knockoutPicks.sf}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 6 && (
          <FinalStep
            sfPicks={knockoutPicks.sf}
            thirdPlacePick={knockoutPicks.third_place}
            finalPick={knockoutPicks.final}
            teamById={teamById}
            sfMatchups={sfMatchups}
            onPickThirdPlace={(id) => handleKnockoutPick("third_place" as keyof KnockoutPicksJson, 0, id)}
            onPickFinal={(id) => handleKnockoutPick("final" as keyof KnockoutPicksJson, 0, id)}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitError={submitError}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className={cn(
            "rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors",
            step === 1
              ? "border-slate-200 text-slate-300 cursor-not-allowed"
              : "border-slate-300 text-slate-700 hover:bg-slate-50"
          )}
        >
          Previous
        </button>

        {step < 6 && (
          <button
            onClick={() => setStep((s) => Math.min(6, s + 1))}
            disabled={!canGoNext}
            className={cn(
              "rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
              canGoNext
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
