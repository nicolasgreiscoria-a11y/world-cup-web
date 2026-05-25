"use client"

import { useState } from "react"
import Link from "next/link"
import { logout } from "@/app/auth/actions"

interface NavMenuProps {
  user: { id: string; email?: string } | null
  displayName: string | null
  avatarUrl: string | null
}

export function NavMenu({ user, displayName, avatarUrl }: NavMenuProps) {
  const [open, setOpen] = useState(false)

  if (!user) {
    return (
      <div className="flex items-center gap-3">
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
      </div>
    )
  }

  return (
    <div className="relative flex items-center gap-4">
      {/* Desktop nav links */}
      <div className="hidden sm:flex items-center gap-4">
        <Link
          href="/pools"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          My Pools
        </Link>
        <Link
          href="/groups"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          Groups
        </Link>
        <Link
          href="/leaderboard"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
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
          <span className="text-sm font-medium text-slate-700">{displayName}</span>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            Log out
          </button>
        </form>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Toggle menu"
        aria-expanded={open}
        className="sm:hidden flex flex-col justify-center items-center h-8 w-8 gap-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`block h-0.5 w-5 bg-slate-700 transition-transform duration-200 ${open ? "translate-y-2 rotate-45" : ""}`}
        />
        <span
          className={`block h-0.5 w-5 bg-slate-700 transition-opacity duration-200 ${open ? "opacity-0" : ""}`}
        />
        <span
          className={`block h-0.5 w-5 bg-slate-700 transition-transform duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`}
        />
      </button>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden absolute right-0 top-10 z-50 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-2">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
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
            <span className="text-sm font-medium text-slate-700 truncate">{displayName}</span>
          </div>

          <nav className="flex flex-col py-1">
            <Link
              href="/pools"
              className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              My Pools
            </Link>
            <Link
              href="/groups"
              className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              Groups
            </Link>
            <Link
              href="/leaderboard"
              className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              Leaderboard
            </Link>
            <div className="border-t border-slate-100 mt-1 pt-1">
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Log out
                </button>
              </form>
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
