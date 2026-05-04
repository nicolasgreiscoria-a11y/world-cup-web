import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { CopyInviteButton } from "./copy-invite-button";

interface PoolDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PoolDetailPage({ params }: PoolDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/pools/${id}`);
  }

  // Fetch pool
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, invite_code, locked_at, created_by")
    .eq("id", id)
    .single();

  if (!pool) {
    notFound();
  }

  // Verify user is a member
  const { data: membership } = await supabase
    .from("pool_members")
    .select("id")
    .eq("pool_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    redirect("/pools");
  }

  // Fetch member user_ids
  const { data: members } = await supabase
    .from("pool_members")
    .select("user_id, joined_at")
    .eq("pool_id", id)
    .order("joined_at", { ascending: true });

  const memberUserIds = (members ?? []).map((m) => m.user_id);

  // Fetch profiles for members
  const { data: profiles } = memberUserIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", memberUserIds)
    : { data: [] };

  // Fetch brackets
  const { data: brackets } = await supabase
    .from("brackets")
    .select("user_id, submitted_at, total_points")
    .eq("pool_id", id)
    .in("user_id", memberUserIds.length > 0 ? memberUserIds : ["none"]);

  // Fetch leaderboard
  const { data: leaderboard } = await supabase
    .from("leaderboard")
    .select("user_id, display_name, avatar_url, total_points, rank")
    .eq("pool_id", id)
    .order("rank", { ascending: true });

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const bracketMap = new Map((brackets ?? []).map((b) => [b.user_id, b]));

  const isLocked = pool.locked_at && new Date(pool.locked_at) <= new Date();
  const myBracket = bracketMap.get(user.id);
  const canFillBracket = !isLocked && !myBracket?.submitted_at;

  const inviteUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/pools/join/${pool.invite_code}`;

  return (
    <main className="flex-1 bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Pool
            </p>
            <h1 className="text-2xl font-bold text-slate-900">{pool.name}</h1>
            {pool.locked_at && (
              <p className="mt-1 text-sm text-slate-500">
                {isLocked
                  ? "Locked"
                  : `Locks ${new Date(pool.locked_at).toLocaleDateString()}`}
              </p>
            )}
          </div>

          {canFillBracket && (
            <Link
              href={`/bracket/fill?pool=${id}`}
              className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Fill my bracket
            </Link>
          )}
        </div>

        {/* Invite section */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-700">Invite friends</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-600 truncate">
              {inviteUrl}
            </div>
            <CopyInviteButton inviteUrl={inviteUrl} inviteCode={pool.invite_code} />
          </div>
        </div>

        {/* Leaderboard */}
        {leaderboard && leaderboard.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-800">Leaderboard</h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 w-12">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.user_id}
                      className={`border-b border-slate-100 last:border-0 ${
                        entry.user_id === user.id ? "bg-slate-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-400">
                        {entry.rank}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entry.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.avatar_url}
                              alt={entry.display_name}
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-500">
                              {entry.display_name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-slate-800">
                            {entry.display_name}
                            {entry.user_id === user.id && (
                              <span className="ml-1 text-xs text-slate-400">(you)</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {entry.total_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Members */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-800">
            Members ({(members ?? []).length})
          </h2>
          <ul className="space-y-2">
            {(members ?? []).map((member) => {
              const profile = profileMap.get(member.user_id);
              const bracket = bracketMap.get(member.user_id);
              const submitted = !!bracket?.submitted_at;

              return (
                <li
                  key={member.user_id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    {profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
                        {profile?.display_name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <span className="text-sm font-medium text-slate-800">
                      {profile?.display_name ?? "Unknown"}
                      {member.user_id === user.id && (
                        <span className="ml-1 text-xs text-slate-400">(you)</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {bracket && (
                      <span className="text-xs font-semibold text-slate-500">
                        {bracket.total_points} pts
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        submitted
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {submitted ? "Submitted" : "Pending"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
