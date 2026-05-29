import Link from "next/link";
import { login } from "@/app/auth/actions";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; message?: string; redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mb-6 text-sm text-slate-500">Sign in to your account</p>

          {params.message === "email_confirmed" && (
            <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">
              Email confirmed. You can now log in.
            </div>
          )}

          {params.error && (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {params.error === "auth_callback_failed"
                ? "Authentication failed. Please try again."
                : params.error}
            </div>
          )}

          <LoginForm redirectTo={params.redirect} />

          <p className="mt-6 text-center text-sm text-slate-500">
            No account?{" "}
            <Link href="/signup" className="font-medium text-slate-900 hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function LoginForm({ redirectTo }: { redirectTo?: string }) {
  return (
    <form className="space-y-4" action={loginWithError}>
      {redirectTo && (
        <input type="hidden" name="redirect" value={redirectTo} />
      )}
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
      >
        Log In
      </button>
    </form>
  );
}

// Wrapper that redirects error back via search params
async function loginWithError(formData: FormData) {
  "use server";
  const result = await login(formData);
  if (result?.error) {
    const { redirect } = await import("next/navigation");
    const redirectTo = formData.get("redirect") as string | null;
    const params = new URLSearchParams({ error: result.error });
    if (redirectTo) params.set("redirect", redirectTo);
    redirect(`/login?${params.toString()}`);
  }
}
