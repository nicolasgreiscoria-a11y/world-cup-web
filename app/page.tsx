import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { GroupStanding, Team } from "@/types/database";

interface StandingWithTeam extends GroupStanding {
  team: Team;
}

const ALL_GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    displayName = profile?.display_name ?? user.email ?? null;
  }

  // Fetch compact standings for the teaser (top 2 per group)
  const { data: rawStandings } = await supabase
    .from("group_standings")
    .select("*, team:teams(*)")
    .order("points", { ascending: false });

  const allStandings = (rawStandings ?? []) as unknown as StandingWithTeam[];
  const hasStandings = allStandings.length > 0;

  // Build top-2 per group
  type GroupTop2 = { letter: string; teams: string[] };
  const groupTeasers: GroupTop2[] = ALL_GROUPS.map((letter) => {
    const rows = allStandings
      .filter((s) => s.group_name === letter)
      .sort((a, b) => {
        const ptsDiff = b.points - a.points;
        if (ptsDiff !== 0) return ptsDiff;
        const gdA = a.goals_for - a.goals_against;
        const gdB = b.goals_for - b.goals_against;
        return gdB - gdA;
      })
      .slice(0, 2);
    return { letter, teams: rows.map((r) => r.team?.name ?? "TBD") };
  }).filter((g) => g.teams.length > 0);

  if (user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-16">
        <div className="w-full max-w-lg text-center">
          <p className="mb-2 text-sm font-medium text-slate-500 uppercase tracking-wide">
            World Cup 2026 Bracket Challenge
          </p>
          <h1 className="mb-4 text-3xl font-bold text-slate-900">
            Welcome back, {displayName ?? "there"}
          </h1>
          <p className="mb-8 text-slate-500">
            Ready to compete? View your pools or create a new one.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/pools"
              className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              My Pools
            </Link>
            <Link
              href="/pools/new"
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Create Pool
            </Link>
          </div>
        </div>

        {/* Groups teaser */}
        <div className="mt-12 w-full max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Group Standings</h2>
            <Link
              href="/groups"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              View all groups &rarr;
            </Link>
          </div>
          {hasStandings ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {groupTeasers.map((g) => (
                <Link
                  key={g.letter}
                  href="/groups"
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 transition-colors"
                >
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
                    Group {g.letter}
                  </p>
                  {g.teams.map((name, i) => (
                    <p key={i} className="text-sm font-medium text-slate-800 truncate">
                      {i === 0 ? "1. " : "2. "}
                      {name}
                    </p>
                  ))}
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-center shadow-sm">
              <p className="text-sm text-slate-500">
                Standings will be available once the tournament begins on June 11, 2026.
              </p>
              <Link
                href="/groups"
                className="mt-2 inline-block text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                View groups page &rarr;
              </Link>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-24">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-slate-600">
          June 11 &ndash; July 19, 2026
        </div>

        <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          World Cup 2026
          <br />
          <span className="text-slate-500">Bracket Challenge</span>
        </h1>

        <p className="mx-auto mb-10 max-w-md text-lg text-slate-500">
          Pick every match from the group stage to the final. Create a pool with
          friends and see who knows football best.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signup"
            className="rounded-md bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            Sign Up Free
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Log In
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          {[
            {
              title: "Build your bracket",
              desc: "Pick winners for every match — group stage through the final.",
            },
            {
              title: "Create a pool",
              desc: "Invite friends with a shareable code and compete on a live leaderboard.",
            },
            {
              title: "Earn points",
              desc: "Score points for every correct pick. Knockout round wins worth more.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="mb-1 font-semibold text-slate-900">{item.title}</h3>
              <p className="text-sm text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
