// PROTOTYPE (lab-cinematic, 2026-09-28; first pass lab-prototype, 2026-09-27): the computer on the lab's
// desk, in /prototype/. Forked from src/scripts/lab.ts (the released systems-map reveal), which is left as
// it is.
//
// "Explore the lab", or a click on the monitor, flies the opening's camera once, straight to reading:
// square on to the screen, where the portfolio is real HTML (/computer/…, src/layouts/Screen.astro) in a
// frame laid over the monitor's screen. The frame rides the screen in flight and lies flat, focused and
// scrollable, once there. While reading, the robots come to rest and the scene stops drawing.
//
// The address names what the computer shows (routes.ts): /prototype/?computer=<path>. Going in adds an
// entry; each page opened inside adds one; Back and Forward move between them, and out of the lab. Leave
// (the computer's own button, or Escape) goes back to the entry the lab was opened from. A reload or a
// shared link opens the computer on its page at once, over the room, without the camera's entrance.
// history.state is { pc: path, back: entries since the opening (0: the lab was opened here), y: the
// page's scroll when last left }.
//
// Windows that can't hold the composition (phones, narrow, short or portrait: the release's `roomy`
// gate) don't enter; the page below the opening has the same content. One that stops being roomy while
// reading shows the computer's page across the whole window.
import type { LabScene, Quad, Rect } from './scene';
import { frameHref, labHref, parse } from './routes';

type State = 'closed' | 'moving' | 'read';
interface Entry {
  pc?: string;
  back?: number;
  y?: number;
}

