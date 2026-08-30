import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { seededTeam, type RelatedRecord } from "@/lib/org-data";

export const metadata: Metadata = { title: `${seededTeam.name} | GraphOrg` };

export function generateStaticParams() {
  return [{ slug: seededTeam.slug }];
}

function Arrow() {
  return <span aria-hidden="true" className="text-slate-400 transition-transform group-hover:translate-x-0.5">→</span>;
}

function RecordCard({ record, type, icon }: { record: RelatedRecord; type: string; icon: string }) {
  return (
    <Link href={`/catalog/${type}/${record.slug}`} className="group flex min-h-28 items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3 font-semibold text-slate-900"><span>{record.name}</span><Arrow /></span>
        <span className="mt-1 block text-sm leading-5 text-slate-500">{record.description}</span>
        {record.meta && <span className="mt-3 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{record.meta}</span>}
      </span>
    </Link>
  );
}

function Section({ title, count, children, id }: { title: string; count: number; children: React.ReactNode; id: string }) {
  return <section id={id} className="scroll-mt-24"><div className="mb-4 flex items-center gap-2"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{count}</span></div>{children}</section>;
}

export default async function TeamPage({ params }: PageProps<"/teams/[slug]">) {
  const { slug } = await params;
  if (slug !== seededTeam.slug) notFound();

  const sections = ["Members", "Systems", "Services", "Workflows", "Technologies", "Documents"];
  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-slate-200 bg-white/95 px-5 backdrop-blur lg:px-8">
        <Link href="/teams/platform-engineering" className="flex items-center gap-2.5 font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">G</span><span>GraphOrg</span></Link>
        <div className="ml-auto flex items-center gap-3"><button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600">⌕&nbsp; Search</button><span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">JD</span></div>
      </header>
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
          <nav className="mt-3 space-y-1 text-sm"><Link href="/teams/platform-engineering" className="block rounded-lg bg-indigo-50 px-3 py-2.5 font-semibold text-indigo-700">◫ &nbsp;Teams</Link>{["People", "Systems", "Services", "Workflows", "Technologies", "Documents"].map((item) => <Link key={item} href={`/catalog/${item.toLowerCase()}/${item.toLowerCase()}`} className="block rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50">{item}</Link>)}</nav>
        </aside>
        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12">
          <nav aria-label="Breadcrumb" className="mb-7 text-sm text-slate-500"><Link href="/teams/platform-engineering" className="hover:text-indigo-600">Teams</Link><span className="mx-2">/</span><span className="text-slate-700">{seededTeam.name}</span></nav>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div className="flex gap-5"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-sm">{seededTeam.shortCode}</span><div><p className="mb-1 text-sm font-semibold text-indigo-600">TEAM</p><h1 className="text-3xl font-bold tracking-tight text-slate-950">{seededTeam.name}</h1><p className="mt-3 max-w-2xl leading-6 text-slate-600">{seededTeam.description}</p></div></div>
            <a href={`mailto:${seededTeam.email}`} className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-300">Contact team</a>
          </div>
          <nav className="my-8 flex gap-6 overflow-x-auto border-b border-slate-200 text-sm font-medium text-slate-500">{sections.map((section, i) => <a key={section} href={`#${section.toLowerCase()}`} className={`shrink-0 border-b-2 pb-3 ${i === 0 ? "border-indigo-600 text-indigo-700" : "border-transparent hover:text-slate-900"}`}>{section}</a>)}</nav>
          <div className="space-y-10 pb-16">
            <Section title="Members" count={seededTeam.members.length} id="members"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{seededTeam.members.map((member) => <Link href={`/catalog/people/${member.slug}`} key={member.slug} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200"><span style={{ background: member.color }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">{member.initials}</span><span className="min-w-0"><span className="block truncate font-semibold text-slate-900 group-hover:text-indigo-700">{member.name}</span><span className="block truncate text-sm text-slate-500">{member.role}</span></span></Link>)}</div></Section>
            <Section title="Systems" count={seededTeam.systems.length} id="systems"><div className="grid gap-3 md:grid-cols-2">{seededTeam.systems.map((r) => <RecordCard key={r.slug} record={r} type="systems" icon="SY" />)}</div></Section>
            <Section title="Services" count={seededTeam.services.length} id="services"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{seededTeam.services.map((r) => <RecordCard key={r.slug} record={r} type="services" icon="SV" />)}</div></Section>
            <Section title="Workflows" count={seededTeam.workflows.length} id="workflows"><div className="grid gap-3 md:grid-cols-2">{seededTeam.workflows.map((r) => <RecordCard key={r.slug} record={r} type="workflows" icon="WF" />)}</div></Section>
            <Section title="Technologies" count={seededTeam.technologies.length} id="technologies"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{seededTeam.technologies.map((r) => <RecordCard key={r.slug} record={r} type="technologies" icon={r.name.slice(0, 2).toUpperCase()} />)}</div></Section>
            <Section title="Documents" count={seededTeam.documents.length} id="documents"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{seededTeam.documents.map((r) => <RecordCard key={r.slug} record={r} type="documents" icon="DOC" />)}</div></Section>
          </div>
        </main>
      </div>
    </div>
  );
}
