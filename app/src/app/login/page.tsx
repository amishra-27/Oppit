"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Mode = "password" | "magic-link";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/companies");
    router.refresh();
  }

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage("Check your email for a confirmation link.");
    setLoading(false);
  }

  async function handleMagicLink() {
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage("Magic link sent! Check your email.");
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "magic-link") {
      handleMagicLink();
    } else {
      handleSignIn();
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-emerald-500/20 blur-[120px]" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-cyan-500/15 blur-[100px]" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo – links back to landing page */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-2 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight">Oppit</span>
        </Link>
        <div className="text-center mb-8">
          <Link
            href="/"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Back to landing page
          </Link>
        </div>

        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-8">
          <h1 className="text-xl font-semibold text-center mb-1">Welcome back</h1>
          <p className="text-sm text-zinc-500 text-center mb-6">
            Sign in to your account to continue
          </p>

          {/* Mode toggle */}
          <div className="flex rounded-lg bg-zinc-800/60 p-1 mb-6">
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`flex-1 text-sm font-medium rounded-md py-1.5 transition-colors ${
                mode === "password"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => setMode("magic-link")}
              className={`flex-1 text-sm font-medium rounded-md py-1.5 transition-colors ${
                mode === "magic-link"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              }`}
            >
              Magic Link
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-400 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors"
              />
            </div>

            {/* Password (only in password mode) */}
            {mode === "password" && (
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-zinc-400 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors"
                />
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Success / info message */}
            {message && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
                {message}
              </div>
            )}

            {/* Actions */}
            {mode === "password" ? (
              <div className="space-y-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleSignUp}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "..." : "Create account"}
                </button>
              </div>
            ) : (
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? "Sending..." : "Send magic link"}
                </button>
              </div>
            )}
          </form>
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6">
          Industrial IoT. Simplified.
        </p>
      </div>
    </div>
  );
}