const FADE_MS = 250; // the opening's text fades before the camera moves
const ASPECT = 1.6; // the monitor's screen (scene.ts SCREEN), for reading before the scene has loaded
const roomy = matchMedia('(width >= 64rem) and (height >= 36rem) and (min-aspect-ratio: 3/2)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const html = document.documentElement;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const noop = () => {};

// The CSS transform that lays a w x h box onto a quad (corners clockwise from top left), as lab.ts.
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
  const enter = document.querySelector<HTMLAnchorElement>('[data-lab-enter]');
  let projects: string[] = [];
  try {
    projects = JSON.parse(dialog.dataset.projects ?? '[]');
  } catch {}
  let state: State = 'closed';
  let shown: string | null = null; // the computer path in the frame
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
  let scroll: [number, number] = [0, 0];

  const motionOK = () => !reduce.matches && html.dataset.motion !== 'off';
  const ready = () => !!getScene() && root.dataset.drawn != null && root.dataset.failed == null;
  const canEnter = () => roomy.matches && root.dataset.failed == null;
  // Whether "Explore the lab" is offered (the inline script on /prototype/ sets it first, from `roomy`).
  const offer = () => html.toggleAttribute('data-pc-able', canEnter());
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
    if (state === 'read' && current()) history.replaceState({ ...entry(), y: frameY() }, '');
  };

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

  function makeFrame(path: string) {
    loaded = false;
    shown = path;
    frame = document.createElement('iframe');
    frame.className = 'pc-frame';
    frame.title = 'Portfolio';
    frame.inert = true;
    frame.tabIndex = -1;
    frame.addEventListener('load', () => {
      if (!frame) return;
      loaded = true;
      if (restoreY != null) {
        frame.contentWindow?.scrollTo(0, restoreY);
        restoreY = null;
      }
      if (state === 'read') {
        flat();
        if (dialog.contains(document.activeElement)) focusFrame();
      }
    });
    frame.src = frameHref(path);
    dialog.append(frame);
  }
  // Another page in the same frame, without an entry of the frame's own (the lab keeps the history).
  function show(path: string, hash = '', y: number | null = null) {
    if (!frame?.contentWindow) return;
    shown = path;
    restoreY = y;
    frame.contentWindow.location.replace(frameHref(path) + hash);
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
  // at once. `y` is where the page was last left.
  async function open(path: string, fly: boolean, y: number | null = null) {
    state = 'moving';
    if (fly && !ready() && canEnter()) {
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
    fly = fly && !!scene && ready() && canEnter() && motionOK();
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    if (!html.dataset.pc) scroll = [scrollX, scrollY];
    homeTitle = html.dataset.pc ? homeTitle : document.title;
    full = !roomy.matches;
    html.toggleAttribute('data-pc-full', full);
    restoreY = y;
    makeFrame(path);
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
    flat();
    focusFrame();
    document.title = pageTitle;
    place();
    // The room behind a lab opened at once (loaded now, or when it arrives).
    if (!placed && eager && !full && root.dataset.failed == null) load().then(() => place());
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
    if (scene && placed && ready() && !instant && roomy.matches && motionOK()) {
      html.dataset.pc = 'return';
      await scene.go('hero', rect, riding('out'));
    }
    frame?.remove();
    frame = null;
    shown = null;
    placed = false;
    delete html.dataset.pc;
    scene?.home();
    dialog.close();
    document.title = homeTitle;
    state = 'closed';
    scrollTo(scroll[0], scroll[1]);
    (opener?.isConnected ? opener : enter)?.focus({ preventScroll: true });
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
    const y = entry().y ?? null;
    if (path && state === 'closed') open(path, !instant && canEnter(), y);
    else if (path && state === 'read' && path !== shown) show(path, '', y ?? 0);
    else if (!path && state === 'read') close(instant);
  }

  // Go in from the opening: a new entry, on Work.
  function go(path = 'work') {
    if (state !== 'closed' || !canEnter()) return;
    history.pushState({ pc: path, back: 1 } satisfies Entry, '', labHref(path));
    open(path, true);
  }
  // A page of the computer's, from a link on the computer: a new entry.
  function navigate(path: string, hash: string) {
    if (state !== 'read' || !parse(path, projects)) return;
    remember();
    const back = entry().back ?? 0;
    history.pushState({ pc: path, back: back ? back + 1 : 0 } satisfies Entry, '', labHref(path));
    show(path, hash);
  }
  // Leave: back to the entry the lab was opened from, or, for a lab opened here, the opening in place.
  function leave(instant = false) {
    if (state === 'moving') {
      queued = () => leave(instant);
      return;
    }
    if (state !== 'read') return;
    if (current()) {
      remember();
      const back = entry().back ?? 0;
      if (back > 0) return history.go(-back); // popstate closes it
      history.replaceState(null, '', location.pathname);
    }
    close(instant);
  }

  const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  enter?.addEventListener('click', (e) => {
    if (!plain(e) || !html.hasAttribute('data-pc-able')) return; // the link's own #work
    e.preventDefault();
    go();
  });
  // The monitor, from the opening. A drag that ends over it is a look around, not a click. Where the
  // lab can't open, its content is below.
  root.addEventListener('click', (e) => {
    const scene = getScene();
    if ((e.target as Element).closest('a, button') || state !== 'closed' || !scene || scene.dragged() || !scene.pick(e.clientX, e.clientY)) return;
    if (canEnter() && plain(e)) go();
    else document.getElementById('work')?.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto' });
  });
  // Escape, with the focus out of the frame.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    leave();
  });
  // Closed by the browser rather than by us (a second Escape can force it): leave at once.
  dialog.addEventListener('close', () => {
    if (state === 'read' && !dialog.open) leave(true);
  });
  addEventListener('popstate', () => sync());
  addEventListener('pageshow', (e) => {
    if (e.persisted) sync(true);
  });

  // A window that stops (or starts) being able to hold the composition.
  function relayout() {
    offer();
    if (state !== 'read' || !frame) return;
    full = !roomy.matches;
    html.toggleAttribute('data-pc-full', full);
    rect = layout();
    size();
    flat();
    const scene = getScene();
    if (full) scene?.quiet(true);
    else if (placed && scene) scene.setRect(rect);
    else place();
  }
  addEventListener('resize', relayout);
  roomy.addEventListener('change', relayout);
  new MutationObserver(offer).observe(root, { attributes: true, attributeFilter: ['data-failed'] });
  offer();

  // The page under the lab stays where it was, whatever tries to scroll it.
  addEventListener('scroll', () => {
    if (html.dataset.pc && (scrollX !== scroll[0] || scrollY !== scroll[1])) scrollTo(scroll[0], scroll[1]);
  });
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const msg = e.data as { type?: string; path?: string; hash?: string; title?: string };
    if (msg.type === 'pc:go' && typeof msg.path === 'string') navigate(msg.path, typeof msg.hash === 'string' ? msg.hash : '');
    else if (msg.type === 'pc:leave' || msg.type === 'pc:escape') leave();
    else if (msg.type === 'pc:page' && typeof msg.title === 'string') {
      pageTitle = msg.title;
      if (state === 'read') document.title = pageTitle;
    }
  });

  // A reload or a shared link: the inline script on /prototype/ has already shown the lab reading.
  const path = current();
  if (path && html.dataset.pc === 'read') {
    if (entry().pc !== path) history.replaceState({ pc: path, back: 0 } satisfies Entry, '');
    open(path, false, entry().y ?? null);
  } else if (html.dataset.pc) delete html.dataset.pc;
}
