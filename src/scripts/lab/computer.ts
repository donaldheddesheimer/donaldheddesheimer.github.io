// The computer on the lab's desk, on the homepage (/). It holds the whole portfolio, as a terminal.
//
// A click on the monitor (or its link, from the keyboard) flies the opening's camera once, straight to reading:
// square on to the screen, where the terminal is real HTML (src/components/Terminal.astro, terminal.ts)
// laid over the monitor's screen. The screen rides the monitor in flight and lies flat, focused and
// scrollable inside itself, once there. While reading, the robots come to rest and the scene stops drawing.
//
// Windows too small to read on the monitor with the room round it (phones, narrow or short windows: the
// `onDesk` gate), and a room that can't be drawn (no WebGL), show the same terminal across the whole window
// instead, over what's left of it when a keyboard is up: no flight, the terminal fading in (cutting in,
// without motion). A window resized either way while reading moves between the two.
//
// The address names what the computer shows (routes.ts): /?computer (the terminal) or
// /?computer=work/<id> (a project, the terminal showing `work <id>`). Going in adds an entry, and so
// does each project opened from the prompt; anything else asked for there makes the entry the
// terminal's again, showing that. Back and Forward move between them, each entry finding its view in the
// terminal where it was left, and out of the lab. A project's address, shared or reloaded, opens the
// computer on it (at the section its #anchor names, shared). Escape, the terminal's `exit` and, on a
// touch screen, the power button on the monitor's bezel go back to the entry the lab was opened from,
// and put the focus back on the monitor (ringed, unless the button was tapped). A reload or a shared link
// opens the computer at once, without the camera's entrance; so do the old pages' addresses
// (/?computer=about, /#about…), which run their command. history.state is { pc: path, back: entries
// since the opening (0: the lab was opened here), d: entries since the lab's first, v: the terminal's
// view it shows (terminal.ts; a project's is its path), k: the entry's own key }. Each view's place is
// the terminal's to keep (terminal.ts). (Entries from before views had n and y instead: v is found for
// them as they're shown.)
import type { LabScene, Quad, Rect } from './scene';
import { initTerminal, type Focus } from './terminal';
import { TERMINAL, isCommand, labHref, parse } from './routes';

type State = 'closed' | 'moving' | 'read';
interface Entry {
  pc?: string;
  back?: number;
  d?: number;
  v?: string;
  k?: string;
}

