// The homepage console's single source of truth: every entity (the person, organizations, projects,
// capabilities, measured outcomes), the typed relations between them, and where each one leads.
// The systems map, inspector, evidence views, timeline, project pages, and ⌘K search all read it.
// Build time only (it reads the content collection). Everything it says comes from src/data/site.ts
// and the project files; nothing here is new content.
import { getCollection, type CollectionEntry } from 'astro:content';
import { education, experience, metrics, mission, orgs, profile, type Experience, type Metric, type OrgKind } from '../data/site';
import { duration, fmtMonth, statusLabel } from './format';
import type { EntityType } from './layout';

export type { EntityType };
type Project = CollectionEntry<'projects'>;

// source -> target. affiliation: person -> org. partOf: child org -> parent org. builtAt: project -> org.
// personal: project -> person. related: project -> org. uses: project/org -> capability.
// measures: outcome -> org/project.
export type RelKind = 'affiliation' | 'partOf' | 'builtAt' | 'personal' | 'related' | 'uses' | 'measures';
export type Relation = { source: string; target: string; kind: RelKind };

export type Tone = 'active' | 'shipped' | 'archived' | 'current' | 'concluded' | 'enrolled';
export type Media = { src: string; alt: string; kind: string; poster?: string };
export type Action = { label: string; href?: string; icon: 'arrow-right' | 'github' | 'external' | 'file' | 'lock'; external?: boolean };

export type Entity = {
  id: string;
  type: EntityType;
  label: string; // short name on the map
  title: string;
  kind: string; // "Student team", "Project", "Capability"…
  code?: string;
  summary?: string;
  status?: { tone: Tone; label: string };
  period?: string;
  props: [string, string][];
  tags: string[];
  outcomes: string[]; // outcome entity ids measured here
  actions: Action[];
  media: Media[]; // stills first; never a GIF
  href?: string; // where a second click on the map goes
  exp?: Experience;
  project?: Project;
  metric?: Metric;
  isMission?: boolean;
};

export type LinkItem = { id: string; label: string; type: EntityType; note?: string };
export type LinkGroup = { label: string; items: LinkItem[] };

export const ME = 'person:me';
export const MISSION = `org:${mission.exp}`;

export const typeName: Record<EntityType, string> = {
  person: 'Person',
  org: 'Organization',
  project: 'Project',
  skill: 'Capability',
  outcome: 'Outcome',
};
export const typePlural: Record<EntityType, string> = {
  person: 'Person',
  org: 'Orgs',
  project: 'Projects',
  skill: 'Capabilities',
  outcome: 'Outcomes',
};
export const typeOrder: EntityType[] = ['person', 'org', 'project', 'skill', 'outcome'];

const orgKindLabel: Record<OrgKind, string> = {
  education: 'University',
  work: 'Employer',
  research: 'Research group',
  team: 'Student team',
  event: 'Hackathon',
  school: 'High school',
};
// How the person relates to each kind of org, as an inspector heading.
const affiliationGroup: Record<OrgKind, string> = {
  education: 'Education',
  work: 'Employment',
  team: 'Teams',
  research: 'Research',
  event: 'Hackathons',
  school: 'High school',
};

// "C++" -> "cpp", "Machine learning" -> "machine-learning"
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\+/g, 'p')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const recordHref = (ref: string, projectIds: Set<string>) => (projectIds.has(ref) ? `/projects/${ref}/` : `#exp-${ref}`);

