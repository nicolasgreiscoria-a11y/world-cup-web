import Link from "next/link";
import { signup } from "@/app/auth/actions";

interface SignupPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Create account</h1>
          <p className="mb-6 text-sm text-slate-500">
            Join the World Cup 2026 bracket challenge
          </p>

          {params.error && (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {params.error}
            </div>
          )}

          <SignupForm />

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-slate-900 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function SignupForm() {
  return (
    <form className="space-y-4" action={signupWithError}>
      <div>
        <label htmlFor="full_name" className="mb-1 block text-sm font-medium text-slate-700">
          Display name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="Your name"
        />
      </div>

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
          autoComplete="new-password"
          minLength={6}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="At least 6 characters"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
      >
        Create Account
      </button>
    </form>
  );
}

async function signupWithError(formData: FormData) {
  "use server";
  const result = await signup(formData);
  if (result?.error) {
    const { redirect } = await import("next/navigation");
    redirect(`/signup?error=${encodeURIComponent(result.error)}`);
  }
}
