import Link from "next/link";
import { notFound } from "next/navigation";
import { recordGroups, seededTeam } from "@/lib/org-data";

export default async function CatalogRecordPage({ params }: PageProps<"/catalog/[type]/[slug]">) {
  const { type, slug } = await params;
  const group = recordGroups[type as keyof typeof recordGroups];
  const record = group?.find((item) => item.slug === slug);
  if (!record) notFound();
  return <main className="min-h-screen bg-[#f7f8fb] px-6 py-16 text-slate-900"><div className="mx-auto max-w-2xl"><Link href={`/teams/${seededTeam.slug}`} className="text-sm font-semibold text-indigo-600">← Back to {seededTeam.name}</Link><div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{type.slice(0, -1)}</p><h1 className="mt-2 text-3xl font-bold">{record.name}</h1><p className="mt-4 leading-7 text-slate-600">{record.description}</p><div className="mt-8 border-t border-slate-100 pt-6"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Owned by</p><Link href={`/teams/${seededTeam.slug}`} className="mt-2 inline-block font-semibold text-indigo-700">{seededTeam.name} →</Link></div></div></div></main>;
}
