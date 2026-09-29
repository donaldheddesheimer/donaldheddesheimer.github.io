// The lab computer's terminal (src/components/Terminal.astro): a prompt that takes a handful of
// commands and prints what the portfolio has to say. A small dispatcher, not a shell: what's typed is
// trimmed, lower-cased and compared with the commands' names, never run, and shown back only as text.
// What a command prints was rendered with the page (TermOutput.astro) and is copied out of its
// <template>.
//
// The history reads top to bottom, a command and its output after the one before, with the prompt
// after them all (held at the screen's foot once they run past it). Each command scrolls once, to show
// its output: all of it with the prompt under it where it fits, or else from its start. Nothing pulls
// the view after that.
//
// It remembers, for the tab's session (sessionStorage; in memory where that's refused): what was run,
// where it was being read, and that the startup has played. Leaving the computer and coming back, or
// reloading, finds it as it was.
//
// Motion: the startup (the first line typed out, then the second and the prompt: about a second, once
// a session), help's lines one after another, each output coming in. All of it is decoration: the text
// is all there from the start (a screen reader reads it whole), a key or a tap ends the startup, and a
// new command settles the one before. Reduced motion, or Motion off in Settings: all at once, with a
// steady cursor.
import { isCommand } from './routes';
import { EXIT } from '../../lib/terminal';

const STORE = 'lab:terminal';
const KEEP = 60; // commands kept in the history
const BOOT_MS = 900; // the startup's length (terminal.css)

interface Saved {
  boot?: boolean;
  log?: string[];
  y?: number;
}

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
  /** A command, as if typed (an old page's address names it). At once, without the startup. */
  run(cmd: string): void;
  /** Covered by a project's details, or uncovered. */
  cover(on: boolean): void;
  /** The focus back from a project's details: to the link that opened them, or where `fallback` says
   *  (details opened from the address). `visible`: ringed (not after a click or a tap). */
  focusReturn(visible: boolean, fallback: Focus): void;
}

export function initTerminal(
  root: HTMLElement,
  templates: ParentNode,
  hooks: { detail: (id: string, from: HTMLElement) => void; exit: () => void; motion: () => boolean },
): Terminal {
  const log = root.querySelector<HTMLElement>('[data-term-log]')!;
  const form = root.querySelector<HTMLFormElement>('[data-term-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-term-input]')!;
  const cursor = root.querySelector<HTMLElement>('[data-term-cursor]')!;
  const measure = root.querySelector<HTMLElement>('[data-term-measure]')!;
  const status = root.querySelector<HTMLElement>('[data-term-status]')!;
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
  let from: HTMLElement | null = null; // the details link last followed
  let bootTimer = 0;
  let seq = 0;

  // --- The history ------------------------------------------------------------------------------

  const clone = (name: string) => {
    const t = templates.querySelector<HTMLTemplateElement>(`template[data-term-out="${name}"]`);
    return t ? (t.content.firstElementChild?.cloneNode(true) as HTMLElement | null) : null;
  };

  // A command as typed, and what it prints. `raw` is only ever text here.
  function print(raw: string, fresh: boolean) {
    const said = raw.trim();
    const cmd = said.toLowerCase();
    const entry = document.createElement('div');
    entry.className = 'term-entry';
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
    const out = !said || cmd === EXIT ? null : clone(cmd === 'help' || isCommand(cmd) ? cmd : 'not-found');
    if (out) entry.append(out);
    if (fresh) entry.classList.add('is-new');
    log.append(entry);
    // The oldest go once there are many (the session keeps as many).
    const entries = log.querySelectorAll('.term-entry');
    for (let i = 0; i < entries.length - KEEP; i++) entries[i].remove();
    return { entry, echo, out, said, cmd };
  }

  // The newest output's motion, to its end at once.
  const settle = () => log.querySelectorAll('.is-new').forEach((e) => e.classList.remove('is-new'));

  // Show what a command printed: all of it, with the prompt under it, where it fits; else from its top.
  // (The end, where all from the result's top down, the prompt too, fits in the view: the end is then
  // above its top.)
  function reveal(entry: HTMLElement) {
    const top = entry.offsetTop + inner.offsetTop - 12;
    const end = root.scrollHeight - root.clientHeight;
    root.scrollTo({ top: Math.min(top, end), behavior: hooks.motion() ? 'smooth' : 'auto' });
  }

  let say = 0;
  function announce(msg: string) {
    clearTimeout(say);
    status.textContent = '';
    say = window.setTimeout(() => (status.textContent = msg), 60);
  }

  // Run what was typed or tapped. `by`: how, which decides where the focus goes after (the prompt,
  // or, from a touch screen, the command's heading, without raising a keyboard over the output).
  function run(raw: string, by: 'type' | 'tap' | 'click' | 'address') {
    endBoot();
    settle();
    const { entry, echo, out, said, cmd } = print(raw, hooks.motion());
    saved.log = [...(saved.log ?? []), raw].slice(-KEEP);
    save();
    input.value = '';
    recall = -1;
    caret();
    reveal(entry);
    if (by === 'tap') echo.focus({ preventScroll: true });
    else {
      if (by === 'click') input.focus({ preventScroll: true });
      if (out) announce(out.dataset.announce ?? '');
    }
    if (said && cmd === EXIT) hooks.exit();
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
    input.setSelectionRange(input.value.length, input.value.length);
    caret();
  }

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
      // Once, however many clicks (a double click is still one; its second press took the focus, which
      // goes back to the prompt).
      if (e.detail > 1) return void (pointer === 'mouse' && input.focus({ preventScroll: true }));
      const by = e.detail === 0 || pointer === 'mouse' ? 'click' : 'tap';
      return run(cmd.dataset.termRun!, by);
    }
    const detail = t.closest<HTMLAnchorElement>('a[data-term-detail]');
    if (detail && plain(e)) {
      e.preventDefault();
      from = detail;
      return hooks.detail(detail.dataset.termDetail!, detail);
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
          saved.y = Math.round(root.scrollTop);
          save();
        }
      }, 150);
    },
    { passive: true },
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

  // The session so far: its history, printed as it was, without motion.
  if (saved.boot) root.dataset.boot = 'done';
  for (const raw of saved.log ?? []) print(raw, false);

  return {
    enter(focus) {
      // (Under a project's details, it waits to be seen.)
      if (!root.inert) boot();
      if (focus === 'input') input.focus({ preventScroll: true });
      else if (focus === 'log') root.focus({ preventScroll: true });
      caret();
    },
    leave() {
      // A startup that has begun is done; one never seen waits for next time.
      if (root.dataset.boot === 'play') endBoot();
      settle();
      if (root.clientHeight) saved.y = Math.round(root.scrollTop);
      save();
    },
    restore() {
      root.scrollTop = saved.y ?? 0;
      caret();
    },
    run(cmd) {
      endBoot();
      run(cmd, 'address');
    },
    cover(on) {
      root.inert = on;
    },
    focusReturn(visible, fallback) {
      boot();
      // (Asked for either way: Escape pressed in the details' frame isn't a key this page saw.)
      const opts = { preventScroll: true, focusVisible: visible } as FocusOptions;
      if (from?.isConnected) from.focus(opts);
      else if (fallback === 'input') input.focus({ preventScroll: true });
      else if (fallback === 'log') root.focus({ preventScroll: true });
      from = null;
      caret();
    },
  };
}
