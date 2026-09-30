// The lab computer's terminal (src/components/Terminal.astro): a prompt that takes a handful of
// commands and shows what the portfolio has to say. A small dispatcher, not a shell: what's typed is
// trimmed, lower-cased and compared with the commands' names, never run, and shown back only as text.
// `work <id>` shows a project (its id matched against the projects'). What a command shows was rendered
// with the page (TermOutput.astro, TermProject.astro) and is copied out of its <template> the first time.
//
// One view at a time, over the prompt, which keeps to the screen's foot: the startup's lines until
// something is asked for, then help, a section or a project, whichever was asked for last. Asking for
// another puts it in the first's place; asking for the same again leaves it be. Each view keeps its own
// place and what was unfolded in it, for coming back to. A mistake (a command there isn't, a project
// that isn't there) is said on a line over the prompt, leaving the view as it was, until the next
// command. Nothing pulls the view after it's shown.
//
// Up and Down bring back what was typed before, as a shell's history does: that list is its own, apart
// from the views. Tab completes what's typed, as a shell's does: a command's name, or a project's id
// after `work `. It only fills the prompt in, never runs it; and where there's nothing to complete, Tab
// moves on through the page as ever.
//
// It remembers, for the tab's session (sessionStorage; in memory where that's refused): what was typed,
// the view being read, each view's place and what was unfolded in it, and that the startup has played.
// Leaving the computer and coming back, or reloading, finds it as it was. The first version kept the
// transcript itself (lab:terminal): read once, for what was typed and the last view it showed.
//
// Motion: the startup (the first line typed out, then the second and the prompt: about a second, once
// a session), a new view coming in quickly (help's lines one after another). All of it is decoration:
// the text is all there from the start (a screen reader reads it whole), a key or a tap ends the
// startup, and the next view settles the one before. Reduced motion, or Motion off in Settings: all at
// once, with a steady cursor.
import { COMMANDS, isCommand, labHref } from './routes';
import { EXIT, NOT_FOUND, NO_PROJECT, ps1 } from '../../lib/terminal';

const STORE = 'lab:terminal:2';
const OLD = 'lab:terminal'; // the first version's, the transcript
const KEEP = 60; // commands kept for Up and Down
const BOOT_MS = 900; // the startup's length (terminal.css)
const START = ''; // the startup's view

interface Place {
  y?: number; // where it was scrolled to
  open?: number[]; // its disclosures unfolded, by their order in it
}
interface Saved {
  v: 2;
  boot?: boolean;
  recall?: string[];
  view?: string;
  views?: Record<string, Place>;
}

/** A command as it's matched: trimmed, lower-cased, its words one space apart. */
const norm = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, ' ');

/** Where the focus goes as the terminal comes on screen: the prompt (for typing), the terminal itself
 *  (a touch screen's, which a prompt would cover with its keyboard), or nowhere. */
export type Focus = 'input' | 'log' | 'none';

export interface Terminal {
  /** On screen and ready: the startup, the first time in the session, and the focus. */
  enter(focus: Focus): void;
  /** Off screen: its place kept, its motion settled. */
  leave(): void;
  /** Back to the view's place (the screen has been laid out again). */
  restore(): void;
  /** A command, as if typed (an old address names it), at once, without the startup. */
  run(cmd: string): void;
  /** A view shown, at once, as an address has it ('help', a section, 'work/<id>', or '' for the
   *  startup): where it was left, or at the section `anchor` names. False if there's no such view. */
  open(view: string, anchor?: string): boolean;
  /** The view being read. */
  current(): string;
}

