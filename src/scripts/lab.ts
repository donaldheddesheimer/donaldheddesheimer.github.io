// The lab: "Enter the lab" (or a click on the desk's monitor) flies the opening's camera to the
// monitor, and the systems map (/systems/screen/, real HTML in a frame) rides on its screen until it
// faces the viewer, large and flat. The address becomes /systems/ while the lab is open, so Back
// leaves it, Forward returns, and a reload or a shared link opens the ordinary page. Phones, short
// windows, reduced motion, and a scene that isn't running skip all of this: the link opens /systems/.
import type { Quad, Rect, RobotScene } from './robot-scene';

type State = 'closed' | 'opening' | 'open' | 'closing';

const FADE_MS = 250; // the opening's text fades before the camera moves
const roomy = matchMedia('(width >= 64rem) and (height >= 36rem)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const html = document.documentElement;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The CSS transform that lays a w x h box onto a quad (corners clockwise from top left): the
// projective map of the unit square onto the quad (Heckbert), after scaling the box to that square.
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

export function initLab(root: HTMLElement, dialog: HTMLDialogElement, getScene: () => RobotScene | null) {
  const bar = dialog.querySelector<HTMLElement>('[data-lab-bar]')!;
  const expand = dialog.querySelector<HTMLAnchorElement>('[data-lab-expand]')!;
  const enter = root.querySelector<HTMLAnchorElement>('[data-lab-enter]');
  const title = dialog.dataset.title ?? document.title;
  let state: State = 'closed';
  let frame: HTMLIFrameElement | null = null;
  let loaded = false;
  let rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let homeTitle = document.title;
  let opener: HTMLElement | null = null;
  let scroll: [number, number] = [0, 0];

  const motionOK = () => !reduce.matches && html.dataset.motion !== 'off';
  const canFly = () => !!getScene() && root.dataset.drawn != null && root.dataset.failed == null && motionOK() && roomy.matches;
  const wanted = () => history.state?.lab === true;

  // Where the screen lands: left of centre, as large as the window allows with a margin on the right
  // for the robots, under the toolbar.
  function layout(aspect: number): Rect {
    const vw = html.clientWidth;
    const vh = html.clientHeight;
    const top = Math.round(bar.getBoundingClientRect().height) || 56;
    const x = Math.max(24, Math.round(vw * 0.025));
    const right = Math.min(520, Math.max(200, vw * 0.26));
    const w = Math.round(Math.min(vw - x - right, (vh - top - 48) * aspect));
    const h = Math.round(w / aspect);
    return { x, y: top + Math.round((vh - top - h) / 2), w, h };
  }

  const size = () => {
    if (!frame) return;
    frame.style.width = `${rect.w}px`;
    frame.style.height = `${rect.h}px`;
  };
  // The screen at rest: whole pixels, so the text is sharp.
  const rest = () => {
    if (!frame) return;
    frame.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    frame.style.opacity = loaded ? '1' : '0';
  };
  const onFrame = (fadeIn: boolean) => (q: Quad, p: number) => {
    if (!frame) return;
    frame.style.transform = warp(q, rect.w, rect.h);
    // Over the monitor's own (drawn) screen, the page fades in mid-flight and out early on the way back.
    frame.style.opacity = loaded ? String(fadeIn ? smooth(0.3, 0.7, p) : 1 - smooth(0.05, 0.3, p)) : '0';
  };

  // A window too small for the monitor's framing shows the map across it, and the scene rests.
  function relayout() {
    const scene = getScene();
    if (state !== 'open' || !scene) return;
    const full = !roomy.matches;
    html.toggleAttribute('data-lab-full', full);
    scene.hold(full);
    if (full) return;
    rect = layout(scene.screenAspect);
    size();
    rest();
    scene.setRect(rect);
  }

  async function open() {
    const scene = getScene();
    if (state !== 'closed' || !scene) return;
    state = 'opening';
    opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    scroll = [scrollX, scrollY];
    homeTitle = document.title;
    document.title = title;
    loaded = false;
    frame = document.createElement('iframe');
    frame.className = 'lab-frame';
    frame.title = 'Systems map';
    frame.src = `/systems/screen/${location.search}`;
    expand.href = `/systems/${location.search}`;
    frame.addEventListener('load', () => {
      loaded = true;
      if (state === 'open') rest();
    });
    dialog.append(frame);
    dialog.showModal();
    // The dialog itself takes focus (it's named Systems map); its controls appear when the camera lands.
    dialog.focus();
    html.dataset.lab = 'fade';
    await new Promise((r) => setTimeout(r, FADE_MS));
    rect = layout(scene.screenAspect);
    size();
    html.dataset.lab = 'fly';
    await scene.fly('lab', rect, onFrame(true));
    html.dataset.lab = 'open';
    state = 'open';
    rest();
    relayout();
    reconcile();
  }

  async function close(instant = false) {
    const scene = getScene();
    if (state !== 'open') return;
    state = 'closing';
    html.removeAttribute('data-lab-full');
    scene?.hold(false);
    if (scene && !instant && canFly()) {
      html.dataset.lab = 'return';
      await scene.fly('hero', null, onFrame(false));
    }
    frame?.remove();
    frame = null;
    delete html.dataset.lab;
    scene?.settle();
    dialog.close();
    document.title = homeTitle;
    state = 'closed';
    (opener?.isConnected ? opener : enter)?.focus({ preventScroll: true });
    reconcile();
  }

  // The lab follows the history entry: open on ours, closed on any other. Runs again when a flight
  // lands, so Back or Forward pressed mid-flight still counts.
  function reconcile(instant = false) {
    if (wanted() && state === 'closed') {
      // Forward into the lab where it can't fly: load the page its address names.
      if (canFly()) open();
      else location.reload();
    } else if (!wanted() && state === 'open') close(instant);
  }

  // Enter: from the link or the monitor, the lab gets a history entry of its own.
  function go(e: MouseEvent) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canFly() || state !== 'closed') return false;
    e.preventDefault();
    history.pushState({ lab: true }, '', '/systems/');
    open();
    return true;
  }
  // Leave: back to the entry the lab was opened from.
  const leave = () => {
    if (wanted()) history.back();
    else close();
  };

  enter?.addEventListener('click', go);
  root.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button') || state !== 'closed' || !getScene()?.pick(e.clientX, e.clientY)) return;
    if (go(e)) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) window.open('/systems/', '_blank', 'noopener');
    else location.href = '/systems/';
  });
  root.addEventListener('pointermove', (e) => {
    const scene = getScene();
    if (e.pointerType !== 'mouse' || state !== 'closed' || !scene) return;
    root.style.cursor = scene.pick(e.clientX, e.clientY) ? 'pointer' : '';
  });
  root.addEventListener('pointerleave', () => {
    getScene()?.pick(-1, -1);
    root.style.cursor = '';
  });
  dialog.querySelector('[data-lab-back]')?.addEventListener('click', leave);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (state === 'open') leave();
  });
  // Closed by the browser rather than by us (a second Escape can force it): leave the address too.
  // The event arrives a task after the close, so ours can land after Forward has reopened the lab.
  dialog.addEventListener('close', () => {
    if (state === 'closed' || dialog.open) return;
    if (state === 'open') close(true);
    if (wanted()) history.back();
  });
  addEventListener('popstate', () => reconcile());
  addEventListener('pageshow', (e) => {
    if (e.persisted) reconcile(true);
  });
  addEventListener('resize', relayout);
  // The page under the lab stays where it was, whatever tries to scroll it.
  addEventListener('scroll', () => {
    if (state !== 'closed' && (scrollX !== scroll[0] || scrollY !== scroll[1])) scrollTo(scroll[0], scroll[1]);
  });
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const msg = e.data as { type?: string; search?: string };
    if (msg.type === 'lab:escape' && state === 'open') leave();
    if (msg.type === 'lab:sel' && typeof msg.search === 'string' && wanted()) {
      const sel = new URLSearchParams(msg.search).get('sel');
      const href = `/systems/${sel ? `?sel=${encodeURIComponent(sel)}` : ''}`;
      history.replaceState(history.state, '', href);
      expand.href = href;
    }
  });
}
