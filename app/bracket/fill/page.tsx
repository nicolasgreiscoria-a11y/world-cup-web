import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BracketFillClient } from "@/components/bracket/BracketFillClient";
import type { Team } from "@/types/database";

interface BracketFillPageProps {
  searchParams: Promise<{ pool?: string }>;
}

export default async function BracketFillPage({ searchParams }: BracketFillPageProps) {
  const { pool: poolId } = await searchParams;

  if (!poolId) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-20">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">No pool selected</p>
          <p className="text-sm text-slate-500 mb-6">You need to access the bracket fill from a pool.</p>
          <Link
            href="/pools"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Go to My Pools
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/bracket/fill?pool=${poolId}`);
  }

  // Get pool info
  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, locked_at")
    .eq("id", poolId)
    .single();

  if (!pool) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-20">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">Pool not found</p>
          <Link href="/pools" className="text-sm text-blue-600 underline">
            Go to My Pools
          </Link>
        </div>
      </main>
    );
  }

  // Check if pool is locked
  const isLocked = pool.locked_at && new Date(pool.locked_at) <= new Date();

  if (isLocked) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-20">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">Bracket is locked</p>
          <p className="text-sm text-slate-500 mb-6">
            This pool locked on {new Date(pool.locked_at!).toLocaleDateString()}. No more picks allowed.
          </p>
          <Link
            href={`/pools/${poolId}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Back to Pool
          </Link>
        </div>
      </main>
    );
  }

  // Get or create bracket
  let { data: bracket } = await supabase
    .from("brackets")
    .select("id, submitted_at")
    .eq("pool_id", poolId)
    .eq("user_id", user.id)
    .single();

  if (!bracket) {
    const { data: newBracket } = await supabase
      .from("brackets")
      .insert({
        pool_id: poolId,
        user_id: user.id,
        submitted_at: null,
        total_points: 0,
      })
      .select("id, submitted_at")
      .single();

    bracket = newBracket;
  }

  if (!bracket) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-20">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">Error creating bracket</p>
          <Link href={`/pools/${poolId}`} className="text-sm text-blue-600 underline">
            Back to Pool
          </Link>
        </div>
      </main>
    );
  }

  if (bracket.submitted_at) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-20">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">Bracket already submitted</p>
          <p className="text-sm text-slate-500 mb-6">
            You submitted your bracket on {new Date(bracket.submitted_at).toLocaleDateString()}.
          </p>
          <Link
            href={`/pools/${poolId}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            View Pool
          </Link>
        </div>
      </main>
    );
  }

  // Fetch all teams
  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, country_code, flag_url, group_name, fifa_ranking")
    .order("group_name", { ascending: true })
    .order("fifa_ranking", { ascending: true });

  if (!teams || teams.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4 py-20">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-700 mb-2">Tournament data not yet available</p>
          <p className="text-sm text-slate-500 mb-6">
            Team information will be loaded before June 11, 2026. Check back soon.
          </p>
          <Link
            href={`/pools/${poolId}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Back to Pool
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <Link
            href={`/pools/${poolId}`}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            &larr; Back to {pool.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Fill Your Bracket</h1>
          <p className="text-sm text-slate-500">{pool.name}</p>
        </div>

        <BracketFillClient
          bracketId={bracket.id}
          poolId={poolId}
          teams={teams as Team[]}
        />
      </div>
    </main>
  );
}