const FADE_MS = 250; // the opening's text fades before the camera moves
const ASPECT = 1.6; // the monitor's screen (scene.ts SCREEN), for reading before the scene has loaded
const BEZEL = 0.018 / 0.68; // the bezel's width, as a share of the screen's (scene.ts buildWorkstation)
const onDesk = matchMedia('(width >= 64rem) and (height >= 36rem)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const html = document.documentElement;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

// The CSS transform that lays a w x h box onto a quad (corners clockwise from top left).
function warp(q: Quad, w: number, h: number) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const k = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

/** `load` gets the scene, loading it first if it hasn't been (a click before it was ready, or Save-Data).
 *  `eager`: a lab opened at once (a reload, a shared link) loads the room behind it straight away. */
export function initComputer(root: HTMLElement, dialog: HTMLDialogElement, getScene: () => LabScene | null, load: () => Promise<LabScene | null>, eager = true) {
  const link = document.querySelector<HTMLAnchorElement>('[data-lab-monitor]');
  const screenEl = dialog.querySelector<HTMLElement>('[data-pc-screen]');
  const termRoot = dialog.querySelector<HTMLElement>('[data-term]');
  const exit = dialog.querySelector<HTMLButtonElement>('[data-pc-exit]');
  if (!screenEl || !termRoot) return;
  const screen: HTMLElement = screenEl;
  // The projects: their ids, and names.
  let titles: Record<string, string> = {};
  try {
    titles = JSON.parse(dialog.dataset.projects ?? '{}') ?? {};
  } catch {}
  const projects = Object.keys(titles);
  let state: State = 'closed';
  let queued: (() => void) | null = null;
  let full = false;
  let placed = false; // the scene is in the reading view (it may arrive after the lab has opened)
  let rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let homeTitle = document.title;
  const termTitle = dialog.dataset.title ?? document.title;
  let opener: HTMLElement | null = null;
  let clicked = false; // the power button was tapped (not pressed): the focus comes back without a ring
  let scroll: [number, number] = [0, 0];
  let pending: string | null = null; // a command to run once the terminal is there (an old page's address)
  let used = ''; // what was last used here: 'key', or a pointer's type
  let shownKey: string | undefined; // the key of the entry the terminal was last shown for
  let shown: Entry | null = null; // and that entry, as it was then

  const motionOK = () => !reduce.matches && html.dataset.motion !== 'off';
  const ready = () => !!getScene() && root.dataset.drawn != null && root.dataset.failed == null;
  // Whether the computer reads on the monitor, in the room (or else across the window).
  const inRoom = () => onDesk.matches && root.dataset.failed == null;
  const entry = (): Entry => (history.state && typeof history.state === 'object' ? history.state : {});
  const current = () => parse(new URLSearchParams(location.search).get('computer'), projects);
  // Where the focus goes as the terminal comes on screen: the prompt, for a keyboard; the terminal
  // itself for a touch screen, whose keyboard would come up over the startup.
  const focusFor = (): Focus => (used === 'key' || used === 'mouse' ? 'input' : used || coarse.matches ? 'log' : 'input');
  addEventListener('keydown', () => (used = 'key'), true);
  addEventListener('pointerdown', (e) => (used = e.pointerType || 'mouse'), true);

  const term = initTerminal(termRoot, dialog, {
    went,
    exit: () => leave(),
    motion: motionOK,
  });

  // --- The views, in the address and its entries ------------------------------------------------------

  const newKey = () => Math.random().toString(36).slice(2, 10);
  // The project command each entry was left by (tapped or clicked), for the focus to come back to.
  const openers = new Map<string, HTMLElement>();

  const project = (path: string) => (path.startsWith('work/') ? path.slice(5) : null);
  const titleOf = (path: string | null) => {
    const id = path && project(path);
    return id && titles[id] ? `${titles[id]} · ${termTitle}` : termTitle;
  };

  // The terminal as the address's entry has it: a project's address, that project; the terminal's, the
  // view the entry showed (or, new, whatever the terminal was showing: coming back from the room finds
  // it as it was left, a project's address again if that's a project). Each where it was left; a
  // project's address new to this tab (shared, typed, or an anchor edited into it), at the section its
  // #anchor names.
  function show() {
    let path = current();
    if (!path) return;
    let e = entry();
    const fresh = !e.k;
    // An anchor edited into the address while reading: the browser's own new entry, one on from the one
    // shown, showing the same (and Escape still leaves).
    if (history.state == null && state === 'read' && shown) {
      e = { pc: path, back: shown.back ? shown.back + 1 : 0, d: (shown.d ?? 0) + 1, v: shown.pc === path ? shown.v : undefined };
    }
    term.open(project(path) ? path : (e.v ?? term.current()), fresh ? location.hash : '');
    const v = term.current();
    if (path === TERMINAL && project(v)) path = v;
    e = { pc: path, back: e.back, d: e.d, v, k: e.k ?? newKey() };
    history.replaceState(e, '', path === current() ? undefined : labHref(path));
    shownKey = e.k;
    shown = e;
    if (state === 'read') document.title = titleOf(path);
  }
  // A view asked for at the prompt. A project: a new entry for it (unless it's the one being read).
  // Anything else: the entry's own, now the terminal's (a project isn't what's being read now).
  function went(view: string, from: HTMLElement | null) {
    if (state !== 'read' || !current()) return;
    const e = entry();
    if (project(view)) {
      if (current() === view) return;
      // (Typed, it has none: the focus stays in the prompt, coming back.)
      if (e.k && from) openers.set(e.k, from);
      else if (e.k) openers.delete(e.k);
      shown = { pc: view, back: e.back ? e.back + 1 : 0, d: (e.d ?? 0) + 1, v: view, k: newKey() };
      history.pushState(shown, '', labHref(view));
    } else {
      shown = { ...e, pc: TERMINAL, v: view };
      history.replaceState(shown, '', current() === TERMINAL ? undefined : labHref(TERMINAL));
    }
    shownKey = shown.k;
    document.title = titleOf(current());
  }

  // --- Where the screen is ----------------------------------------------------------------------------

  // What of the window can be seen: less than all of it while a touch screen's keyboard is up.
  function view() {
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) < 0.01) return { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height };
    return { x: 0, y: 0, w: html.clientWidth, h: html.clientHeight };
  }
  // Where the screen lands for reading: centred in what can be seen, as large as that allows with a
  // margin of room round it, and nearly square on.
  function layout(): Rect {
    const aspect = getScene()?.screenAspect ?? ASPECT;
    const v = view();
    const m = Math.max(20, v.h * 0.035);
    const w = Math.round(Math.min(v.w * 0.84, (v.h - 2 * m) * aspect));
    const h = Math.round(w / aspect);
    return { x: Math.round(v.x + (v.w - w) / 2), y: Math.round(v.y + (v.h - h) / 2), w, h };
  }

  const size = () => {
    screen.style.width = `${rect.w}px`;
    screen.style.height = `${rect.h}px`;
  };
  // Reading: flat, whole pixels (sharp text), and the one thing that takes the keyboard.
  function flat() {
    screen.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    screen.style.opacity = '1';
    screen.inert = false;
  }
  // Over the monitor's drawn screen (the same terminal, waiting), it fades in mid-flight on the way in,
  // out early on the way back.
  const riding = (fade: 'in' | 'out') => (q: Quad, p: number) => {
    screen.style.transform = warp(q, rect.w, rect.h);
    screen.style.opacity = String(fade === 'in' ? smooth(0.3, 0.7, p) : 1 - smooth(0.05, 0.3, p));
  };
  // The power button (a touch screen's; LabStage.astro shows it only there): on the bezel under the
  // screen, at its right; across the window, CSS places it. Its box (and focus ring) keeps off the
  // screen, with the icon on the bezel: where the bezel is narrower than the box would need, the box is
  // smaller (a finger's reach goes on below it).
  function placeExit() {
    if (!exit) return;
    if (full) {
      for (const k of ['left', 'top', '--pc-exit']) exit.style.removeProperty(k);
      return;
    }
    const b = rect.w * BEZEL;
    const foot = view().y + view().h;
    const rem = parseFloat(getComputedStyle(html).fontSize);
    const size = Math.floor(Math.max(24, Math.min(rem * 2.75, 2 * b - 16, foot - (rect.y + rect.h) - 2)));
    exit.style.setProperty('--pc-exit', `${size}px`);
    exit.style.left = `${Math.round(rect.x + rect.w - Math.max(22, b * 1.6))}px`;
    exit.style.top = `${Math.round(Math.min(rect.y + rect.h + Math.max(b / 2, size / 2 + 1), foot - size / 2))}px`;
  }
  // Across the window, the terminal keeps to what can be seen, above a keyboard (terminal.css keeps
  // its prompt at the foot of it); the power button goes while the keyboard is up.
  function fit() {
    const v = view();
    dialog.style.setProperty('--vv-top', `${v.y}px`);
    dialog.style.setProperty('--vv-h', `${v.h}px`);
    html.toggleAttribute('data-pc-kb', full && coarse.matches && v.h < html.clientHeight - 120);
  }

  // Put the scene in the reading view at once, if it's there and hasn't flown there itself.
  function place() {
    const scene = getScene();
    if (placed || state !== 'read' || !scene || root.dataset.failed != null || full) return;
    placed = true;
    scene.go('read', rect, noop, true).then(() => scene.quiet(true));
  }

  // A scene loaded on demand draws its first frame once its stage has been measured, not with the
  // mount. Wait for it, or for a failure; give up after a few seconds.
  const firstFrame = () =>
    new Promise<void>((resolve) => {
      const done = () => root.dataset.drawn != null || root.dataset.failed != null;
      if (done()) return resolve();
      const end = () => {
        watch.disconnect();
        clearTimeout(timer);
        resolve();
      };
      const watch = new MutationObserver(() => done() && end());
      watch.observe(root, { attributes: true, attributeFilter: ['data-drawn', 'data-failed'] });
      const timer = setTimeout(end, 8000);
    });

  // --- Going in and out -------------------------------------------------------------------------------

  // Open on `path` (the terminal, or a project's details over it): flying in from the opening (`fly`,
  // where the room is there and motion allows), or at once.
  async function open(path: string, fly: boolean) {
    state = 'moving';
    if (fly && !ready() && inRoom() && motionOK()) {
      html.dataset.pcLoading = '';
      if (await load()) await firstFrame();
      delete html.dataset.pcLoading;
      await new Promise((r) => requestAnimationFrame(r)); // a frame for the canvas to show
    }
    if (current() !== path) {
      // Back was pressed while the room loaded.
      state = 'closed';
      return after();
    }
    const scene = getScene();
    fly = fly && !!scene && ready() && inRoom() && motionOK();
    // Focus comes back to what had it (the monitor's link, from the keyboard), or to the monitor's link.
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    clicked = false;
    if (!html.dataset.pc) scroll = [scrollX, scrollY];
    homeTitle = html.dataset.pc ? homeTitle : document.title;
    full = !inRoom();
    html.toggleAttribute('data-pc-full', full);
    screen.inert = true;
    screen.style.opacity = '0';
    dialog.showModal();
    // The dialog takes focus until the terminal is ready for it.
    dialog.focus();
    fit();
    rect = layout();
    size();
    term.restore();
    show();
    if (fly) {
      html.dataset.pc = 'fade';
      await wait(FADE_MS);
      rect = layout();
      size();
      term.restore();
      show();
      html.dataset.pc = 'fly';
      placed = true;
      await scene!.go('read', rect, riding('in'));
    } else {
      html.dataset.pc = 'read';
      placed = false;
    }
    land();
  }

  function land() {
    state = 'read';
    html.dataset.pc = 'read';
    getScene()?.quiet(true);
    // Laid out for the window as it is now (it may have been resized, or the room lost, in flight), with
    // the room behind a lab opened at once (loaded now, or when it arrives).
    relayout();
    term.enter(focusFor());
    document.title = titleOf(current());
    after();
  }

  async function close(instant = false) {
    if (state !== 'read') return after();
    state = 'moving';
    term.leave();
    full = false;
    html.removeAttribute('data-pc-full');
    html.removeAttribute('data-pc-kb');
    screen.inert = true;
    const scene = getScene();
    scene?.quiet(false);
    if (scene && placed && ready() && !instant && inRoom() && motionOK()) {
      html.dataset.pc = 'return';
      await scene.go('hero', rect, riding('out'));
    }
    shownKey = undefined;
    shown = null;
    placed = false;
    delete html.dataset.pc;
    scene?.home();
    dialog.close();
    document.title = homeTitle;
    state = 'closed';
    scrollTo(scroll[0], scroll[1]);
    // Or the monitor's link, if that's gone or can't take it now (a Settings switch, its panel shut).
    // (focusVisible: not yet in TypeScript's DOM types; a browser without it shows the ring.)
    const opts = clicked ? ({ preventScroll: true, focusVisible: false } as FocusOptions) : { preventScroll: true };
    if (opener?.isConnected) opener.focus(opts);
    if (document.activeElement !== opener) link?.focus(opts);
    clicked = false;
    after();
  }

  // After each move: anything asked for during it, or else catch up with the address.
  function after() {
    const next = queued;
    queued = null;
    if (next) next();
    else sync();
  }

  // An old page's address (/?computer=about): the terminal's, with the command to run.
  function normalize() {
    const path = current();
    if (!path || !isCommand(path)) return;
    pending = path;
    history.replaceState({ ...entry(), pc: TERMINAL, d: 0 } satisfies Entry, '', labHref(TERMINAL));
  }
  function runPending() {
    if (!pending || state !== 'read' || !current()) return;
    const cmd = pending;
    pending = null;
    term.run(cmd);
  }

  // The lab follows the address: open on a computer path, the terminal or a project as it names,
  // closed on any other.
  function sync(instant = false) {
    if (state === 'moving') {
      queued ??= () => sync(instant);
      return;
    }
    normalize();
    const path = current();
    if (path && state === 'closed') return void open(path, !instant);
    if (!path) {
      if (state === 'read') close(instant);
      return;
    }
    if (state !== 'read') return;
    if (entry().k !== shownKey) {
      const was = entry().k;
      show();
      // Back to where a project was opened from: the focus to its command, as a link followed and gone
      // back from has it (if the focus is still in the terminal).
      const from = was ? openers.get(was) : undefined;
      const a = document.activeElement;
      if (from?.isConnected && (!a || a === document.body || a === dialog || termRoot!.contains(a))) {
        from.focus({ preventScroll: true, focusVisible: used === 'key' } as FocusOptions);
      }
    }
    runPending();
  }

  // Go in from the opening: a new entry, on the terminal.
  function go() {
    if (state !== 'closed') return;
    history.pushState({ pc: TERMINAL, back: 1, d: 0, k: newKey() } satisfies Entry, '', labHref(TERMINAL));
    open(TERMINAL, true);
  }
  // Leave: back to the entry the lab was opened from, or, for a lab opened here, the opening in place.
  let going: boolean | null = null; // a history.go() asked for, until its popstate: whether to leave at once
  let strip = false; // and the entry it lands on is to become the opening's (a lab opened here)
  function leave(instant = false) {
    if (state === 'moving') {
      queued = () => leave(instant);
      return;
    }
    // (Asked for during a move that shut the lab: the address may have moved on since.)
    if (state !== 'read') return sync();
    if (going != null) return;
    if (current()) {
      const e = entry();
      if (e.back) {
        going = instant;
        return history.go(-e.back); // popstate closes it
      }
      if (e.d) {
        going = instant;
        strip = true;
        return history.go(-e.d);
      }
      history.replaceState(null, '', location.pathname);
    }
    close(instant);
  }

  // --- Events -----------------------------------------------------------------------------------------

  const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  // The monitor's link: the keyboard's way in, and the pointer's until the room has drawn.
  link?.addEventListener('click', (e) => {
    if (!plain(e)) return; // the link's own address (the terminal's page), in a new tab or window
    e.preventDefault();
    go();
  });
  // The drawn monitor, from the opening. A drag that ends over it is a look around, not a click; a
  // modified or middle click opens the link's own address in a new tab, as the link does.
  const onMonitor = (e: MouseEvent) => {
    const scene = getScene();
    if (state !== 'closed' || (e.target as Element).closest('a, button') || !scene || !ready()) return false;
    return !scene.dragged() && scene.pick(e.clientX, e.clientY);
  };
  const newTab = () => link && window.open(link.href, '_blank', 'noopener');
  root.addEventListener('click', (e) => {
    if (!onMonitor(e)) return;
    if (plain(e)) go();
    else if (e.button === 0 && (e.metaKey || e.ctrlKey || e.shiftKey)) newTab();
  });
  root.addEventListener('auxclick', (e) => {
    if (e.button === 1 && onMonitor(e)) newTab();
  });
  exit?.addEventListener('click', (e) => {
    clicked = e.detail > 0;
    leave();
  });
  // A close request: Escape leaves; the platform's Back (Android's), with no Escape behind it, goes back
  // as Back does, or leaves a lab opened here. One the page may not refuse (the browser's limit on them,
  // without a tap or a key since) shuts the dialog regardless: 'close' leaves then.
  let escaped = false;
  addEventListener('keydown', (e) => (escaped = e.key === 'Escape' && !e.isComposing), true);
  addEventListener('keyup', () => (escaped = false), true);
  dialog.addEventListener('cancel', (e) => {
    if (!e.cancelable) return;
    e.preventDefault();
    const esc = escaped;
    escaped = false;
    // Escape on the way in: out again, once there.
    if (state === 'moving' && esc) return leave();
    if (state !== 'read' || going != null) return;
    const back = !esc && (entry().back || entry().d);
    if (back) {
      going = false;
      history.back();
    } else leave();
  });
  // Closed by the browser rather than by us (in flight, too): leave at once.
  dialog.addEventListener('close', () => {
    if (state === 'closed' || dialog.open) return;
    if (going != null) going = true;
    else leave(true);
  });
  addEventListener('popstate', () => {
    if (strip) {
      strip = false;
      history.replaceState(null, '', location.pathname);
    }
    const instant = going === true;
    going = null;
    sync(instant);
  });
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    going = null;
    strip = false;
    sync(true);
  });
  addEventListener('pagehide', () => {
    if (state === 'read') term.leave();
  });
  // An old anchor typed or followed on the opening (/#about): the terminal, running it.
  addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (state !== 'closed' || current() || !isCommand(h)) return;
    pending = h;
    history.replaceState({ pc: TERMINAL, back: 1, d: 0, k: newKey() } satisfies Entry, '', labHref(TERMINAL));
    sync();
  });

  // A window resized between the monitor and the whole window, a keyboard up or down, or a room lost
  // while reading.
  function relayout() {
    if (state !== 'read') return;
    full = !inRoom();
    html.toggleAttribute('data-pc-full', full);
    fit();
    rect = layout();
    size();
    flat();
    placeExit();
    const scene = getScene();
    if (full) scene?.quiet(true);
    else if (placed && scene) scene.setRect(rect);
    else if (scene) place();
    else if (eager) load().then(() => place());
  }
  addEventListener('resize', relayout);
  window.visualViewport?.addEventListener('resize', relayout);
  window.visualViewport?.addEventListener('scroll', relayout);
  onDesk.addEventListener('change', relayout);
  new MutationObserver(relayout).observe(root, { attributes: true, attributeFilter: ['data-failed'] });

  // The page under the lab stays where it was, whatever tries to scroll it.
  addEventListener('scroll', () => {
    if (html.dataset.pc && (scrollX !== scroll[0] || scrollY !== scroll[1])) scrollTo(scroll[0], scroll[1]);
  });
  // Running: the homepage's inline script leaves the failure guard be, and the addresses that stopped at
  // the transcript after a failure come to the lab again.
  html.dataset.pcLive = '';
  try {
    sessionStorage.removeItem('lab:static');
  } catch {}
  // A reload, a shared link or an old address: the homepage's inline script has already shown the lab
  // reading (and made an old page's address the terminal's, with its command to run).
  const run = html.dataset.pcRun;
  delete html.dataset.pcRun;
  if (run && isCommand(run)) pending = run;
  normalize();
  const path = current();
  if (path && html.dataset.pc === 'read') {
    const e = entry();
    // (Keyless: new to this tab, shown at its #anchor. show() gives it its key.)
    if (e.pc !== path) history.replaceState({ pc: path, back: 0, d: 0 } satisfies Entry, '');
    open(path, false);
  } else if (html.dataset.pc) delete html.dataset.pc;
}
