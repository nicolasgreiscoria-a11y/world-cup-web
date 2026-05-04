"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { submitBracket } from "@/app/bracket/actions";
import type { Team } from "@/types/database";
import type { GroupPickInput, KnockoutPicksJson, KnockoutMatchPick } from "@/app/bracket/actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupPick {
  first: string;
  second: string;
  third: string;
}

// Indexed by group_name
type GroupPicks = Record<string, GroupPick>;

// R32 matchup definition (static structure, team IDs resolved from state)
interface R32Slot {
  matchNum: number;
  labelA: string; // e.g. "Group A Winner"
  labelB: string;
  resolveA: (gp: GroupPicks, at: string[]) => string | null;
  resolveB: (gp: GroupPicks, at: string[]) => string | null;
}

// ─── R32 matchup definitions ───────────────────────────────────────────────

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
  "Group Stage",
  "Best 8 Thirds",
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

// ─── Group Stage Step ──────────────────────────────────────────────────────

interface GroupStageStepProps {
  groups: Record<string, Team[]>;
  groupPicks: GroupPicks;
  onChange: (groupName: string, pick: GroupPick) => void;
}

function GroupStageStep({ groups, groupPicks, onChange }: GroupStageStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Step 1: Group Stage Picks</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Select who finishes 1st, 2nd, and 3rd in each group. No repeats allowed.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([groupName, teams]) => {
            const pick = groupPicks[groupName] ?? { first: "", second: "", third: "" };

            const options = teams.map((t) => ({ value: t.id, label: t.name, countryCode: t.country_code }));

            const makeOpts = (exclude1: string, exclude2: string) =>
              options.filter((o) => o.value !== exclude1 && o.value !== exclude2);

            return (
              <div key={groupName} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold">
                    {groupName}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">Group {groupName}</span>
                </div>

                {/* Teams in group (read only reference) */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {teams.map((t) => (
                    <span key={t.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      <FlagImg countryCode={t.country_code} name={t.name} />
                      {t.name}
                    </span>
                  ))}
                </div>

                {/* 1st place */}
                <div>
                  <label className="block text-xs font-semibold text-amber-600 mb-1">1st Place</label>
                  <select
                    value={pick.first}
                    onChange={(e) => onChange(groupName, { ...pick, first: e.target.value })}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select team...</option>
                    {makeOpts(pick.second, pick.third).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* 2nd place */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">2nd Place</label>
                  <select
                    value={pick.second}
                    onChange={(e) => onChange(groupName, { ...pick, second: e.target.value })}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select team...</option>
                    {makeOpts(pick.first, pick.third).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* 3rd place */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">3rd Place</label>
                  <select
                    value={pick.third}
                    onChange={(e) => onChange(groupName, { ...pick, third: e.target.value })}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select team...</option>
                    {makeOpts(pick.first, pick.second).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── Best 8 Thirds Step ────────────────────────────────────────────────────

interface BestThirdsStepProps {
  groupPicks: GroupPicks;
  teamById: Map<string, Team>;
  advancingThirds: string[];
  onChange: (selected: string[]) => void;
}

function BestThirdsStep({ groupPicks, teamById, advancingThirds, onChange }: BestThirdsStepProps) {
  const thirds = Object.entries(groupPicks)
    .filter(([, p]) => p.third)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupName, p]) => ({ groupName, teamId: p.third }));

  const toggle = (teamId: string) => {
    if (advancingThirds.includes(teamId)) {
      onChange(advancingThirds.filter((id) => id !== teamId));
    } else if (advancingThirds.length < 8) {
      onChange([...advancingThirds, teamId]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Step 2: Best 8 Thirds</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Select exactly 8 of the 12 third-place teams that you predict will advance to the Round of 32.
        </p>
        <p className={cn("text-sm font-semibold mt-2", advancingThirds.length === 8 ? "text-green-600" : "text-amber-600")}>
          {advancingThirds.length}/8 selected
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {thirds.map(({ groupName, teamId }) => {
          const team = teamById.get(teamId);
          const isSelected = advancingThirds.includes(teamId);
          const isDisabled = !isSelected && advancingThirds.length >= 8;

          return (
            <button
              key={teamId}
              onClick={() => toggle(teamId)}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : isDisabled
                  ? "border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed"
                  : "border-slate-200 bg-white hover:border-slate-300 cursor-pointer"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0",
                isSelected ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-white"
              )}>
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              {team && <FlagImg countryCode={team.country_code} name={team.name} />}
              <div>
                <span className={cn("text-sm font-medium", isSelected ? "text-blue-800" : "text-slate-700")}>
                  {team?.name ?? teamId}
                </span>
                <span className="block text-xs text-slate-400">Group {groupName} — 3rd</span>
              </div>
            </button>
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

  // SF match 1 and 2 winners advance to Final
  const finalist1 = sfPickMap.get(1) ? teamById.get(sfPickMap.get(1)!) ?? null : null;
  const finalist2 = sfPickMap.get(2) ? teamById.get(sfPickMap.get(2)!) ?? null : null;

  // SF losers go to 3rd place match
  // For SF match 1: the loser is the team in sfMatchups[0] that isn't the winner
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
        <h2 className="text-lg font-bold text-slate-800">Step 7: Final + 3rd Place</h2>
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
}

export function BracketFillClient({ bracketId, poolId, teams }: BracketFillClientProps) {
  const router = useRouter();

  // Build lookup maps
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const groups: Record<string, Team[]> = {};
  for (const team of teams) {
    if (!groups[team.group_name]) groups[team.group_name] = [];
    groups[team.group_name].push(team);
  }

  // ─── State ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1–7
  const [groupPicks, setGroupPicks] = useState<GroupPicks>({});
  const [advancingThirds, setAdvancingThirds] = useState<string[]>([]);

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

  // ─── Group picks handler ─────────────────────────────────────────────
  const handleGroupPickChange = useCallback((groupName: string, pick: GroupPick) => {
    setGroupPicks((prev) => ({ ...prev, [groupName]: pick }));
  }, []);

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

        // Cascade: when a pick changes, clear downstream dependent picks
        const newState = { ...prev, [roundKey]: updated };

        // Clear downstream rounds when a pick changes
        if (roundKey === "r32") {
          // Clear r16, qf, sf, third_place, final
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
  // advancingThirds sorted by group_name alphabetically
  const sortedThirds = Object.entries(groupPicks)
    .filter(([, p]) => advancingThirds.includes(p.third))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, p]) => p.third);

  const r32Matchups = R32_SLOTS.map((slot) => ({
    matchNum: slot.matchNum,
    labelA: slot.labelA,
    labelB: slot.labelB,
    teamAId: slot.resolveA(groupPicks, sortedThirds),
    teamBId: slot.resolveB(groupPicks, sortedThirds),
  }));

  // ─── Derive R16 matchups from R32 picks ────────────────────────────
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

  // ─── Derive QF matchups from R16 picks ────────────────────────────
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

  // ─── Derive SF matchups from QF picks ─────────────────────────────
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

  // ─── Validation for Next ─────────────────────────────────────────────
  const groupNames = Object.keys(groups).sort();

  const isStep1Complete = groupNames.every((g) => {
    const p = groupPicks[g];
    return p?.first && p?.second && p?.third && p.first !== p.second && p.first !== p.third && p.second !== p.third;
  });

  const isStep2Complete = advancingThirds.length === 8;

  const isStep3Complete = knockoutPicks.r32.length === 16;

  const isStep4Complete = knockoutPicks.r16.length === 8;

  const isStep5Complete = knockoutPicks.qf.length === 4;

  const isStep6Complete = knockoutPicks.sf.length === 2;

  const isStep7Complete = knockoutPicks.third_place !== null && knockoutPicks.final !== null;

  const stepComplete = [
    isStep1Complete,
    isStep2Complete,
    isStep3Complete,
    isStep4Complete,
    isStep5Complete,
    isStep6Complete,
    isStep7Complete,
  ];

  const canGoNext = stepComplete[step - 1] ?? false;

  // ─── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    const gPicksInput: GroupPickInput[] = Object.entries(groupPicks).map(([group_name, p]) => ({
      group_name,
      picked_1st_id: p.first,
      picked_2nd_id: p.second,
      picked_3rd_id: p.third,
    }));

    const kPicksJson: KnockoutPicksJson = {
      r32: knockoutPicks.r32,
      r16: knockoutPicks.r16,
      qf: knockoutPicks.qf,
      sf: knockoutPicks.sf,
      third_place: knockoutPicks.third_place,
      final: knockoutPicks.final,
    };

    const result = await submitBracket(bracketId, gPicksInput, kPicksJson);

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
            Step {step} of 7 — {STEP_LABELS[step - 1]}
          </span>
          <span className="text-xs text-slate-400">
            {stepComplete.filter(Boolean).length}/7 steps complete
          </span>
        </div>
        <StepIndicator currentStep={step} />
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 sm:p-6">
        {step === 1 && (
          <GroupStageStep
            groups={groups}
            groupPicks={groupPicks}
            onChange={handleGroupPickChange}
          />
        )}

        {step === 2 && (
          <BestThirdsStep
            groupPicks={groupPicks}
            teamById={teamById}
            advancingThirds={advancingThirds}
            onChange={setAdvancingThirds}
          />
        )}

        {step === 3 && (
          <KnockoutStep
            roundLabel="Round of 32"
            roundKey="r32"
            matchups={r32Matchups}
            picks={knockoutPicks.r32}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 4 && (
          <KnockoutStep
            roundLabel="Round of 16"
            roundKey="r16"
            matchups={r16Matchups}
            picks={knockoutPicks.r16}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 5 && (
          <KnockoutStep
            roundLabel="Quarter-Finals"
            roundKey="qf"
            matchups={qfMatchups}
            picks={knockoutPicks.qf}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 6 && (
          <KnockoutStep
            roundLabel="Semi-Finals"
            roundKey="sf"
            matchups={sfMatchups}
            picks={knockoutPicks.sf}
            teamById={teamById}
            onPick={handleKnockoutPick}
          />
        )}

        {step === 7 && (
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

        {step < 7 && (
          <button
            onClick={() => setStep((s) => Math.min(7, s + 1))}
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
