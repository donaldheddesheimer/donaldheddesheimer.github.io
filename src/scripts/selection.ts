// Shared selection for the homepage console. Exactly one entity is selected at a time; the map,
// inspector, evidence stage, timeline, cards, and ⌘K all follow it. The current id lives on
// <html data-sel>, changes go out as `entity:select` events, and `?sel=` keeps it linkable.
// A separate `entity:preview` event traces an entity's neighbors on hover without selecting it.

export type SelDetail = { id: string; source: string };

const html = document.documentElement;
const data = document.getElementById('entity-data');
const { ids, fallback } = data ? (JSON.parse(data.textContent!) as { ids: string[]; fallback: string }) : { ids: [], fallback: '' };
const valid = new Set(ids);

export const DEFAULT_SEL = fallback;
export const isEntity = (id: string | null | undefined): id is string => !!id && valid.has(id);

const fromUrl = new URLSearchParams(location.search).get('sel');
let current = isEntity(fromUrl) ? fromUrl : DEFAULT_SEL;
if (current) html.dataset.sel = current;
// An old link to an object that no longer exists opens on the default, and drops its stale ?sel=.
if (data && fromUrl && !isEntity(fromUrl)) {
  const url = new URL(location.href);
  url.searchParams.delete('sel');
  history.replaceState(history.state, '', url);
}

export const getSel = () => current;

export function select(id: string, source = 'api') {
  if (!isEntity(id)) return;
  current = id;
  html.dataset.sel = id;
  const url = new URL(location.href);
  if (id === DEFAULT_SEL) url.searchParams.delete('sel');
  else url.searchParams.set('sel', id);
  if (url.href !== location.href) history.replaceState(history.state, '', url);
  document.dispatchEvent(new CustomEvent<SelDetail>('entity:select', { detail: { id, source } }));
}

// Runs fn now with the current selection, then on every change.
export function onSelect(fn: (d: SelDetail) => void) {
  document.addEventListener('entity:select', (e) => fn((e as CustomEvent<SelDetail>).detail));
  if (current) fn({ id: current, source: 'init' });
}

export function preview(id: string | null) {
  document.dispatchEvent(new CustomEvent<{ id: string | null }>('entity:preview', { detail: { id } }));
}

export function onPreview(fn: (id: string | null) => void) {
  document.addEventListener('entity:preview', (e) => fn((e as CustomEvent<{ id: string | null }>).detail.id));
}
