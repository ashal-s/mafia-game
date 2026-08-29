"use client";

import { MafiaLogo } from "@/components/mafia-logo";

/**
 * Shared top bar: logo only on the left, no background or border. Pass actions
 * (sign out, leave game, etc.) as children on the right.
 */
export function AppHeader({
  homeHref = "/dashboard",
  children,
}: {
  homeHref?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative z-50 flex items-center justify-between px-6 py-4">
      <MafiaLogo href={homeHref} size="sm" />
      {children ? (
        <div className="flex items-center gap-3">{children}</div>
      ) : null}
    </header>
  );
}
