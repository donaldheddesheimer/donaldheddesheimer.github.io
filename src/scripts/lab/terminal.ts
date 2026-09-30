// The lab computer's terminal (src/components/Terminal.astro): a prompt that takes a handful of
// commands and prints what the portfolio has to say. A small dispatcher, not a shell: what's typed is
// trimmed, lower-cased and compared with the commands' names, never run, and shown back only as text.
// `work <id>` prints a project (its id matched against the projects'). What a command prints was
// rendered with the page (TermOutput.astro, TermProject.astro) and is copied out of its <template>.
//
// The history reads top to bottom, a command and its output after the one before, with the prompt
// after them all (held at the screen's foot once they run past it). Each command scrolls once, to show
// its output: all of it with the prompt under it where it fits, or else from its start. Nothing pulls
// the view after that.
//
// It remembers, for the tab's session (sessionStorage; in memory where that's refused): what was run,
// where it was being read, the figures unfolded, and that the startup has played. Leaving the computer
// and coming back, or reloading, finds it as it was. Each command run is numbered, once, for the session: the lab's
// addresses for a project (computer.ts) name the output they showed by its number, so going back to one
// finds that output again rather than printing it twice.
//
// Tab completes what's typed at the prompt, as a shell's does: a command's name, or a project's id
// after `work `. It only fills the prompt in, never runs it; and where there's nothing to complete, Tab
// moves on through the page as ever.
//
// Motion: the startup (the first line typed out, then the second and the prompt: about a second, once
// a session), help's lines one after another, each output coming in. All of it is decoration: the text
// is all there from the start (a screen reader reads it whole), a key or a tap ends the startup, and a
// new command settles the one before. Reduced motion, or Motion off in Settings: all at once, with a
// steady cursor.
import { COMMANDS, isCommand, labHref } from './routes';
import { EXIT, NO_PROJECT } from '../../lib/terminal';

const STORE = 'lab:terminal';
const KEEP = 60; // commands kept in the history
const BOOT_MS = 900; // the startup's length (terminal.css)

interface Saved {
  boot?: boolean;
  log?: string[];
  n?: number; // commands run in the session (the last in `log` is number n)
  y?: number;
  cut?: number; // the height of the oldest outputs, gone once there were many (places are kept past them)
  open?: string[]; // the figures unfolded: 'n:i', output n's i-th
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
  /** Back to its place (the screen has been laid out again). */
  restore(): void;
  /** A command, as if typed (an address names it), at once, without the startup; its output shown
   *  from its start, or at the section `anchor` names. Returns its number. */
  run(cmd: string, anchor?: string): number;
  /** Whether the history still holds output number `n`, and it's `cmd`'s. */
  has(n: number, cmd: string): boolean;
  /** Output number `n` shown, at once: from its start, or at the section `anchor` names. */
  show(n: number, anchor?: string): void;
  /** Where the history is scrolled to; given a place, scrolled there first. (A place stays the same
   *  place when the oldest outputs go.) */
  scroll(y?: number): number;
}