function buildModel(projects: Project[]) {
  const entities = new Map<string, Entity>();
  const relations: Relation[] = [];
  const add = (e: Omit<Entity, 'props' | 'tags' | 'outcomes' | 'actions' | 'media'> & Partial<Entity>) =>
    entities.set(e.id, { props: [], tags: [], outcomes: [], actions: [], media: [], ...e });
  const rel = (source: string, target: string, kind: RelKind) => relations.push({ source, target, kind });
  const projectIds = new Set(projects.map((p) => p.id));

  add({
    id: ME,
    type: 'person',
    label: profile.name,
    title: profile.name,
    kind: 'Person',
    code: 'OBJ-000',
    summary: profile.tagline,
    props: [
      ['Current', profile.status],
      ['Education', profile.school],
      ['GPA', education.gpa],
      ['Location', profile.location],
    ],
    actions: [
      { label: 'View experience', href: '#experience', icon: 'arrow-right' },
      { label: 'Resume', href: profile.resume, icon: 'file', external: true },
    ],
  });

  for (const o of orgs) {
    const id = `org:${o.id}`;
    const exp = experience.find((e) => e.org === o.id);
    const e: Entity = {
      id,
      type: 'org',
      label: o.short,
      title: o.name,
      kind: orgKindLabel[o.kind],
      props: [],
      tags: exp?.tags ?? [],
      outcomes: [],
      actions: [],
      media: [],
      exp,
      isMission: id === MISSION,
    };
    if (exp) {
      e.status = exp.end ? { tone: 'concluded', label: 'Concluded' } : { tone: 'current', label: 'Current' };
      e.period = `${fmtMonth(exp.start)} – ${fmtMonth(exp.end)} · ${duration(exp.start, exp.end)}`;
      e.summary = exp.unit ? `${exp.role}, ${exp.unit}` : exp.role;
      e.props.push(['Role', exp.role], ...(exp.unit ? ([['Unit', exp.unit]] as [string, string][]) : []), ['Location', exp.location]);
      e.href = `#exp-${exp.id}`;
      e.actions.push({ label: 'Open record', href: e.href, icon: 'arrow-right' });
    } else if (o.id === education.org) {
      e.status = { tone: 'enrolled', label: 'Enrolled' };
      e.period = `${fmtMonth(education.start)} – ${fmtMonth(education.end)} (expected)`;
      e.summary = `${education.degree}, ${education.program}`;
      e.props.push(['Thread', education.thread], ['GPA', education.gpa]);
      e.href = '#exp-education';
      e.actions.push({ label: 'Open record', href: e.href, icon: 'arrow-right' });
    }
    entities.set(id, e);
    rel(ME, id, 'affiliation');
    if (o.parent) rel(id, `org:${o.parent}`, 'partOf');
  }

  // Tags shared by at least two objects (projects or roles) become capability nodes.
  const tagUse = new Map<string, string[]>();
  const use = (tag: string, id: string) => tagUse.set(tag, [...(tagUse.get(tag) ?? []), id]);

  for (const p of projects) {
    const id = `project:${p.id}`;
    const d = p.data;
    const still = d.poster ?? d.cover;
    const media: Media[] = [];
    if (still) {
      const ev = d.evidence.find((m) => m.src === still);
      media.push(ev ?? { src: still, alt: d.coverAlt ?? '', kind: 'cover' });
    }
    for (const m of d.evidence) if (!media.some((x) => x.src === m.src)) media.push(m);
    add({
      id,
      type: 'project',
      label: d.title.replace(/:.*/, ''),
      title: d.title,
      kind: 'Project',
      code: d.code,
      summary: d.summary,
      status: { tone: d.status, label: statusLabel[d.status] },
      period: `Started ${fmtMonth(d.start)}`,
      props: [
        ['Context', d.context ?? 'Personal project'],
        ...(d.team ? ([['Team', d.team]] as [string, string][]) : []),
      ],
      tags: d.tags,
      media,
      href: `/projects/${p.id}/`,
      project: p,
      actions: [
        { label: 'View case study', href: `/projects/${p.id}/`, icon: 'arrow-right' },
        d.repo ? { label: 'Open repository', href: d.repo, icon: 'github', external: true } : { label: d.repoNote ?? 'Private repository', icon: 'lock' },
        ...(d.demo ? [{ label: 'Live demo', href: d.demo, icon: 'external', external: true } as Action] : []),
      ],
    });
    if (d.org) rel(id, `org:${d.org}`, 'builtAt');
    else rel(id, ME, 'personal');
    for (const r of d.related) rel(id, `org:${r}`, 'related');
    d.tags.forEach((t) => use(t, id));
  }
  for (const e of experience) e.tags.forEach((t) => use(t, `org:${e.org}`));

  for (const [tag, users] of tagUse) {
    if (users.length < 2) continue;
    const id = `skill:${slug(tag)}`;
    const nProj = users.filter((u) => u.startsWith('project:')).length;
    const nRole = users.length - nProj;
    add({
      id,
      type: 'skill',
      label: tag,
      title: tag,
      kind: 'Capability',
      summary: [nProj && `${nProj} project${nProj > 1 ? 's' : ''}`, nRole && `${nRole} role${nRole > 1 ? 's' : ''}`].filter(Boolean).join(' and ') + ' tagged with it.',
    });
    users.forEach((u) => rel(u, id, 'uses'));
  }

  // Resume metrics become outcome nodes attached to the role or project they measure.
  for (const m of metrics) {
    const id = `outcome:${m.id}`;
    const exp = experience.find((e) => e.id === m.ref);
    const target = exp ? `org:${exp.org}` : `project:${m.ref}`;
    const parent = entities.get(target);
    if (!parent) throw new Error(`metric ${m.id} points at unknown ${target}`);
    const href = recordHref(m.ref, projectIds);
    add({
      id,
      type: 'outcome',
      label: m.value,
      title: `${m.qualifier ? `${m.qualifier} ` : ''}${m.value}`,
      kind: 'Measured outcome',
      summary: m.label,
      props: [['Source', parent.title]],
      metric: m,
      href,
      actions: [{ label: projectIds.has(m.ref) ? 'View case study' : 'Open record', href, icon: 'arrow-right' }],
    });
    parent.outcomes.push(id);
    rel(id, target, 'measures');
  }

  return { entities, relations };
}

