import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

interface JoinPoolPageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPoolPage({ params }: JoinPoolPageProps) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/pools/join/${code}`);
  }

  const { data: pool } = await supabase
    .from("pools")
    .select("id, name, locked_at")
    .eq("invite_code", code.toUpperCase())
    .single();

  if (!pool) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="mb-2 text-xl font-bold text-slate-900">Invalid invite code</h1>
            <p className="mb-6 text-sm text-slate-500">
              The code <span className="font-mono font-semibold">{code.toUpperCase()}</span> doesn't
              match any pool. Double-check the link and try again.
            </p>
            <Link
              href="/pools"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Back to My Pools
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from("pool_members")
    .select("id")
    .eq("pool_id", pool.id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    redirect(`/pools/${pool.id}`);
  }

  // Join the pool
  await supabase.from("pool_members").insert({ pool_id: pool.id, user_id: user.id });

  // Create blank bracket
  await supabase.from("brackets").insert({
    pool_id: pool.id,
    user_id: user.id,
    submitted_at: null,
    total_points: 0,
  });

  redirect(`/pools/${pool.id}`);
}
