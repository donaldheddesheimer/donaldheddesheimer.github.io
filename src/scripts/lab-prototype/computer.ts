// PROTOTYPE (lab-prototype, 2026-09-27): the computer on the lab's desk, in /prototype/. Forked from
// src/scripts/lab.ts (the released systems-map reveal), which is left as it is.
//
// "Explore the lab" flies the opening's camera to the workstation; "Use the computer" (or a click on the
// monitor, from either view) goes on to reading, square on to the screen, where the portfolio is real
// HTML (/computer/, src/layouts/Screen.astro) in a frame laid over the monitor's screen. The frame rides
// the screen in the workstation view (warped, inert) and lies flat, focused and scrollable, in reading.
// While reading, the robots come to rest and the scene stops drawing.
//
// Temporary behaviour, to be validated before production (docs/lab-scene-handoff.md):
// - The lab takes one history entry, at the same address: Back (or "Leave the lab") leaves it from
//   either view; moving between the workstation and reading adds none. Escape steps back one view.
// - A reload, or a shared link, opens the opening: the address never names the lab or a page in it.
// - Windows that can't hold the composition (phones, narrow, short or portrait: the release's `roomy`
//   gate) don't enter; the page below the opening has the same content.
import type { LabScene, Quad, Rect } from './scene';

type View = 'desk' | 'read';
type State = 'closed' | 'moving' | View;