export function initTerminal(
  root: HTMLElement,
  templates: ParentNode,
  hooks: {
    /** A view asked for at the prompt (typed, or its command tapped or clicked: `from`), or by an old
     *  address's command. */
    went: (view: string, from: HTMLElement | null) => void;
    exit: () => void;
    motion: () => boolean;
  },
): Terminal {
  const area = root.querySelector<HTMLElement>('[data-term-views]')!;
  const form = root.querySelector<HTMLFormElement>('[data-term-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-term-input]')!;
  const prompt = root.querySelector<HTMLElement>('[data-term-ps1]')!;
  const cursor = root.querySelector<HTMLElement>('[data-term-cursor]')!;
  const measure = root.querySelector<HTMLElement>('[data-term-measure]')!;
  const status = root.querySelector<HTMLElement>('[data-term-status]')!;
  const matches = root.querySelector<HTMLElement>('[data-term-matches]')!;
  const note = root.querySelector<HTMLElement>('[data-term-note]')!;
  const inner = area.parentElement!;
  // What the prompt covers at the screen's foot, so a link reached with Tab scrolls clear of it
  // (terminal.css, scroll-margin).
  new ResizeObserver(() => root.style.setProperty('--t-prompt', `${form.offsetHeight}px`)).observe(form);

  const clone = (name: string) => {
    const t = templates.querySelector<HTMLTemplateElement>(`template[data-term-out="${name}"]`);
    return t ? (t.content.firstElementChild?.cloneNode(true) as HTMLElement | null) : null;
  };

  // The projects: their ids, and names to guess from.
  const projects = [...templates.querySelectorAll<HTMLTemplateElement>('template[data-term-out^="work/"]')].map((t) => ({
    id: t.dataset.termOut!.slice(5),
    name: (t.dataset.title ?? '').toLowerCase().replace(/\s+/g, '-'),
  }));
  const ids = new Set(projects.map((p) => p.id));
  const projectCmd = (id: string) => {
    const a = document.createElement('a');
    a.className = 't-cmd';
    a.href = labHref(`work/${id}`);
    a.dataset.termRun = a.textContent = `work ${id}`;
    return a;
  };

  /** The view a command shows (a command as matched), or null for none. */
  function viewOf(cmd: string) {
    if (cmd === 'help' || isCommand(cmd)) return cmd;
    const id = cmd.match(/^work ([\w-]+)$/)?.[1];
    return id && ids.has(id) ? `work/${id}` : null;
  }
  const isView = (v: unknown): v is string => v === START || (typeof v === 'string' && viewOf(v.replace('/', ' ')) === v);

  // --- The session ------------------------------------------------------------------------------

  // What was kept, checked, as another version (or a hand) may have written it; or else the first
  // version's transcript, read for what was typed and the last view it showed, and left as it was.
  const read = (key: string) => {
    try {
      const v = JSON.parse(sessionStorage.getItem(key) ?? 'null');
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const lines = (a: unknown) => (Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string' && !!s.trim()) : []);
  function load(): Saved {
    const now = read(STORE);
    if (now?.v === 2) {
      const views: Record<string, Place> = {};
      for (const [v, p] of Object.entries(now.views && typeof now.views === 'object' ? now.views : {})) {
        if (!isView(v) || !p || typeof p !== 'object') continue;
        const { y, open } = p as Place;
        views[v] = {
          y: Number.isFinite(y) ? Math.max(0, y!) : undefined,
          open: Array.isArray(open) ? open.filter((i) => Number.isInteger(i) && i >= 0) : undefined,
        };
      }
      return { v: 2, boot: now.boot === true, recall: lines(now.recall).slice(-KEEP), view: isView(now.view) ? now.view : START, views };
    }
    const old = read(OLD);
    const recall = lines(old?.log)
      .map((s) => s.trim())
      .slice(-KEEP);
    const last = recall.flatMap((s) => viewOf(norm(s)) ?? []).at(-1);
    return { v: 2, boot: old?.boot === true, recall, view: last ?? START, views: {} };
  }
  const saved = load();
  const save = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(saved));
    } catch {}
  };
  const place = (view: string) => ((saved.views ??= {})[view] ??= {});

  let pointer = 'mouse'; // the last pointer used on the terminal
  let bootTimer = 0;

  // --- The views ---------------------------------------------------------------------------------

  // Each view asked for so far, its element: the one being read shown, the others kept as they were.
  const mounted = new Map<string, HTMLElement>([[START, area.querySelector<HTMLElement>(`[data-view="${START}"]`)!]]);
  let cur = START;
  const disclosures = (el: Element) => [...el.querySelectorAll<HTMLDetailsElement>('details')];

  // A figure unfolded: its video's poster now (not before).
  const unfold = (d: HTMLDetailsElement) => {
    for (const v of d.querySelectorAll<HTMLVideoElement>('video[data-poster]')) {
      v.poster = v.dataset.poster!;
      v.removeAttribute('data-poster');
    }
  };

  function mount(view: string) {
    let el = mounted.get(view);
    if (el) return el;
    el = clone(view) ?? undefined;
    if (!el) return null;
    el.dataset.view = view;
    el.hidden = true;
    area.append(el);
    mounted.set(view, el);
    // Unfolded as it was left (a reload, or the session before).
    const open = place(view).open ?? [];
    disclosures(el).forEach((d, i) => {
      if (!open.includes(i)) return;
      d.open = true;
      unfold(d);
    });
    return el;
  }

  // The newest view's motion, to its end at once.
  const settle = () => area.querySelectorAll('.is-new').forEach((e) => e.classList.remove('is-new'));

  // A scroll set while the screen is still moving can take on the move's last few pixels a frame later
  // (the compositor's, caught up): it's set again once they've come in.
  function jump(y: number) {
    root.scrollTo({ top: y, behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(() => Math.abs(root.scrollTop - y) > 1 && root.scrollTo({ top: y, behavior: 'instant' })));
  }
  // A section of a project, by the anchor a link to it names (its heading's id on its page).
  const section = (el: HTMLElement, anchor = '') => {
    let a = anchor.replace(/^#/, '');
    try {
      a = decodeURIComponent(a);
    } catch {}
    return a ? el.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(a)}"]`) : null;
  };
  // Layout offsets, not the screen's: it may be riding the monitor in flight, transformed.
  const top = (at: HTMLElement) => {
    let y = -12;
    for (let el: HTMLElement | null = at; el && el !== root; el = el.offsetParent as HTMLElement | null) y += el.offsetTop;
    return y;
  };
  const keep = () => {
    if (root.clientHeight) place(cur).y = Math.round(root.scrollTop);
  };

  // Show `view` in the one's place: where it was left, or where `anchor` says (unfolding what holds it).
  // `fresh`: asked for just now, coming in.
  function show(view: string, anchor = '', fresh = false) {
    const el = mount(view);
    if (!el) return null;
    if (view !== cur) {
      keep();
      settle();
      unsay();
      mounted.get(cur)!.hidden = true;
      el.hidden = false;
      if (fresh && hooks.motion()) el.classList.add('is-new');
      cur = saved.view = view;
      prompt.textContent = ps1(view);
      jump(place(view).y ?? 0);
    }
    const at = section(el, anchor);
    if (at) {
      for (let d = at.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
      jump(top(at));
    }
    save();
    return el;
  }

  // --- Running ------------------------------------------------------------------------------------

  let say = 0;
  function announce(msg: string) {
    clearTimeout(say);
    status.textContent = '';
    say = window.setTimeout(() => (status.textContent = msg), 60);
  }

  // A mistake, over the prompt: what was asked for, and what to run instead. Cleared by the next command.
  function unsay() {
    note.replaceChildren();
    note.hidden = true;
  }
  function mistake(raw: string, cmd: string) {
    unsay();
    const id = cmd.match(/^work (.+)$/)?.[1];
    const out = clone(id == null ? 'not-found' : 'no-project');
    if (!out) return;
    out.querySelector('[data-term-arg]')!.textContent = id ?? raw.trim();
    let told = id == null ? `${raw.trim()}${NOT_FOUND[0]}help${NOT_FOUND[1]}` : `${NO_PROJECT[0]}${id}${NO_PROJECT[1]}work${NO_PROJECT[2]}`;
    // For a project the site doesn't have, the likeliest few it may have meant (their ids or names
    // holding it, or it holding their id).
    const guess = out.querySelector<HTMLElement>('[data-term-guess]');
    const list = guess?.querySelector('[data-term-guesses]');
    const q = (id ?? '').replace(/ /g, '-');
    const near = q.length < 2 ? [] : projects.filter((p) => p.id.includes(q) || p.name.includes(q) || q.includes(p.id)).slice(0, 3);
    if (near.length && guess && list) {
      near.forEach((p, i) => list.append(...(i ? [i === near.length - 1 ? ' or ' : ', '] : []), projectCmd(p.id)));
      guess.hidden = false;
      told += ` Did you mean ${near.map((p) => `work ${p.id}`).join(', ')}?`;
    }
    note.append(...out.childNodes);
    note.hidden = false;
    announce(told);
  }

  // Run what was typed or tapped. `by`: how, which decides where the focus goes after (the prompt, or,
  // from a touch screen, the view's title, without raising a keyboard over it); `from`, the command
  // tapped or clicked.
  function run(raw: string, by: 'type' | 'tap' | 'click' | 'address', from: HTMLElement | null = null) {
    endBoot();
    const said = raw.trim();
    const cmd = norm(raw);
    if (said) {
      saved.recall = [...(saved.recall ?? []), said].slice(-KEEP);
      save();
    }
    input.value = '';
    recall = -1;
    unlist();
    caret();
    unsay();
    if (!cmd) return;
    if (cmd === EXIT) return hooks.exit();
    const view = viewOf(cmd);
    if (view == null) return mistake(raw, cmd);
    const el = show(view, '', true)!;
    // (Told before the focus moves: the place it was run from is still in view.)
    hooks.went(view, from);
    if (by === 'tap') el.querySelector<HTMLElement>('.t-title')?.focus({ preventScroll: true });
    else if (by === 'click') input.focus({ preventScroll: true });
    announce(el.dataset.announce ?? '');
  }

  // Earlier commands again, Up and Down, as a shell's history does: the line being typed is kept.
  let recall = -1;
  let draft = '';
  const past = () => (saved.recall ?? []).filter((s, i, a) => s !== a[i - 1]);
  function step(by: number) {
    const list = past();
    if (!list.length) return;
    if (recall < 0) {
      if (by > 0) return;
      draft = input.value;
      recall = list.length;
    }
    recall = Math.min(list.length, Math.max(0, recall + by));
    input.value = recall === list.length ? draft : list[recall];
    if (recall === list.length) recall = -1;
    unlist();
    input.setSelectionRange(input.value.length, input.value.length);
    caret();
  }

  // --- Completion -------------------------------------------------------------------------------

  // Tab, the caret at the end of something typed (nothing selected): the command names help lists (and
  // help), or after `work `, the projects' ids, that start with it. One fills the prompt in (`work`
  // with a space after it, for an id); several fill in as much as they share, or, sharing no more, are
  // listed over the prompt, and told, until the next key. Nothing to complete, or the same Tab again
  // with the list already up, and Tab isn't taken: it moves on.
  const names = ['help', ...COMMANDS];
  let listed = '';
  function complete() {
    const v = input.value;
    const end = v.length;
    if (!v.trim() || input.selectionStart !== end || input.selectionEnd !== end) return false;
    const arg = v.match(/^\s*work\s+(\S+)$/i);
    const typed = arg ? arg[1].toLowerCase() : v.trimStart().toLowerCase();
    if (!arg && /\s/.test(typed)) return false;
    const hits = (arg ? projects.map((p) => p.id) : names).filter((c) => c.startsWith(typed));
    if (!hits.length) return false;
    const head = arg ? 'work ' : '';
    if (hits.length === 1) {
      const to = head + hits[0] + (hits[0] === 'work' ? ' ' : '');
      if (to === v) return false;
      fill(to);
      announce(to.trim());
      return true;
    }
    let shared = hits[0];
    for (const h of hits) while (!h.startsWith(shared)) shared = shared.slice(0, -1);
    if (shared.length > typed.length) {
      fill(head + shared);
      return true;
    }
    if (listed === hits.join(' ')) return false;
    listed = hits.join(' ');
    matches.textContent = hits.join('  ');
    matches.hidden = false;
    announce(`${hits.length} matches: ${hits.join(', ')}.`);
    return true;
  }
  function fill(to: string) {
    input.value = to;
    input.setSelectionRange(to.length, to.length);
    unlist();
    caret();
  }
  function unlist() {
    listed = '';
    matches.hidden = true;
    matches.textContent = '';
  }
  input.addEventListener('input', unlist);
  input.addEventListener('blur', unlist);
  // The list is for what's up to the caret at the end: moved off it (arrows, Home, a click in the
  // field) or something selected, and it goes too.
  const moved = () => {
    const n = input.value.length;
    if (listed && (input.selectionStart !== n || input.selectionEnd !== n)) unlist();
  };
  for (const type of ['select', 'keyup', 'pointerup']) input.addEventListener(type, moved);
  document.addEventListener('selectionchange', () => document.activeElement === input && moved());

  // --- The prompt's cursor ----------------------------------------------------------------------

  // Where the caret is: the block over the character there (or the space after the last), shown in the
  // terminal's colours reversed. Held still while typing, blinking once the typing stops.
  let blink = 0;
  function caret() {
    const n = input.value.length;
    const a = input.selectionStart ?? n;
    const b = input.selectionEnd ?? n;
    cursor.hidden = a !== b;
    measure.textContent = input.value.slice(0, a);
    cursor.style.transform = `translateX(${Math.max(0, measure.offsetWidth - input.scrollLeft)}px)`;
    cursor.textContent = input.value[a] ?? ' ';
    cursor.classList.remove('is-blink');
    clearTimeout(blink);
    if (document.activeElement === input) blink = window.setTimeout(() => cursor.classList.add('is-blink'), 500);
  }
  for (const type of ['input', 'focus', 'blur', 'select', 'scroll', 'keyup', 'pointerup']) input.addEventListener(type, caret);
  document.addEventListener('selectionchange', () => document.activeElement === input && caret());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value, 'type');
  });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Tab') {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && complete()) e.preventDefault();
    } else requestAnimationFrame(caret);
  });

  // --- Pointer and keys --------------------------------------------------------------------------

  root.addEventListener('pointerdown', (e) => {
    pointer = e.pointerType || 'mouse';
    endBoot();
  });
  root.addEventListener('keydown', (e) => {
    endBoot();
    // A letter typed with the focus elsewhere in the terminal (on a link, say) goes to the prompt.
    if (e.target === input || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ') return;
    input.focus({ preventScroll: true });
  });

  const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  root.addEventListener('click', (e) => {
    const t = e.target as Element;
    const cmd = t.closest<HTMLElement>('[data-term-run]');
    if (cmd) {
      // A command with an address (a project's) is a link: a modified click opens that in a new tab.
      if (cmd instanceof HTMLAnchorElement) {
        if (!plain(e)) return;
        e.preventDefault();
      }
      // Once, however many clicks (a double click is still one; its second press took the focus, which
      // goes back to the prompt).
      if (e.detail > 1) return void (pointer === 'mouse' && input.focus({ preventScroll: true }));
      const by = e.detail === 0 || pointer === 'mouse' ? 'click' : 'tap';
      return run(cmd.dataset.termRun!, by, cmd);
    }
    const copy = t.closest<HTMLButtonElement>('[data-term-copy]');
    if (copy) return void copyText(copy);
    // A click on the terminal's empty space (not its text, which may be being selected) is for typing.
    if ((t === root || t === inner || t === area || t === mounted.get(cur)) && pointer === 'mouse' && document.getSelection()?.isCollapsed !== false) {
      input.focus({ preventScroll: true });
    }
  });

  // The address, to the clipboard; where that's refused, selected, for copying by hand.
  async function copyText(b: HTMLButtonElement) {
    try {
      await navigator.clipboard.writeText(b.dataset.termCopy!);
      b.textContent = 'copied';
      announce('Copied.');
      setTimeout(() => (b.textContent = 'copy'), 1600);
    } catch {
      const a = b.parentElement?.querySelector('[data-term-email]');
      if (!a) return;
      document.getSelection()?.selectAllChildren(a);
      b.textContent = 'selected';
      announce('Selected, to copy.');
      setTimeout(() => (b.textContent = 'copy'), 1600);
    }
  }

  // The view's place, kept as it's read (a reload returns to it too).
  let keepTimer = 0;
  root.addEventListener(
    'scroll',
    () => {
      clearTimeout(keepTimer);
      keepTimer = window.setTimeout(() => {
        keep();
        save();
      }, 150);
    },
    { passive: true },
  );

  // A disclosure unfolded or folded: a figure's video's poster now, and what's unfolded kept, for
  // coming back to the view.
  area.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement)) return;
      const el = d.closest<HTMLElement>('[data-view]');
      if (!el) return;
      if (d.open) unfold(d);
      place(el.dataset.view!).open = disclosures(el).flatMap((f, i) => (f.open ? [i] : []));
      save();
    },
    true,
  );

  // --- The startup -------------------------------------------------------------------------------

  function boot() {
    if (root.dataset.boot !== 'pending') return;
    saved.boot = true;
    save();
    if (!hooks.motion()) return endBoot();
    root.dataset.boot = 'play';
    bootTimer = window.setTimeout(endBoot, BOOT_MS);
  }
  function endBoot() {
    if (root.dataset.boot === 'done') return;
    clearTimeout(bootTimer);
    root.dataset.boot = 'done';
    saved.boot = true;
    save();
  }

  // The session so far: the view it was reading, as it was left.
  if (saved.boot) root.dataset.boot = 'done';
  if (saved.view && show(saved.view)) endBoot();
  save();

  return {
    enter(focus) {
      boot();
      if (focus === 'input') input.focus({ preventScroll: true });
      else if (focus === 'log') root.focus({ preventScroll: true });
      caret();
    },
    leave() {
      // A startup that has begun is done; one never seen waits for next time.
      if (root.dataset.boot === 'play') endBoot();
      settle();
      unlist();
      keep();
      save();
    },
    restore() {
      jump(place(cur).y ?? 0);
      caret();
    },
    run(cmd) {
      run(cmd, 'address');
    },
    open(view, anchor = '') {
      if (!show(view, anchor)) return false;
      if (view !== START) endBoot();
      return true;
    },
    current: () => cur,
  };
}
