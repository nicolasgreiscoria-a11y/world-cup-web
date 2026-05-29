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
} from "@/lib/standingsComputer"
import { resolveThirdsAssignment, THIRD_COMBINATIONS, WINNER_GROUPS } from "@/lib/thirdCombinations";
import { KnockoutBracketTree, type BracketMatch, type KnockoutRound } from "./KnockoutBracketTree";

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupPicks = Record<string, { first: string; second: string; third: string }>;
type GroupScores = Record<string, ScoreEntry>;

// ─── R32 matchup definitions ───────────────────────────────────────────────

interface R32Slot {
  matchNum: number;
  labelA: string;
  labelB: string;
  resolveA: (gp: GroupPicks) => string | null;
  resolveB: (gp: GroupPicks) => string | null;
}

// Fixed R32 matchups (no advancing thirds involved) — official FIFA WC2026 bracket order
const FIXED_R32_SLOTS: R32Slot[] = [
  {
    matchNum: 3,
    labelA: "Group A Runner-up",
    labelB: "Group B Runner-up",
    resolveA: (gp) => gp["A"]?.second ?? null,
    resolveB: (gp) => gp["B"]?.second ?? null,
  },
  {
    matchNum: 4,
    labelA: "Group F Winner",
    labelB: "Group C Runner-up",
    resolveA: (gp) => gp["F"]?.first ?? null,
    resolveB: (gp) => gp["C"]?.second ?? null,
  },
  {
    matchNum: 5,
    labelA: "Group K Runner-up",
    labelB: "Group L Runner-up",
    resolveA: (gp) => gp["K"]?.second ?? null,
    resolveB: (gp) => gp["L"]?.second ?? null,
  },
  {
    matchNum: 6,
    labelA: "Group H Winner",
    labelB: "Group J Runner-up",
    resolveA: (gp) => gp["H"]?.first ?? null,
    resolveB: (gp) => gp["J"]?.second ?? null,
  },
  {
    matchNum: 9,
    labelA: "Group C Winner",
    labelB: "Group F Runner-up",
    resolveA: (gp) => gp["C"]?.first ?? null,
    resolveB: (gp) => gp["F"]?.second ?? null,
  },
  {
    matchNum: 10,
    labelA: "Group E Runner-up",
    labelB: "Group I Runner-up",
    resolveA: (gp) => gp["E"]?.second ?? null,
    resolveB: (gp) => gp["I"]?.second ?? null,
  },
  {
    matchNum: 13,
    labelA: "Group J Winner",
    labelB: "Group H Runner-up",
    resolveA: (gp) => gp["J"]?.first ?? null,
    resolveB: (gp) => gp["H"]?.second ?? null,
  },
  {
    matchNum: 14,
    labelA: "Group D Runner-up",
    labelB: "Group G Runner-up",
    resolveA: (gp) => gp["D"]?.second ?? null,
    resolveB: (gp) => gp["G"]?.second ?? null,
  },
];

// matchNum in the official bracket for each WINNER_GROUPS[i] winner-vs-third slot
// WINNER_GROUPS = ["A", "B", "D", "E", "G", "I", "K", "L"]
// index:             0    1    2    3    4    5    6    7
const WINNER_THIRD_MATCH_NUMS = [11, 15, 7, 1, 8, 2, 16, 12] as const;

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

// ─── Step Indicator ────────────────────────────────────────────────────────

