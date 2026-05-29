"use server";

import { createClient } from "@/lib/supabase/server";

export interface GroupPickInput {
  group_name: string;
  picked_1st_id: string;
  picked_2nd_id: string;
  picked_3rd_id: string;
}

export interface MatchScorePickInput {
  match_id: string;
  predicted_score1: number;
  predicted_score2: number;
}

export interface KnockoutMatchPick {
  match: number;
  winner_id: string;
}

export interface KnockoutPicksJson {
  r32: KnockoutMatchPick[];
  r16: KnockoutMatchPick[];
  qf: KnockoutMatchPick[];
  sf: KnockoutMatchPick[];
  third_place: { winner_id: string } | null;
  final: { winner_id: string } | null;
  thirds_key?: string;
}

export async function submitBracket(
  bracketId: string,
  matchScorePicks: MatchScorePickInput[],
  knockoutPicks: KnockoutPicksJson,
  derivedGroupPicks: GroupPickInput[]
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify bracket belongs to current user
  const { data: bracket, error: bracketError } = await supabase
    .from("brackets")
    .select("id, user_id, submitted_at, pool_id")
    .eq("id", bracketId)
    .single();

  if (bracketError || !bracket) {
    return { error: "Bracket not found" };
  }

  if (bracket.user_id !== user.id) {
    return { error: "Unauthorized" };
  }

  if (bracket.submitted_at) {
    return { error: "already submitted" };
  }

  // Reject submissions after the pool locks (tournament has started)
  const { data: pool } = await supabase
    .from("pools")
    .select("locked_at")
    .eq("id", bracket.pool_id)
    .single();

  if (pool && new Date(pool.locked_at) <= new Date()) {
    return { error: "Pool is locked — the tournament has started" };
  }

  // Upsert 72 match_score_picks rows
  const matchScoreRows = matchScorePicks.map((p) => ({
    bracket_id: bracketId,
    match_id: p.match_id,
    predicted_score1: p.predicted_score1,
    predicted_score2: p.predicted_score2,
    points_earned: 0,
  }));

  const { error: mspError } = await supabase
    .from("match_score_picks")
    .upsert(matchScoreRows, {
      onConflict: "bracket_id,match_id",
      ignoreDuplicates: false,
    });

  if (mspError) {
    return { error: mspError.message };
  }

  // Upsert 12 derived group_picks rows (for scoring engine + backwards compat)
  const groupPicksRows = derivedGroupPicks.map((gp) => ({
    bracket_id: bracketId,
    group_name: gp.group_name,
    picked_1st_id: gp.picked_1st_id,
    picked_2nd_id: gp.picked_2nd_id,
    picked_3rd_id: gp.picked_3rd_id,
    points_earned: 0,
  }));

  const { error: groupPicksError } = await supabase
    .from("group_picks")
    .upsert(groupPicksRows, {
      onConflict: "bracket_id,group_name",
      ignoreDuplicates: false,
    });

  if (groupPicksError) {
    return { error: groupPicksError.message };
  }

  // Update brackets.picks_json and set submitted_at
  const { error: updateError } = await supabase
    .from("brackets")
    .update({
      picks_json: knockoutPicks as unknown as Record<string, unknown>,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", bracketId);

  if (updateError) {
    return { error: updateError.message };
  }

  return {};
}
