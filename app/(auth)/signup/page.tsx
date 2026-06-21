"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: AuthState = {};

export default function SignupPage() {
  const [state, formAction] = useActionState(signup, initialState);

  return (
    <div>
      <h1 className="text-xl font-semibold text-zinc-50">Create your account</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Sign up to start playing Mafia.
      </p>

      {state.message ? (
        <p className="mt-6 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-3 py-3 text-sm text-emerald-300">
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              className="h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
              placeholder="At least 6 characters"
            />
          </div>

          {state.error ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {state.error}
            </p>
          ) : null}

          <SubmitButton pendingText="Creating account…">Sign up</SubmitButton>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-red-400 hover:text-red-300">
          Log in
        </Link>
      </p>
    </div>
  );
}