export function initTerminal(
  root: HTMLElement,
  templates: ParentNode,
  hooks: {
    /** A project run from the prompt (typed, or its command tapped or clicked: `from`) as output `n`. */
    project: (id: string, n: number, from: HTMLElement | null) => void;
    /** Anything else run from the prompt. */
    ran: () => void;
    exit: () => void;
    motion: () => boolean;
  },
): Terminal {
  const log = root.querySelector<HTMLElement>('[data-term-log]')!;
  const form = root.querySelector<HTMLFormElement>('[data-term-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-term-input]')!;
  const cursor = root.querySelector<HTMLElement>('[data-term-cursor]')!;
  const measure = root.querySelector<HTMLElement>('[data-term-measure]')!;
  const status = root.querySelector<HTMLElement>('[data-term-status]')!;
  const matches = root.querySelector<HTMLElement>('[data-term-matches]')!;
  const inner = log.parentElement!;
  // What the prompt covers at the screen's foot, so a link reached with Tab scrolls clear of it
  // (terminal.css, scroll-margin).
  new ResizeObserver(() => root.style.setProperty('--t-prompt', `${form.offsetHeight}px`)).observe(form);

  let saved: Saved = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(STORE) ?? '{}') ?? {};
  } catch {}
  const save = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(saved));
    } catch {}
  };

  let pointer = 'mouse'; // the last pointer used on the terminal
  let bootTimer = 0;
  let seq = 0;
  let count = Math.max(saved.n ?? 0, saved.log?.length ?? 0);

  // --- The history ------------------------------------------------------------------------------

  const clone = (name: string) => {
    const t = templates.querySelector<HTMLTemplateElement>(`template[data-term-out="${name}"]`);
    return t ? (t.content.firstElementChild?.cloneNode(true) as HTMLElement | null) : null;
  };

  // The projects: their ids, and names to guess from.
  const projects = [...templates.querySelectorAll<HTMLTemplateElement>('template[data-term-out^="work/"]')].map((t) => ({
    id: t.dataset.termOut!.slice(5),
    name: (t.dataset.title ?? '').toLowerCase().replace(/\s+/g, '-'),
  }));
  const projectCmd = (id: string) => {
    const a = document.createElement('a');
    a.className = 't-cmd';
    a.href = labHref(`work/${id}`);
    a.dataset.termRun = a.textContent = `work ${id}`;
    return a;
  };

  // What a command prints: its template's copy; for a project the site doesn't have, the answer naming
  // what was asked for, with the likeliest few it may have meant (their ids or names holding it, or it
  // holding their id).
  function output(cmd: string) {
    if (!cmd || cmd === EXIT) return null;
    if (cmd === 'help' || isCommand(cmd)) return clone(cmd);
    const id = cmd.match(/^work (.+)$/)?.[1];
    if (id == null) return clone('not-found');
    const out = (/^[\w-]+$/.test(id) && clone(`work/${id}`)) || clone('no-project');
    if (!out || out.dataset.project) return out;
    out.querySelector('[data-term-arg]')!.textContent = id;
    out.dataset.announce = `${NO_PROJECT[0]}${id}${NO_PROJECT[1]}work${NO_PROJECT[2]}`;
    const q = id.replace(/ /g, '-');
    const near = q.length < 2 ? [] : projects.filter((p) => p.id.includes(q) || p.name.includes(q) || q.includes(p.id)).slice(0, 3);
    const guess = out.querySelector<HTMLElement>('[data-term-guess]');
    const list = guess?.querySelector('[data-term-guesses]');
    if (near.length && guess && list) {
      near.forEach((p, i) => list.append(...(i ? [i === near.length - 1 ? ' or ' : ', '] : []), projectCmd(p.id)));
      guess.hidden = false;
    }
    return out;
  }

  // A command as typed, and what it prints, as output number `n`. `raw` is only ever text here.
  function print(raw: string, fresh: boolean, n: number) {
    const said = raw.trim();
    const cmd = norm(raw);
    const entry = document.createElement('div');
    entry.className = 'term-entry';
    entry.dataset.n = String(n);
    entry.dataset.cmd = cmd;
    const echo = document.createElement(said ? 'h2' : 'p');
    echo.className = 'term-echo';
    echo.id = `term-${++seq}`;
    echo.tabIndex = -1;
    const ps1 = document.createElement('span');
    ps1.className = 'term-ps1';
    ps1.setAttribute('aria-hidden', 'true');
    ps1.textContent = root.querySelector('.term-prompt .term-ps1')?.textContent ?? '$';
    echo.append(ps1, raw);
    if (!said) echo.setAttribute('aria-hidden', 'true');
    entry.append(echo);
    const out = output(cmd);
    if (out) entry.append(out);
    if (fresh) entry.classList.add('is-new');
    log.append(entry);
    // The oldest go once there are many (the session keeps as many), what's left moving up by their height.
    const entries = log.querySelectorAll<HTMLElement>('.term-entry');
    const gone = entries.length - KEEP;
    if (gone > 0) {
      const top = entries[gone].offsetTop;
      for (let i = 0; i < gone; i++) entries[i].remove();
      saved.cut = (saved.cut ?? 0) + top - entries[gone].offsetTop;
    }
    return { entry, echo, out, said, cmd };
  }

  // The newest output's motion, to its end at once.
  const settle = () => log.querySelectorAll('.is-new').forEach((e) => e.classList.remove('is-new'));

  // A scroll set while a reveal is still gliding can take on the glide's last few pixels a frame later
  // (the compositor's, caught up): it's set again once they've come in.
  let gliding = false;
  root.addEventListener('scrollend', () => (gliding = false));
  // A place in the history, measured from its first output, gone or not.
  const place = () => Math.round(root.scrollTop) + (saved.cut ?? 0);
  const goTo = (y: number) => jump(y - (saved.cut ?? 0));
  function jump(y: number) {
    root.scrollTo({ top: y, behavior: 'instant' });
    if (!gliding) return;
    gliding = false;
    requestAnimationFrame(() => requestAnimationFrame(() => root.scrollTo({ top: y, behavior: 'instant' })));
  }

  // Show what a command printed: all of it, with the prompt under it, where it fits; else from its top;
  // or from a section of it (`at`). (The end, where all from the result's top down, the prompt too, fits
  // in the view: the end is then above its top.) Layout offsets, not the screen's: it may be riding the
  // monitor in flight, transformed.
  function reveal(entry: HTMLElement, at: HTMLElement | null = null, instant = false) {
    let top = -12;
    for (let el: HTMLElement | null = at ?? entry; el && el !== root; el = el.offsetParent as HTMLElement | null) top += el.offsetTop;
    const end = root.scrollHeight - root.clientHeight;
    const y = at ? top : Math.min(top, end);
    if (hooks.motion() && !instant) {
      gliding = true;
      root.scrollTo({ top: y, behavior: 'smooth' });
    } else jump(y);
  }
  const entryOf = (n: number) => log.querySelector<HTMLElement>(`.term-entry[data-n="${n}"]`);
  // A section of a project's output, by the anchor a link to it names (its heading's id on its page).
  const section = (entry: HTMLElement, anchor = '') => {
    let a = anchor.replace(/^#/, '');
    try {
      a = decodeURIComponent(a);
    } catch {}
    return a ? entry.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(a)}"]`) : null;
  };

  let say = 0;
  function announce(msg: string) {
    clearTimeout(say);
    status.textContent = '';
    say = window.setTimeout(() => (status.textContent = msg), 60);
  }

  // Run what was typed or tapped. `by`: how, which decides where the focus goes after (the prompt,
  // or, from a touch screen, the command's heading, without raising a keyboard over the output); `from`,
  // the command tapped or clicked. An address's is shown at once, where its `anchor` says.
  function run(raw: string, by: 'type' | 'tap' | 'click' | 'address', from: HTMLElement | null = null, anchor = '') {
    endBoot();
    settle();
    const n = ++count;
    const { entry, echo, out, said, cmd } = print(raw, hooks.motion(), n);
    saved.log = [...(saved.log ?? []), raw].slice(-KEEP);
    saved.n = n;
    save();
    input.value = '';
    recall = -1;
    unlist();
    caret();
    // (Told before the output is scrolled to: the place it was run from is still in view.)
    if (by !== 'address') {
      if (out?.dataset.project) hooks.project(out.dataset.project, n, from);
      else if (cmd) hooks.ran();
    }
    reveal(entry, section(entry, anchor), by === 'address');
    if (by === 'tap') echo.focus({ preventScroll: true });
    else {
      if (by === 'click') input.focus({ preventScroll: true });
      if (out) announce(out.dataset.announce ?? '');
    }
    if (said && cmd === EXIT) hooks.exit();
    return n;
  }

  // Earlier commands again, Up and Down, as a shell's history does: the line being typed is kept.
  let recall = -1;
  let draft = '';
  const past = () => (saved.log ?? []).map((s) => s.trim()).filter((s, i, a) => s && s !== a[i - 1]);
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
    if ((t === root || t === inner || t === log) && pointer === 'mouse' && document.getSelection()?.isCollapsed !== false) input.focus({ preventScroll: true });
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

  // Its place, kept as it's read (a reload returns to it too).
  let keepTimer = 0;
  root.addEventListener(
    'scroll',
    () => {
      clearTimeout(keepTimer);
      keepTimer = window.setTimeout(() => {
        if (root.clientHeight) {
          saved.y = place();
          save();
        }
      }, 150);
    },
    { passive: true },
  );

  // A figure unfolded: its video's poster now (not before), and kept, for a reload to unfold it again.
  const unfold = (d: HTMLDetailsElement) => {
    for (const v of d.querySelectorAll<HTMLVideoElement>('video[data-poster]')) {
      v.poster = v.dataset.poster!;
      v.removeAttribute('data-poster');
    }
  };
  const figures = (entry: Element) => [...entry.querySelectorAll<HTMLDetailsElement>('details.t-fig')];
  log.addEventListener(
    'toggle',
    (e) => {
      const d = e.target as HTMLDetailsElement;
      if (!d.matches('details.t-fig')) return;
      if (d.open) unfold(d);
      saved.open = [...log.querySelectorAll<HTMLElement>('.term-entry')].flatMap((entry) =>
        figures(entry).flatMap((f, i) => (f.open ? [`${entry.dataset.n}:${i}`] : [])),
      );
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

  // The session so far: its history, printed as it was, without motion, its figures as they were.
  if (saved.boot) root.dataset.boot = 'done';
  const first = count - (saved.log?.length ?? 0) + 1;
  (saved.log ?? []).forEach((raw, i) => print(raw, false, first + i));
  for (const f of saved.open ?? []) {
    const [n, i] = f.split(':').map(Number);
    const entry = entryOf(n);
    const d = entry && figures(entry)[i];
    if (d) {
      d.open = true;
      unfold(d);
    }
  }

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
      if (root.clientHeight) saved.y = place();
      save();
    },
    restore() {
      goTo(saved.y ?? 0);
      caret();
    },
    run(cmd, anchor) {
      return run(cmd, 'address', null, anchor);
    },
    has(n, cmd) {
      return entryOf(n)?.dataset.cmd === norm(cmd);
    },
    show(n, anchor) {
      const entry = entryOf(n);
      if (entry) reveal(entry, section(entry, anchor), true);
    },
    scroll(y) {
      if (y != null) goTo(y);
      return place();
    },
  };
}
