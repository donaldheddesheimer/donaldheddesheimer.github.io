// The computer on the lab's desk, on the homepage (/). It holds the whole portfolio.
//
// A click on the monitor (or its link, from the keyboard) flies the opening's camera once, straight to reading:
// square on to the screen, where the portfolio is real HTML (/computer/…, src/layouts/Screen.astro) in a
// frame laid over the monitor's screen. The frame rides the screen in flight and lies flat, focused and
// scrollable, once there. While reading, the robots come to rest and the scene stops drawing.
//
// Windows too small to read on the monitor with the room round it (phones, narrow or short windows: the
// `onDesk` gate), and a room that can't be drawn (no WebGL), read the same pages across the whole window
// instead: no flight, the page fading in (cutting in, without motion). A window resized either way while
// reading moves between the two.
//
// The address names what the computer shows (routes.ts): /?computer=<path>. Going in adds an entry; each
// page opened inside adds one; Back and Forward move between them, and out of the lab. "Back to room"
// (the computer's own link) and Escape go back to the entry the lab was opened from, and put the focus
// back where it was (ringed, unless "Back to room" was clicked or tapped). A reload or a shared link opens the computer on its page at once, without the
// camera's entrance; so do the homepage's old anchors (/#work, /#about, /#resume, /#contact).
// history.state is { pc: path, back: entries since the opening (0: the lab was opened here), prev: the
// entry before is one of the computer's pages too (in a lab opened here), y: the page's scroll when last
// left, k: the entry's own key }.
import type { LabScene, Quad, Rect } from './scene';
import { PAGES, labHref, pageHref, parse } from './routes';

type State = 'closed' | 'moving' | 'read';
interface Entry {
  pc?: string;
  back?: number;
  prev?: boolean;
  y?: number;
  k?: string;
}

