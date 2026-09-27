# TEST-ONLY instrumentation for probe-build.sh; patches a copy of robot-scene.ts, never the repository.
#   ?desk=x,z,yaw[,scale]  overrides the workstation placement
#   window.__bounds()      projected boxes of the desk, each robot's body (not its soft floor shadows) and the canvas (CSS px)
#   window.__reach(D)      per robot, the body vertex furthest right of the monitor as seen from D m in front of it: [X, Z, X/(Z+D)]
#   window.__at(t)         sets the dance clock (beat and camera drift) and draws that moment
import re, sys
p = sys.argv[1]
s = open(p).read()
# TEST-ONLY: desk override from ?desk=x,z,yaw and a bounds probe. Never part of the real source.
s = re.sub(r"const DESK = \{[^}]*\};", lambda m: "const DESK = (() => { const q = new URLSearchParams(location.search).get('desk'); if (q) { const [x, z, yaw, s = 1] = q.split(',').map(Number); return { x, z, yaw, scale: s }; } return " + m.group(0)[len('const DESK = '):-1] + "; })();", s, count=1)
probe = '''
  // TEST-ONLY PROBE
  (window as any).__bounds = () => {
    camera.updateMatrixWorld();
    const cr = canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const box = (obj: THREE.Object3D) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.material.transparent) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
          const x = cr.left + ((v.x + 1) / 2) * cr.width, y = cr.top + ((1 - v.y) / 2) * cr.height;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      });
      return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
    };
    return { desk: box(desk.group), robots: robots.map((r) => box(r.root)), canvas: [cr.left, cr.top, cr.right, cr.bottom].map(Math.round) };
  };
  // TEST-ONLY: X right of the screen's centre and Z behind its plane, in metres.
  (window as any).__reach = (D: number) => {
    const v = new THREE.Vector3();
    const right = new THREE.Vector3(screenNormal.z, 0, -screenNormal.x);
    return robots.map((r) => {
      let best = [0, 0, -1e9];
      r.root.updateMatrixWorld(true);
      r.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.material.transparent) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(screenCentre);
          const X = v.dot(right), Z = -v.dot(screenNormal), q = X / (Z + D);
          if (q > best[2]) best = [X, Z, q];
        }
      });
      return best.map((n) => Math.round(n * 1000) / 1000);
    });
  };
'''
probe += '''
  // TEST-ONLY: set the dance clock (beat and camera drift) and draw that moment.
  (window as any).__at = (v: number) => { t = v; render(); };
'''
s = s.replace("  const raycaster = new THREE.Raycaster();", probe + "  const raycaster = new THREE.Raycaster();", 1)
assert '__bounds' in s and '__at' in s and "get('desk')" in s, 'probe hooks not applied: robot-scene.ts changed shape'
open(p, 'w').write(s)