const STEP_LABELS = ["Group Scores", "Knockout Bracket"];

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

              {isOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
                  <div className="space-y-2 pt-3">
                    {matches.map((m) => {
                      const team1 = teamById.get(m.team1_id);
                      const team2 = teamById.get(m.team2_id);
                      const s = groupScores[m.id];

                      return (
                        <div key={m.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {team1 && <FlagImg countryCode={team1.country_code} name={team1.name} />}
                            <span className="text-sm font-medium text-slate-800 truncate">
                              {team1?.name ?? "TBD"}
                            </span>
                          </div>

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

// ─── Main Component ────────────────────────────────────────────────────────

interface BracketFillClientProps {
  bracketId: string;
  poolId: string;
  teams: Team[];
  groupMatches: Pick<Match, "id" | "match_number" | "team1_id" | "team2_id" | "round">[];
}

export function BracketFillClient({ bracketId, poolId, teams, groupMatches }: BracketFillClientProps) {
  const router = useRouter();

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
  const [step, setStep] = useState(1); // 1–2
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

  const { assignment: thirdsAssignment, key: thirdsKey } = useMemo(
    () => resolveThirdsAssignment(advancingThirds),
    [advancingThirds]
  );

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
      setKnockoutPicks({ r32: [], r16: [], qf: [], sf: [], third_place: null, final: null });
    },
    []
  );

  // ─── Knockout pick handler ───────────────────────────────────────────
  const handleKnockoutPick = useCallback(
    (roundKey: KnockoutRound, matchNum: number, winnerId: string) => {
      setKnockoutPicks((prev) => {
        if (roundKey === "third_place") {
          if (prev.third_place?.winner_id === winnerId) return prev;
          return { ...prev, third_place: { winner_id: winnerId } };
        }
        if (roundKey === "final") {
          if (prev.final?.winner_id === winnerId) return prev;
          return { ...prev, final: { winner_id: winnerId } };
        }

        const roundPicks = prev[roundKey] as KnockoutMatchPick[];
        const existing = roundPicks.find((p) => p.match === matchNum);
        if (existing?.winner_id === winnerId) return prev;

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

  // ─── Derive R32 matchups ─────────────────────────────────────────────
  const r32Matchups = useMemo(() => {
    const winnerVsThird = WINNER_GROUPS.map((winnerGroup, i) => {
      const thirdGroup = thirdsKey ? (THIRD_COMBINATIONS[thirdsKey]?.[i] ?? null) : null;
      return {
        matchNum: WINNER_THIRD_MATCH_NUMS[i],
        labelA: `Group ${winnerGroup} Winner`,
        labelB: thirdGroup ? `3rd Group ${thirdGroup}` : "Advancing 3rd",
        teamAId: derivedGroupPicks[winnerGroup]?.first ?? null,
        teamBId: thirdsAssignment[i] ?? null,
      };
    });
    const fixed = FIXED_R32_SLOTS.map((slot) => ({
      matchNum: slot.matchNum,
      labelA: slot.labelA,
      labelB: slot.labelB,
      teamAId: slot.resolveA(derivedGroupPicks),
      teamBId: slot.resolveB(derivedGroupPicks),
    }));
    return [...winnerVsThird, ...fixed].sort((a, b) => a.matchNum - b.matchNum);
  }, [derivedGroupPicks, thirdsAssignment, thirdsKey]);

  // ─── Derive downstream matchups ──────────────────────────────────────
  const r32PickMap = useMemo(
    () => new Map(knockoutPicks.r32.map((p) => [p.match, p.winner_id])),
    [knockoutPicks.r32]
  );
  const r16PickMap = useMemo(
    () => new Map(knockoutPicks.r16.map((p) => [p.match, p.winner_id])),
    [knockoutPicks.r16]
  );
  const qfPickMap = useMemo(
    () => new Map(knockoutPicks.qf.map((p) => [p.match, p.winner_id])),
    [knockoutPicks.qf]
  );
  const sfPickMap = useMemo(
    () => new Map(knockoutPicks.sf.map((p) => [p.match, p.winner_id])),
    [knockoutPicks.sf]
  );

  const r16Matchups = useMemo(() => {
    const r32Winners = Array.from({ length: 16 }, (_, i) => r32PickMap.get(i + 1) ?? null);
    return pairWinners(r32Winners).map((pair, i) => ({
      matchNum: i + 1,
      labelA: `R32 Match ${i * 2 + 1} Winner`,
      labelB: `R32 Match ${i * 2 + 2} Winner`,
      teamAId: pair.a,
      teamBId: pair.b,
    }));
  }, [r32PickMap]);

  const qfMatchups = useMemo(() => {
    const r16Winners = Array.from({ length: 8 }, (_, i) => r16PickMap.get(i + 1) ?? null);
    return pairWinners(r16Winners).map((pair, i) => ({
      matchNum: i + 1,
      labelA: `R16 Match ${i * 2 + 1} Winner`,
      labelB: `R16 Match ${i * 2 + 2} Winner`,
      teamAId: pair.a,
      teamBId: pair.b,
    }));
  }, [r16PickMap]);

  const sfMatchups = useMemo(() => {
    const qfWinners = Array.from({ length: 4 }, (_, i) => qfPickMap.get(i + 1) ?? null);
    return pairWinners(qfWinners).map((pair, i) => ({
      matchNum: i + 1,
      labelA: `QF Match ${i * 2 + 1} Winner`,
      labelB: `QF Match ${i * 2 + 2} Winner`,
      teamAId: pair.a,
      teamBId: pair.b,
    }));
  }, [qfPickMap]);

  // ─── Build BracketMatch arrays for the tree ──────────────────────────
  const toTeam = useCallback(
    (id: string | null | undefined) => (id ? teamById.get(id) ?? null : null),
    [teamById]
  );

  const r32TreeMatches = useMemo<BracketMatch[]>(
    () => r32Matchups.map((m) => ({
      matchNum: m.matchNum,
      teamA: toTeam(m.teamAId),
      teamB: toTeam(m.teamBId),
      labelA: m.labelA,
      labelB: m.labelB,
      winnerId: r32PickMap.get(m.matchNum) ?? null,
    })),
    [r32Matchups, r32PickMap, toTeam]
  );

  const r16TreeMatches = useMemo<BracketMatch[]>(
    () => r16Matchups.map((m) => ({
      matchNum: m.matchNum,
      teamA: toTeam(m.teamAId),
      teamB: toTeam(m.teamBId),
      labelA: m.labelA,
      labelB: m.labelB,
      winnerId: r16PickMap.get(m.matchNum) ?? null,
    })),
    [r16Matchups, r16PickMap, toTeam]
  );

  const qfTreeMatches = useMemo<BracketMatch[]>(
    () => qfMatchups.map((m) => ({
      matchNum: m.matchNum,
      teamA: toTeam(m.teamAId),
      teamB: toTeam(m.teamBId),
      labelA: m.labelA,
      labelB: m.labelB,
      winnerId: qfPickMap.get(m.matchNum) ?? null,
    })),
    [qfMatchups, qfPickMap, toTeam]
  );

  const sfTreeMatches = useMemo<BracketMatch[]>(
    () => sfMatchups.map((m) => ({
      matchNum: m.matchNum,
      teamA: toTeam(m.teamAId),
      teamB: toTeam(m.teamBId),
      labelA: m.labelA,
      labelB: m.labelB,
      winnerId: sfPickMap.get(m.matchNum) ?? null,
    })),
    [sfMatchups, sfPickMap, toTeam]
  );

  const finalTreeMatch = useMemo<BracketMatch>(() => {
    const sf1 = sfMatchups[0];
    const sf2 = sfMatchups[1];
    return {
      matchNum: 1,
      teamA: toTeam(sfPickMap.get(1)),
      teamB: toTeam(sfPickMap.get(2)),
      labelA: sf1 ? `SF ${sf1.matchNum} Winner` : "SF 1 Winner",
      labelB: sf2 ? `SF ${sf2.matchNum} Winner` : "SF 2 Winner",
      winnerId: knockoutPicks.final?.winner_id ?? null,
    };
  }, [sfMatchups, sfPickMap, knockoutPicks.final, toTeam]);

  const thirdPlaceTreeMatch = useMemo<BracketMatch>(() => {
    const sf1 = sfMatchups[0];
    const sf2 = sfMatchups[1];
    const sf1WinnerId = sfPickMap.get(1);
    const sf2WinnerId = sfPickMap.get(2);
    const sf1LoserId = sf1WinnerId
      ? sf1WinnerId === sf1?.teamAId ? sf1?.teamBId : sf1?.teamAId
      : null;
    const sf2LoserId = sf2WinnerId
      ? sf2WinnerId === sf2?.teamAId ? sf2?.teamBId : sf2?.teamAId
      : null;
    return {
      matchNum: 1,
      teamA: toTeam(sf1LoserId),
      teamB: toTeam(sf2LoserId),
      labelA: "SF 1 Loser",
      labelB: "SF 2 Loser",
      winnerId: knockoutPicks.third_place?.winner_id ?? null,
    };
  }, [sfMatchups, sfPickMap, knockoutPicks.third_place, toTeam]);

  // ─── Knockout picks progress ─────────────────────────────────────────
  const knockoutProgress = useMemo(() => ({
    r32: knockoutPicks.r32.length,
    r16: knockoutPicks.r16.length,
    qf: knockoutPicks.qf.length,
    sf: knockoutPicks.sf.length,
    thirdPlace: knockoutPicks.third_place !== null ? 1 : 0,
    final: knockoutPicks.final !== null ? 1 : 0,
    total: knockoutPicks.r32.length + knockoutPicks.r16.length + knockoutPicks.qf.length +
      knockoutPicks.sf.length + (knockoutPicks.third_place !== null ? 1 : 0) + (knockoutPicks.final !== null ? 1 : 0),
  }), [knockoutPicks]);

  // ─── Validation ─────────────────────────────────────────────────────
  const isStep1Complete = useMemo(() => {
    return groupMatchInputs.length > 0 &&
      groupMatchInputs.every((m) => {
        const s = groupScores[m.id];
        return s !== undefined && s.score1 !== null && s.score2 !== null;
      });
  }, [groupMatchInputs, groupScores]);

  const isStep2Complete =
    knockoutPicks.r32.length === 16 &&
    knockoutPicks.r16.length === 8 &&
    knockoutPicks.qf.length === 4 &&
    knockoutPicks.sf.length === 2 &&
    knockoutPicks.third_place !== null &&
    knockoutPicks.final !== null;

  const stepComplete = [isStep1Complete, isStep2Complete];
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
      thirds_key: thirdsKey ?? undefined,
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

    router.push(`/pools/${poolId}/bracket`);
  };

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Step {step} of 2 — {STEP_LABELS[step - 1]}
          </span>
          <span className="text-xs text-slate-400">
            {stepComplete.filter(Boolean).length}/2 steps complete
          </span>
        </div>
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {step === 1 && (
          <div className="p-4 sm:p-6">
            <GroupScoresStep
              groups={groups}
              groupMatches={groupMatchInputs}
              groupScores={groupScores}
              allStandings={allStandings}
              teamById={teamById}
              onScoreChange={handleScoreChange}
            />
          </div>
        )}

        {step === 2 && (
          <>
            <div className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
              <h2 className="text-lg font-bold text-slate-800">Step 2: Knockout Bracket</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Click any team to advance them. Picks cascade automatically through each round.
              </p>
              <p className={cn(
                "text-sm font-semibold mt-2",
                isStep2Complete ? "text-green-600" : "text-amber-600"
              )}>
                {knockoutProgress.total}/32 picks made
              </p>
            </div>
            <KnockoutBracketTree
              r32={r32TreeMatches}
              r16={r16TreeMatches}
              qf={qfTreeMatches}
              sf={sfTreeMatches}
              final={finalTreeMatch}
              thirdPlace={thirdPlaceTreeMatch}
              onPick={handleKnockoutPick}
            />
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
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

        {step < 2 && (
          <button
            onClick={() => setStep((s) => Math.min(2, s + 1))}
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

        {step === 2 && (
          <div className="flex flex-col items-end gap-2">
            {submitError && (
              <p className="text-sm text-red-600 font-medium">{submitError}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!isStep2Complete || isSubmitting}
              className={cn(
                "rounded-xl px-6 py-3 text-base font-bold transition-all",
                isStep2Complete && !isSubmitting
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              )}
            >
              {isSubmitting ? "Submitting..." : "Submit My Bracket"}
            </button>
            {!isStep2Complete && (
              <p className="text-xs text-slate-400">Complete all picks to submit</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