const FADE_MS = 250; // the opening's text fades before the camera moves
const roomy = matchMedia('(width >= 64rem) and (height >= 36rem) and (min-aspect-ratio: 3/2)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const html = document.documentElement;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** `load` gets the scene, loading it first if it hasn't been (a click before it was ready, or Save-Data). */
export function initComputer(root: HTMLElement, dialog: HTMLDialogElement, getScene: () => LabScene | null, load: () => Promise<LabScene | null>) {
  const heading = dialog.querySelector<HTMLElement>('[data-pc-title]')!;
  const use = dialog.querySelector<HTMLButtonElement>('[data-pc-use]')!;
  const ordinary = dialog.querySelector<HTMLAnchorElement>('[data-pc-ordinary]')!;
  const enter = document.querySelector<HTMLAnchorElement>('[data-lab-enter]');
  const name = dialog.dataset.name ?? '';
  let state: State = 'closed';
  let view: View = 'desk'; // where the lab is, or is going
  let pending: View | 'leave' | null = null;
  let frame: HTMLIFrameElement | null = null;
  let loaded = false;
  let full = false;
  let rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let homeTitle = document.title;
  let pageTitle = 'Portfolio';
  let opener: HTMLElement | null = null;
  let scroll: [number, number] = [0, 0];

  const motionOK = () => !reduce.matches && html.dataset.motion !== 'off';
  const ready = () => !!getScene() && root.dataset.drawn != null && root.dataset.failed == null;
  const canEnter = () => roomy.matches && root.dataset.failed == null;
  const wanted = () => history.state?.pc === true;
  // Whether "Explore the lab" is offered (the inline script on /prototype/ sets it first, from `roomy`).
  const offer = () => html.toggleAttribute('data-pc-able', canEnter());

  // Where the screen lands for reading: centred, as large as the window allows under the controls, with
  // the room still showing round it.
  function layout(aspect: number): Rect {
    const vw = html.clientWidth;
    const vh = html.clientHeight;
    const top = 64;
    const bottom = 28;
    const w = Math.round(Math.min(vw * 0.78, (vh - top - bottom) * aspect));
    const h = Math.round(w / aspect);
    return { x: Math.round((vw - w) / 2), y: Math.round(top + (vh - top - bottom - h) / 2), w, h };
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
  // The workstation: on the monitor, a picture of the page that can't be used until reading.
  function onMonitor(q: Quad) {
    if (!frame) return;
    frame.style.transform = warp(q, rect.w, rect.h);
    frame.style.opacity = loaded ? '1' : '0';
    frame.inert = true;
    frame.tabIndex = -1;
    // "Use the computer" sits under the monitor.
    const x = (q[2][0] + q[3][0]) / 2;
    const y = Math.max(q[2][1], q[3][1]);
    use.style.setProperty('--x', `${Math.round(x)}px`);
    use.style.setProperty('--y', `${Math.round(Math.min(y + 18, html.clientHeight - 64))}px`);
  }
  // Over the monitor's drawn screen, the page fades in mid-flight on the way in, out early on the way back.
  const riding = (fade: 'in' | 'out' | 'none') => (q: Quad, p: number) => {
    if (!frame) return;
    frame.style.transform = warp(q, rect.w, rect.h);
    const o = fade === 'in' ? smooth(0.3, 0.7, p) : fade === 'out' ? 1 - smooth(0.05, 0.3, p) : 1;
    frame.style.opacity = loaded ? String(o) : '0';
  };

  function titles() {
    heading.textContent = view === 'read' ? 'Portfolio' : 'The lab';
    document.title = view === 'read' ? pageTitle : `The lab · ${name}`;
  }

  // Resting in a view: its controls, its focus, and whether the robots carry on.
  function land(v: View, focus: boolean) {
    const scene = getScene()!;
    state = v;
    html.dataset.pc = v;
    titles();
    if (v === 'read') {
      scene.quiet(true);
      flat();
      if (focus) {
        frame?.focus({ preventScroll: true });
        frame?.contentWindow?.focus();
      }
    } else {
      scene.quiet(false);
      onMonitor(scene.quad());
      if (focus) use.focus({ preventScroll: true });
    }
  }

  function makeFrame() {
    loaded = false;
    pageTitle = 'Portfolio';
    frame = document.createElement('iframe');
    frame.className = 'pc-frame';
    frame.title = 'Portfolio';
    frame.src = '/computer/';
    frame.inert = true;
    frame.tabIndex = -1;
    frame.addEventListener('load', () => {
      loaded = true;
      if (state === 'read') flat();
      else if (state === 'desk') onMonitor(getScene()!.quad());
    });
    dialog.append(frame);
  }

  // A scene mounted on demand (Save-Data) draws its first frame once its stage has been measured, not
  // with the mount. Wait for it, or for a failure; give up after a few seconds.
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

  let loading = false;
  async function open(to: View) {
    if (state !== 'closed' || loading) return;
    if (!ready()) {
      loading = true;
      html.dataset.pcLoading = '';
      if (await load()) await firstFrame();
      delete html.dataset.pcLoading;
      // Give the canvas a frame to show it.
      await new Promise((r) => requestAnimationFrame(r));
      loading = false;
      if (state !== 'closed') return;
    }
    const scene = getScene();
    if (!scene || !ready() || !canEnter() || !wanted()) {
      // It couldn't load (or Back was pressed while it did): the page's own content is below.
      offer();
      if (wanted()) history.back();
      return;
    }
    state = 'moving';
    view = to;
    const instant = !motionOK();
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    scroll = [scrollX, scrollY];
    homeTitle = document.title;
    makeFrame();
    ordinary.href = '/';
    dialog.showModal();
    // The dialog itself takes focus; its controls appear when the camera lands.
    dialog.focus();
    titles();
    html.dataset.pc = 'fade';
    if (!instant) await wait(FADE_MS);
    rect = layout(scene.screenAspect);
    size();
    html.dataset.pc = 'fly';
    await scene.go(to, rect, riding('in'), instant);
    land(to, true);
    relayout();
    settle();
  }

  // Between the workstation and reading; no history.
  async function move(to: View) {
    const scene = getScene();
    if (!scene || (state !== 'desk' && state !== 'read') || state === to) return;
    const from = state;
    state = 'moving';
    view = to;
    titles();
    html.dataset.pc = 'fly';
    if (frame) frame.inert = true;
    if (from === 'read') scene.quiet(false);
    await scene.go(to, rect, riding('none'), !motionOK());
    land(to, true);
    settle();
  }

  async function close(instant = false) {
    const scene = getScene();
    if (state !== 'desk' && state !== 'read') return;
    state = 'moving';
    full = false;
    html.removeAttribute('data-pc-full');
    if (frame) frame.inert = true;
    scene?.quiet(false);
    if (scene && ready()) {
      html.dataset.pc = 'return';
      await scene.go('hero', rect, riding('out'), instant || !motionOK() || !roomy.matches);
    }
    frame?.remove();
    frame = null;
    delete html.dataset.pc;
    scene?.home();
    dialog.close();
    document.title = homeTitle;
    state = 'closed';
    scrollTo(scroll[0], scroll[1]);
    (opener?.isConnected ? opener : enter)?.focus({ preventScroll: true });
    settle();
  }

  // After a flight lands: anything asked for during it (a click, Escape, Back or Forward).
  function settle() {
    const next = pending;
    pending = null;
    if (next === 'leave') leave();
    else if (next) go(next);
    else reconcile();
  }

  // The lab follows its history entry: open on ours, closed on any other.
  function reconcile(instant = false) {
    if (state === 'moving') return;
    if (!wanted() && state !== 'closed') close(instant);
  }

  // Enter from the opening, or move within the lab.
  function go(to: View) {
    if (state === 'moving') {
      pending = to;
      return;
    }
    if (state === 'closed') {
      if (!canEnter()) return;
      if (!wanted()) history.pushState({ pc: true }, '');
      open(to);
    } else move(to);
  }
  // Leave: back to the entry the lab was opened from.
  function leave() {
    if (state === 'moving') {
      pending = 'leave';
      return;
    }
    if (wanted()) history.back();
    else close();
  }
  // Escape: reading goes back to the workstation, the workstation leaves.
  const back = () => (view === 'read' && !full ? go('desk') : leave());

  const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

  enter?.addEventListener('click', (e) => {
    if (!plain(e) || !html.hasAttribute('data-pc-able')) return; // the link's own #work
    e.preventDefault();
    go('desk');
  });
  // The monitor, from the opening: straight to reading. Where the lab can't open, its content is below.
  root.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button') || state !== 'closed' || !getScene()?.pick(e.clientX, e.clientY)) return;
    if (canEnter() && plain(e)) go('read');
    else document.getElementById('work')?.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto' });
  });
  const hover = (e: PointerEvent, el: HTMLElement) => {
    const scene = getScene();
    if (e.pointerType !== 'mouse' || !scene) return;
    el.style.cursor = (state === 'closed' || state === 'desk') && scene.pick(e.clientX, e.clientY) ? 'pointer' : '';
  };
  root.addEventListener('pointermove', (e) => state === 'closed' && hover(e, root));
  root.addEventListener('pointerleave', () => {
    getScene()?.pick(-1, -1);
    root.style.cursor = '';
  });
  // The monitor, from the workstation (the dialog is over the canvas; the frame there takes no pointer).
  dialog.addEventListener('pointermove', (e) => state === 'desk' && e.target === dialog && hover(e, dialog));
  dialog.addEventListener('click', (e) => {
    if (state !== 'desk' || e.target !== dialog || !getScene()?.pick(e.clientX, e.clientY)) return;
    dialog.style.cursor = '';
    go('read');
  });
  use.addEventListener('click', () => go('read'));
  dialog.querySelector('[data-pc-desk]')?.addEventListener('click', () => go('desk'));
  dialog.querySelectorAll('[data-pc-leave]').forEach((b) => b.addEventListener('click', leave));
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (state === 'moving') pending = view === 'read' ? 'desk' : 'leave';
    else back();
  });
  // Closed by the browser rather than by us (a second Escape can force it): leave the entry too.
  dialog.addEventListener('close', () => {
    if (state === 'closed' || dialog.open) return;
    if (state !== 'moving') close(true);
    if (wanted()) history.back();
  });
  addEventListener('popstate', () => reconcile());
  addEventListener('pageshow', (e) => {
    if (e.persisted) reconcile(true);
  });
  // The lab's entry doesn't survive a reload (see the top of this file).
  if (wanted()) history.replaceState(null, '');

  // A window that stops being able to hold the composition reads the page across it, under the controls.
  function relayout() {
    offer();
    const scene = getScene();
    if ((state !== 'desk' && state !== 'read') || !scene) return;
    full = !roomy.matches;
    html.toggleAttribute('data-pc-full', full);
    rect = layout(scene.screenAspect);
    size();
    if (full) {
      scene.quiet(true);
      if (frame) {
        frame.inert = false;
        frame.tabIndex = 0;
        frame.style.opacity = loaded ? '1' : '0';
      }
      return;
    }
    const q = scene.setRect(rect);
    if (state === 'read') flat();
    else onMonitor(q);
  }
  addEventListener('resize', relayout);
  roomy.addEventListener('change', relayout);
  new MutationObserver(offer).observe(root, { attributes: true, attributeFilter: ['data-failed'] });
  offer();

  // The page under the lab stays where it was, whatever tries to scroll it.
  addEventListener('scroll', () => {
    if (state !== 'closed' && (scrollX !== scroll[0] || scrollY !== scroll[1])) scrollTo(scroll[0], scroll[1]);
  });
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const msg = e.data as { type?: string; href?: string; title?: string };
    if (msg.type === 'pc:escape' && state !== 'closed') {
      if (state === 'moving') pending = 'desk';
      else back();
    }
    if (msg.type === 'pc:page' && typeof msg.href === 'string' && msg.href.startsWith('/')) {
      ordinary.href = msg.href;
      if (typeof msg.title === 'string') pageTitle = msg.title;
      if (state === 'read') titles();
    }
  });
}
