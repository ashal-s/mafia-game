"use client";

import Link from "next/link";

const SIZES = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
} as const;

export function MafiaLogo({
  size = "md",
  href,
  className = "",
}: {
  size?: keyof typeof SIZES;
  href?: string;
  className?: string;
}) {
  const px = SIZES[size];
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon.svg"
      alt="Mafia"
      width={px}
      height={px}
      className={className}
    />
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0" aria-label="Mafia home">
        {image}
      </Link>
    );
  }

  return image;
}
