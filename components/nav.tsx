import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let avatarUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();

    displayName = profile?.display_name ?? user.email ?? null;
    avatarUrl = profile?.avatar_url ?? null;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-slate-900 hover:text-slate-700 transition-colors"
        >
          WC2026
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-4 overflow-x-auto">
          {user ? (
            <>
              <Link
                href="/pools"
                className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                My Pools
              </Link>
              <Link
                href="/groups"
                className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Groups
              </Link>
              <Link
                href="/leaderboard"
                className="shrink-0 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Leaderboard
              </Link>

              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName ?? "Avatar"}
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {displayName?.[0]?.toUpperCase() ?? "U"}
                  </div>
                )}
                <span className="hidden text-sm font-medium text-slate-700 sm:block">
                  {displayName}
                </span>
              </div>

              <form action={logout}>
                <button
                  type="submit"
                  className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
