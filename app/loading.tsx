import { MafiaLogo } from "@/components/mafia-logo";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24">
      <MafiaLogo size="xl" className="animate-pulse" />
    </div>
  );
}
