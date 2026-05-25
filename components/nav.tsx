import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { NavMenu } from "./nav-menu"

export async function Nav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  let avatarUrl: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single()

    displayName = profile?.display_name ?? user.email ?? null
    avatarUrl = profile?.avatar_url ?? null
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-slate-900 hover:text-slate-700 transition-colors"
        >
          WC2026
        </Link>
        <NavMenu user={user} displayName={displayName} avatarUrl={avatarUrl} />
      </nav>
    </header>
  )
}
