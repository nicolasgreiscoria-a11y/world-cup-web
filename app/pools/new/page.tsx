import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

async function createPool(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/pools/new");
  }

  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    redirect("/pools/new?error=Pool+name+is+required");
  }

  const invite_code = Math.random().toString(36).slice(2, 10).toUpperCase();

  const { data: pool, error: poolError } = await supabase
    .from("pools")
    .insert({ name, invite_code, created_by: user.id, locked_at: "2026-06-11T12:00:00Z" })
    .select("id")
    .single();

  if (poolError || !pool) {
    redirect("/pools/new?error=" + encodeURIComponent(poolError?.message ?? "Failed to create pool"));
  }

  const { error: memberError } = await supabase
    .from("pool_members")
    .insert({ pool_id: pool.id, user_id: user.id });

  if (memberError) {
    redirect("/pools/new?error=" + encodeURIComponent(memberError.message));
  }

  await supabase.from("brackets").insert({
    pool_id: pool.id,
    user_id: user.id,
    submitted_at: null,
    total_points: 0,
  });

  redirect(`/pools/${pool.id}`);
}

interface NewPoolPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewPoolPage({ searchParams }: NewPoolPageProps) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Create a Pool</h1>
          <p className="mb-6 text-sm text-slate-500">
            Give your pool a name. You'll get an invite code to share with friends.
          </p>

          {params.error && (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {params.error}
            </div>
          )}

          <form action={createPool} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Pool name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoFocus
                maxLength={60}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                placeholder="e.g. Office Pool 2026"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Create Pool
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
