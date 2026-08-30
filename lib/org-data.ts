export type RelatedRecord = {
  name: string;
  slug: string;
  description: string;
  meta?: string;
};

export type TeamProfile = {
  name: string;
  slug: string;
  shortCode: string;
  description: string;
  email: string;
  members: (RelatedRecord & { initials: string; role: string; color: string })[];
  systems: RelatedRecord[];
  services: RelatedRecord[];
  workflows: RelatedRecord[];
  technologies: RelatedRecord[];
  documents: RelatedRecord[];
};

export const seededTeam: TeamProfile = {
  name: "Platform Engineering",
  slug: "platform-engineering",
  shortCode: "PE",
  description:
    "We build the foundations that help every product team ship reliable software quickly and safely.",
  email: "platform@acme.inc",
  members: [
    { name: "Maya Chen", slug: "maya-chen", initials: "MC", role: "Engineering Manager", color: "#6956e8", description: "Leads Platform Engineering" },
    { name: "Alex Morgan", slug: "alex-morgan", initials: "AM", role: "Staff Platform Engineer", color: "#d97445", description: "Developer experience and infrastructure" },
    { name: "Priya Shah", slug: "priya-shah", initials: "PS", role: "Senior Software Engineer", color: "#2f8873", description: "Deployment systems and observability" },
    { name: "Noah Williams", slug: "noah-williams", initials: "NW", role: "Software Engineer", color: "#3876b8", description: "Cloud infrastructure and tooling" },
  ],
  systems: [
    { name: "Developer Platform", slug: "developer-platform", description: "The internal platform for building, testing, and shipping software.", meta: "Tier 1" },
    { name: "Observability Platform", slug: "observability-platform", description: "Shared logging, metrics, tracing, and alerting for production services.", meta: "Tier 1" },
  ],
  services: [
    { name: "Deployment API", slug: "deployment-api", description: "Coordinates safe, repeatable application deployments.", meta: "Healthy" },
    { name: "Service Catalog", slug: "service-catalog", description: "The source of truth for software ownership and metadata.", meta: "Healthy" },
    { name: "Feature Flag Service", slug: "feature-flag-service", description: "Controls staged feature delivery across environments.", meta: "Healthy" },
  ],
  workflows: [
    { name: "Production deployment", slug: "production-deployment", description: "Build, verify, approve, and release changes to production.", meta: "12 steps" },
    { name: "Incident response", slug: "incident-response", description: "Coordinate investigation and recovery for service incidents.", meta: "8 steps" },
  ],
  technologies: [
    { name: "Kubernetes", slug: "kubernetes", description: "Container orchestration", meta: "3 services" },
    { name: "TypeScript", slug: "typescript", description: "Application development", meta: "2 services" },
    { name: "Terraform", slug: "terraform", description: "Infrastructure as code", meta: "3 services" },
    { name: "PostgreSQL", slug: "postgresql", description: "Relational database", meta: "1 service" },
  ],
  documents: [
    { name: "Platform engineering handbook", slug: "platform-engineering-handbook", description: "How we work, make decisions, and support product teams.", meta: "Updated 2 days ago" },
    { name: "Production readiness checklist", slug: "production-readiness-checklist", description: "Requirements for safely launching a new production service.", meta: "Updated 1 week ago" },
    { name: "On-call guide", slug: "on-call-guide", description: "Escalation paths, rotations, and incident response practices.", meta: "Updated 3 weeks ago" },
  ],
};

export const recordGroups = {
  people: seededTeam.members,
  systems: seededTeam.systems,
  services: seededTeam.services,
  workflows: seededTeam.workflows,
  technologies: seededTeam.technologies,
  documents: seededTeam.documents,
} as const;