// How a relation reads from the selected entity's side.
function groupLabel(r: Relation, selfIsSource: boolean, other: Entity): string {
  switch (r.kind) {
    case 'affiliation':
      return selfIsSource ? affiliationGroup[orgs.find((o) => `org:${o.id}` === other.id)!.kind] : 'Person';
    case 'partOf':
      return selfIsSource ? 'Part of' : 'Includes';
    case 'builtAt':
      return selfIsSource ? 'Built at' : 'Projects built here';
    case 'personal':
      return selfIsSource ? 'Personal project of' : 'Personal projects';
    case 'related':
      return selfIsSource ? 'Related to' : 'Related projects';
    case 'uses':
      return selfIsSource ? 'Capabilities' : 'Used by';
    case 'measures':
      return selfIsSource ? 'Measured at' : 'Measured outcomes';
  }
}

const GROUP_ORDER = [
  'Education',
  'Employment',
  'Teams',
  'Research',
  'Hackathons',
  'High school',
  'Person',
  'Part of',
  'Includes',
  'Built at',
  'Personal project of',
  'Related to',
  'Measured outcomes',
  'Measured at',
  'Projects built here',
  'Related projects',
  'Personal projects',
  'Capabilities',
  'Used by',
];

export type Model = ReturnType<typeof buildModel> & {
  links: (id: string) => LinkGroup[];
  degree: (id: string) => number;
  get: (id: string) => Entity;
  list: (type?: EntityType) => Entity[];
};

let cached: Model | undefined;

export async function getModel(): Promise<Model> {
  if (cached) return cached;
  const projects = (await getCollection('projects')).sort((a, b) => b.data.code.localeCompare(a.data.code));
  const m = buildModel(projects);
  const get = (id: string) => {
    const e = m.entities.get(id);
    if (!e) throw new Error(`unknown entity ${id}`);
    return e;
  };
  const links = (id: string): LinkGroup[] => {
    const groups = new Map<string, LinkItem[]>();
    for (const r of m.relations) {
      if (r.source !== id && r.target !== id) continue;
      const other = get(r.source === id ? r.target : r.source);
      const label = groupLabel(r, r.source === id, other);
      const note = other.type === 'outcome' ? other.metric!.label : undefined;
      groups.set(label, [...(groups.get(label) ?? []), { id: other.id, label: other.type === 'outcome' ? other.title : other.label, type: other.type, note }]);
    }
    return [...groups]
      .sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))
      .map(([label, items]) => ({ label, items: items.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)) }));
  };
  const degree = (id: string) => m.relations.filter((r) => r.source === id || r.target === id).length;
  const list = (type?: EntityType) => [...m.entities.values()].filter((e) => !type || e.type === type);
  cached = { ...m, links, degree, get, list };
  return cached;
}