const FADE_MS = 250; // the opening's text fades before the camera moves
const ASPECT = 1.6; // the monitor's screen (scene.ts SCREEN), for reading before the scene has loaded
const onDesk = matchMedia('(width >= 64rem) and (height >= 36rem)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
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
  let projects: string[] = [];
  try {
    projects = JSON.parse(dialog.dataset.projects ?? '[]');
  } catch {}
  let state: State = 'closed';
  let shown: string | null = null; // the computer path in the frame
  let shownKey: string | undefined; // and the key of the entry it was shown for
  let queued: (() => void) | null = null;
  let frame: HTMLIFrameElement | null = null;
  let loaded = false;
  let restoreY: number | null = null;
  let full = false;
  let placed = false; // the scene is in the reading view (it may arrive after the lab has opened)
  let rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let homeTitle = document.title;
  let pageTitle = document.title;
  let opener: HTMLElement | null = null;
  let clicked = false; // "Back to room" was clicked or tapped (not pressed): the focus comes back without a ring
  let scroll: [number, number] = [0, 0];

  const motionOK = () => !reduce.matches && html.dataset.motion !== 'off';
  const ready = () => !!getScene() && root.dataset.drawn != null && root.dataset.failed == null;
  // Whether the computer reads on the monitor, in the room (or else across the window).
  const inRoom = () => onDesk.matches && root.dataset.failed == null;
  const entry = (): Entry => (history.state && typeof history.state === 'object' ? history.state : {});
  const current = () => parse(new URLSearchParams(location.search).get('computer'), projects);
  const frameY = () => {
    try {
      return Math.round(frame?.contentWindow?.scrollY ?? 0);
    } catch {
      return 0;
    }
  };
  // Keep the page's scroll in its entry, for Back and Forward (and a reload) to return to.
  const remember = () => {
    if (state !== 'read' || !current()) return;
    const e = entry();
    const y = frameY();
    if (e.k) left.set(e.k, y);
    history.replaceState({ ...e, y }, '');
  };
  // And as it scrolls, since Back and Forward leave an entry without asking: only while the frame still
  // holds the page the address names (after Back, the old page may scroll once more before it goes).
  let keepTimer = 0;
  const keep = () => {
    clearTimeout(keepTimer);
    keepTimer = window.setTimeout(() => {
      const path = current();
      try {
        if (path && frame?.contentWindow?.location.pathname === pageHref(path)) remember();
      } catch {}
    }, 150);
  };
  // Back or Forward can come before that (a scroll a moment old, or one still moving), and by the time
  // popstate says so the entry left can't be written: its scroll is kept here, by its key, instead.
  const left = new Map<string, number>();
  const newKey = () => Math.random().toString(36).slice(2, 10);
  const scrollOf = (e: Entry) => (e.k ? left.get(e.k) : undefined) ?? e.y ?? null;

  // Where the screen lands for reading: centred, as large as the window allows with a margin of room
  // round it, and nearly square on.
  function layout(): Rect {
    const aspect = getScene()?.screenAspect ?? ASPECT;
    const vw = html.clientWidth;
    const vh = html.clientHeight;
    const m = Math.max(20, vh * 0.035);
    const w = Math.round(Math.min(vw * 0.84, (vh - 2 * m) * aspect));
    const h = Math.round(w / aspect);
    return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
  }

  const size = () => {
    if (!frame) return;
    frame.style.width = `${rect.w}px`;
    frame.style.height = `${rect.h}px`;
  };
  // Reading: flat, whole pixels (sharp text), and the one thing that takes the keyboard.
  function flat() {
    if (!frame) return;
    frame.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    frame.style.opacity = loaded ? '1' : '0';
    frame.inert = false;
    frame.tabIndex = 0;
  }
  // Over the monitor's drawn screen, the page fades in mid-flight on the way in, out early on the way back.
  const riding = (fade: 'in' | 'out') => (q: Quad, p: number) => {
    if (!frame) return;
    frame.style.transform = warp(q, rect.w, rect.h);
    const o = fade === 'in' ? smooth(0.3, 0.7, p) : 1 - smooth(0.05, 0.3, p);
    frame.style.opacity = loaded ? String(o) : '0';
  };
  function focusFrame() {
    if (!frame) return;
    frame.focus({ preventScroll: true });
    frame.contentWindow?.focus();
  }

  function makeFrame(path: string, hash = '') {
    loaded = false;
    shown = path;
    shownKey = entry().k;
    frame = document.createElement('iframe');
    frame.className = 'pc-frame';
    frame.title = 'Portfolio';
    frame.inert = true;
    frame.tabIndex = -1;
    frame.addEventListener('load', () => {
      if (!frame) return;
      loaded = true;
      frame.contentWindow?.addEventListener('scroll', keep, { passive: true });
      if (restoreY != null) {
        frame.contentWindow?.scrollTo(0, restoreY);
        restoreY = null;
      }
      if (state === 'read') {
        flat();
        if (dialog.contains(document.activeElement)) focusFrame();
      }
    });
    frame.src = pageHref(path) + hash;
    dialog.append(frame);
  }
  // Another page in the same frame, without an entry of the frame's own (the lab keeps the history).
  function show(path: string, hash = '', y: number | null = null) {
    if (!frame?.contentWindow) return;
    shown = path;
    shownKey = entry().k;
    restoreY = y;
    frame.contentWindow.location.replace(pageHref(path) + hash);
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

  // Open on `path`: flying in from the opening (`fly`, where the room is there and motion allows), or
  // at once. `y` is where the page was last left, `hash` an anchor on it.
  async function open(path: string, fly: boolean, y: number | null = null, hash = '') {
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
    restoreY = y;
    makeFrame(path, hash);
    dialog.showModal();
    // The dialog takes focus until the page is ready for it.
    dialog.focus();
    if (fly) {
      html.dataset.pc = 'fade';
      await wait(FADE_MS);
      rect = layout();
      size();
      html.dataset.pc = 'fly';
      placed = true;
      await scene!.go('read', rect, riding('in'));
    } else {
      html.dataset.pc = 'read';
      rect = layout();
      size();
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
    // The page, once it's there (a frame focused on its blank document can lose the keys when the page
    // replaces it; the frame's load focuses it otherwise, from the dialog).
    if (loaded) focusFrame();
    document.title = pageTitle;
    after();
  }

  async function close(instant = false) {
    if (state !== 'read') return after();
    state = 'moving';
    full = false;
    html.removeAttribute('data-pc-full');
    if (frame) frame.inert = true;
    const scene = getScene();
    scene?.quiet(false);
    if (scene && placed && ready() && !instant && inRoom() && motionOK()) {
      html.dataset.pc = 'return';
      await scene.go('hero', rect, riding('out'));
    }
    frame?.remove();
    frame = null;
    shown = null;
    shownKey = undefined;
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

  // The lab follows the address: open on a computer path, show the page it names, closed on any other.
  function sync(instant = false) {
    if (state === 'moving') {
      queued ??= () => sync(instant);
      return;
    }
    const path = current();
    const y = scrollOf(entry());
    if (path && state === 'closed') open(path, !instant, y);
    else if (path && state === 'read' && path !== shown) show(path, '', y ?? 0);
    else if (!path && state === 'read') close(instant);
  }

  // Go in from the opening: a new entry, on Work.
  function go(path = 'work') {
    if (state !== 'closed') return;
    history.pushState({ pc: path, back: 1, k: newKey() } satisfies Entry, '', labHref(path));
    open(path, true);
  }
  // A page of the computer's, from a link on the computer: a new entry.
  function navigate(path: string, hash: string) {
    if (state !== 'read' || !parse(path, projects)) return;
    remember();
    const back = entry().back ?? 0;
    history.pushState({ pc: path, back: back ? back + 1 : 0, prev: !back || undefined, k: newKey() } satisfies Entry, '', labHref(path));
    show(path, hash);
  }
  // Leave: back to the entry the lab was opened from, or, for a lab opened here, the opening in place.
  let going: boolean | null = null; // a history.go() asked for, until its popstate: whether to leave at once
  function leave(instant = false) {
    if (state === 'moving') {
      queued = () => leave(instant);
      return;
    }
    // (Asked for during a move that shut the lab: the address may have moved on since.)
    if (state !== 'read') return sync();
    if (going != null) return;
    if (current()) {
      remember();
      const back = entry().back ?? 0;
      if (back > 0) {
        going = instant;
        return history.go(-back); // popstate closes it
      }
      history.replaceState(null, '', location.pathname);
    }
    close(instant);
  }

  const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  // The monitor's link: the keyboard's way in, and the pointer's until the room has drawn.
  link?.addEventListener('click', (e) => {
    if (!plain(e)) return; // the link's own address (the computer's Work page), in a new tab or window
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
  // A close request, with the focus out of the frame (the page not loaded yet, or a tap on the room round
  // it): Escape leaves; the platform's Back (Android's), with no Escape behind it, goes back a page as
  // Back does, or leaves a lab opened at once on its first page. (With the focus in the frame, Back is
  // the history's.) One the page may not refuse (the browser's limit on them, without a tap or a key
  // since) shuts the dialog regardless: 'close' leaves then.
  let escaped = false;
  addEventListener('keydown', (e) => (escaped = e.key === 'Escape'), true);
  addEventListener('keyup', () => (escaped = false), true);
  dialog.addEventListener('cancel', (e) => {
    if (!e.cancelable) return;
    e.preventDefault();
    if (escaped || state !== 'read' || going != null || !(entry().back || entry().prev)) leave();
    else {
      going = false;
      history.back();
    }
  });
  // Closed by the browser rather than by us (in flight, too): leave at once.
  dialog.addEventListener('close', () => {
    if (state === 'closed' || dialog.open) return;
    if (going != null) going = true;
    else leave(true);
  });
  addEventListener('popstate', () => {
    // The page left, while the frame still holds it.
    try {
      if (state === 'read' && shown && shownKey && frame?.contentWindow?.location.pathname === pageHref(shown)) left.set(shownKey, frameY());
    } catch {}
    const instant = going === true;
    going = null;
    sync(instant);
  });
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    going = null;
    sync(true);
  });
  // An old anchor typed or followed on the opening (/#about): the computer on that page, in its place.
  addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (state !== 'closed' || current() || !(PAGES as readonly string[]).includes(h)) return;
    history.replaceState({ pc: h, back: 1, k: newKey() } satisfies Entry, '', labHref(h));
    sync();
  });

  // A window resized between the monitor and the whole window, or a room lost while reading.
  function relayout() {
    if (state !== 'read' || !frame) return;
    full = !inRoom();
    html.toggleAttribute('data-pc-full', full);
    rect = layout();
    size();
    flat();
    const scene = getScene();
    if (full) scene?.quiet(true);
    else if (placed && scene) scene.setRect(rect);
    else if (scene) place();
    else if (eager) load().then(() => place());
  }
  addEventListener('resize', relayout);
  onDesk.addEventListener('change', relayout);
  new MutationObserver(relayout).observe(root, { attributes: true, attributeFilter: ['data-failed'] });

  // The page under the lab stays where it was, whatever tries to scroll it.
  addEventListener('scroll', () => {
    if (html.dataset.pc && (scrollX !== scroll[0] || scrollY !== scroll[1])) scrollTo(scroll[0], scroll[1]);
  });
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const msg = e.data as { type?: string; path?: string; hash?: string; title?: string; pointer?: boolean };
    if (msg.type === 'pc:go' && typeof msg.path === 'string') navigate(msg.path, typeof msg.hash === 'string' ? msg.hash : '');
    else if (msg.type === 'pc:leave' || msg.type === 'pc:escape') {
      clicked = msg.type === 'pc:leave' && msg.pointer === true;
      leave();
    }
    else if (msg.type === 'pc:page' && typeof msg.title === 'string') {
      pageTitle = msg.title;
      if (state === 'read') document.title = pageTitle;
    }
  });

  // A reload, a shared link or an old anchor: the homepage's inline script has already shown the lab
  // reading (and made an anchor the address it stands for). An anchor on the page itself comes along.
  const path = current();
  if (path && html.dataset.pc === 'read') {
    if (entry().pc !== path) history.replaceState({ pc: path, back: 0, k: newKey() } satisfies Entry, '');
    open(path, false, scrollOf(entry()), location.hash);
  } else if (html.dataset.pc) delete html.dataset.pc;
}
