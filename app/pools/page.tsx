import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PoolsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/pools");
  }

  // Fetch pool_ids the user belongs to
  const { data: memberships } = await supabase
    .from("pool_members")
    .select("pool_id, joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  const poolIds = (memberships ?? []).map((m) => m.pool_id);

  const pools =
    poolIds.length > 0
      ? (
          await supabase
            .from("pools")
            .select("id, name, invite_code, locked_at, created_at")
            .in("id", poolIds)
        ).data ?? []
      : [];

  // Sort pools in the same order as memberships (newest joined first)
  const orderMap = new Map(poolIds.map((id, i) => [id, i]));
  pools.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return (
    <main className="flex-1 bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">My Pools</h1>
          <Link
            href="/pools/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            + Create Pool
          </Link>
        </div>

        {pools.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-8 py-16 text-center">
            <p className="mb-1 text-base font-semibold text-slate-700">No pools yet</p>
            <p className="mb-6 text-sm text-slate-400">
              Create a pool and invite friends, or ask for an invite code to join one.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/pools/new"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                Create a pool
              </Link>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {pools.map((pool) => {
              const isLocked = pool.locked_at && new Date(pool.locked_at) <= new Date();
              return (
                <li key={pool.id}>
                  <Link
                    href={`/pools/${pool.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{pool.name}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          Code: <span className="font-mono font-medium">{pool.invite_code}</span>
                        </p>
                      </div>
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isLocked
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isLocked ? "Locked" : "Open"}
                      </span>
                    </div>
                    {pool.locked_at && (
                      <p className="mt-2 text-xs text-slate-400">
                        Locks {new Date(pool.locked_at).toLocaleDateString()}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
