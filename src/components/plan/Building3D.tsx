"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildingsOf, floorsOf, groupOf, groupsOf, planFor, unitsOnFloor } from "@/lib/building";
import type { Project, Unit } from "@/lib/types";

interface Props {
  project: Pick<Project, "units" | "floorPlans">;
  accent?: string;
  /** units that pass the current filter; others are greyed out */
  active?: Set<string>;
  hover?: string | null;
  selected?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}

const FLOOR_H = 3;

/** a label that always faces the viewer: unit numbers on a light pill, the building letter on a dark one */
function tag(text: string, dark = false) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 112;
  const g = c.getContext("2d")!;
  g.font = "600 54px system-ui, sans-serif";
  const w = Math.min(244, g.measureText(text).width + 56);
  g.fillStyle = dark ? "rgba(28,27,25,0.92)" : "rgba(255,255,255,0.94)";
  g.beginPath(); g.roundRect((256 - w) / 2, 12, w, 88, 44); g.fill();
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = dark ? "#ffffff" : "#1c1b19";
  g.fillText(text, 128, 59);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  return s;
}

/** a building letter painted flat on the roof, like on an architect's site plan */
function roofLetter(text: string, size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.font = "800 170px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#2b2a27";
  g.fillText(text, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI / 4; // reads from the default corner view
  return m;
}

type P2 = [number, number];
const inside = (poly: P2[], x: number, z: number) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};

/** a small low-poly tree for the site around the buildings */
function tree(scale: number) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.2 * scale, 1.8 * scale, 6), new THREE.MeshLambertMaterial({ color: 0x7b6a55 }));
  trunk.position.y = 0.9 * scale;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45 * scale, 0), new THREE.MeshLambertMaterial({ color: 0x8fae78, flatShading: true }));
  crown.position.y = 2.7 * scale;
  crown.scale.y = 1.15;
  for (const m of [trunk, crown]) { m.castShadow = true; t.add(m); }
  return t;
}

/** isometric model of the whole building, stacked from the floor plans; every apartment is one clickable volume */
export default function Building3D({ project, accent = "#1F5C4A", active, hover, selected, onHover, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ paint: (h: string | null, s: string | null, a?: Set<string>) => void } | null>(null);
  const cb = useRef({ onHover, onSelect });
  cb.current = { onHover, onSelect };
  const state = useRef({ hover, selected, active });
  state.current = { hover, selected, active };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const scene = new THREE.Scene();
    // the browser can refuse a 3D context (too many open, graphics driver reset); the page must survive that
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { el.dataset.no3d = "1"; el.textContent = "The 3D view could not start in this browser tab. Reload the page to try again."; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bd, 2.1));
    const sun = new THREE.DirectionalLight(0xfffaf0, 1.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);
    // facade details shared by every building: dark glass, light slab edges, the dark roof parapet
    const GLASS = new THREE.MeshLambertMaterial({ color: 0x41474b });
    const SLAB = new THREE.MeshLambertMaterial({ color: 0xf3f0e9 });
    const PARAPET = new THREE.MeshLambertMaterial({ color: 0x2f2e2b });

    const meshes: THREE.Mesh[] = [];
    const where = new Map<string, { building: string; level: number }>();
    const tags: { sprite: THREE.Object3D; building: string; y: number; top: number }[] = [];
    // one soft edge colour for the whole model; every volume owns its line material so filtered-out units can fade with their edges
    const EDGE = 0x8d877d;
    const unitTags = new Map<string, THREE.Sprite>();
    const many = buildingsOf(project).length > 1;
    const box = new THREE.Box3();
    let offsetX = 0;
    let index = 0;

    for (const b of buildingsOf(project)) {
      const floors = floorsOf(project, b);
      let width = 0;
      const group = new THREE.Group();
      group.userData.building = b;
      const mine: THREE.Mesh[] = [];
      const labelled = new Set<string>();
      floors.forEach((floor, level) => {
        const plan = planFor(project, b, floor);
        if (!plan) return;
        const mx = plan.metersPerUnit, my = plan.metersPerUnit * (plan.height / plan.width);
        const units = unitsOnFloor(project, b, floor);
        let slot = 0;
        const onFloor: { poly: P2[]; mesh: THREE.Mesh }[] = [];
        groupsOf(plan).forEach((g, gi) => {
          const unit: Unit | undefined = g.common ? undefined : units[slot++];
          const polys = g.outline ? [g.outline] : plan.rooms.filter((r) => groupOf(plan, r.group) === gi).map((r) => r.polygon);
          for (const poly of polys) {
            if (poly.length < 3) continue;
            const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x * mx, y * my)));
            const geo = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_H - 0.03, bevelEnabled: false }); // a hairline gap: floors read as one line, not two
            geo.rotateX(Math.PI / 2); // extrusion now points down
            geo.translate(0, level * FLOOR_H + FLOOR_H - 0.03, 0);
            // [caps, walls]: the roof reads a touch darker than the facade
            const mesh = new THREE.Mesh(geo, [new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }), new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })]);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            onFloor.push({ poly: poly.map(([x, y]) => [x * mx, y * my] as P2), mesh });
            mesh.userData = { unitId: unit?.id ?? null, status: unit?.status ?? null, common: !!g.common || !unit, level, building: b };
            if (unit) where.set(unit.id, { building: b, level });
            group.add(mesh);
            meshes.push(mesh);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: EDGE, transparent: true })); // edges travel with the volume
            mesh.add(edges);
            mesh.userData.edges = edges;
            mine.push(mesh);
            // the top floor carries the apartment numbers, so the model reads without hovering
            if (unit && level === floors.length - 1 && !labelled.has(unit.id)) {
              labelled.add(unit.id);
              const cx = poly.reduce((t, q) => t + q[0], 0) / poly.length, cy = poly.reduce((t, q) => t + q[1], 0) / poly.length;
              const t = tag(unit.ref);
              t.userData.k = 1;
              t.position.set(cx * mx, level * FLOOR_H + FLOOR_H + 0.7, cy * my);
              mesh.add(t);
              unitTags.set(unit.id, t);
            }
            for (const [x] of poly) width = Math.max(width, x * mx);
          }
        });
        // facade: an edge is outside when a point just beyond it lies in no apartment of this floor
        const top = level === floors.length - 1;
        const y0 = level * FLOOR_H, y1 = y0 + FLOOR_H - 0.03;
        for (const { poly, mesh } of onFloor) {
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i], q = poly[(i + 1) % poly.length];
            const dx = q[0] - a[0], dz = q[1] - a[1], len = Math.hypot(dx, dz);
            if (len < 0.9) continue;
            const ux = dx / len, uz = dz / len;
            const mid: P2 = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2];
            let nx = -uz, nz = ux;
            if (inside(poly, mid[0] + nx * 0.2, mid[1] + nz * 0.2)) { nx = -nx; nz = -nz; }
            if (onFloor.some((o) => inside(o.poly, mid[0] + nx * 0.25, mid[1] + nz * 0.25))) continue;
            const turn = Math.atan2(nx, nz);
            // windows, one about every 2.6 m, set into the wall
            const k = Math.max(len >= 1.6 ? 1 : 0, Math.floor(len / 2.6));
            const ww = Math.min(1.4, (len / Math.max(1, k)) * 0.55);
            for (let w = 0; w < k; w++) {
              const t = (w + 0.5) / k;
              const win = new THREE.Mesh(new THREE.PlaneGeometry(ww, level === 0 ? 2.0 : 1.55), GLASS);
              win.position.set(a[0] + dx * t + nx * 0.02, level === 0 ? y0 + 1.15 : y0 + 1.45, a[1] + dz * t + nz * 0.02);
              win.rotation.y = turn;
              mesh.add(win);
            }
            // a light slab edge at every floor and a dark parapet on the roof
            const slab = new THREE.Mesh(new THREE.BoxGeometry(len + 0.12, 0.2, 0.14), SLAB);
            slab.position.set(mid[0] + nx * 0.05, y1 - 0.1, mid[1] + nz * 0.05);
            slab.rotation.y = turn; // the box's length runs along the wall
            slab.castShadow = true;
            mesh.add(slab);
            if (top) {
              const par = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.5, 0.24), PARAPET);
              par.position.set(mid[0] - nx * 0.08, y1 + 0.25, mid[1] - nz * 0.08);
              par.rotation.y = turn;
              par.castShadow = true;
              mesh.add(par);
            }
          }
        }
      });
      if (!group.children.length) continue;
      const bb = new THREE.Box3().setFromObject(group);
      // every second building steps back a little, so the site reads like a real development and not a row
      const stagger = index++ % 2 ? -bb.getSize(new THREE.Vector3()).z * 0.35 : 0;
      group.position.x = offsetX - bb.min.x;
      group.position.z = -bb.min.z + stagger;
      scene.add(group);
      const size = bb.getSize(new THREE.Vector3());
      // the building letter only helps when there is more than one building; painted on the roof like on a site plan
      if (many) {
        const label = roofLetter(b, Math.min(size.x, size.z) * 0.42);
        label.position.set(offsetX + size.x / 2, floors.length * FLOOR_H + 0.01, stagger + size.z / 2); // on the roof, inside the parapet
        label.renderOrder = 5;
        scene.add(label);
        tags.push({ sprite: label, building: b, y: label.position.y, top: floors.length - 1 });
      }
      offsetX += size.x + Math.max(7, size.x * 0.45);
    }
    box.setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // the site around the buildings, like on an architect's model: a plinth, a street along two sides, lawn and trees
    const M = Math.max(3.5, Math.max(size.x, size.z) * 0.08);
    const road = 3.6, walk = 1.1, band = road + walk;
    const site = { x0: box.min.x - M - band, x1: box.max.x + M, z0: box.min.z - M, z1: box.max.z + M + band };
    {
      const W = site.x1 - site.x0, D = site.z1 - site.z0, r = Math.min(W, D) * 0.06;
      const sh = new THREE.Shape();
      sh.moveTo(site.x0 + r, site.z0); sh.lineTo(site.x1 - r, site.z0); sh.quadraticCurveTo(site.x1, site.z0, site.x1, site.z0 + r);
      sh.lineTo(site.x1, site.z1 - r); sh.quadraticCurveTo(site.x1, site.z1, site.x1 - r, site.z1); sh.lineTo(site.x0 + r, site.z1);
      sh.quadraticCurveTo(site.x0, site.z1, site.x0, site.z1 - r); sh.lineTo(site.x0, site.z0 + r); sh.quadraticCurveTo(site.x0, site.z0, site.x0 + r, site.z0);
      const plinthGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false });
      plinthGeo.rotateX(Math.PI / 2);
      const plinth = new THREE.Mesh(plinthGeo, [new THREE.MeshLambertMaterial({ color: 0xeeebe4 }), new THREE.MeshLambertMaterial({ color: 0xd8d3c9 })]);
      plinth.position.y = box.min.y - 0.02;
      plinth.receiveShadow = true;
      scene.add(plinth);
      const flat = (x0: number, x1: number, z0: number, z1: number, color: number, y: number) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color }));
        m.rotation.x = -Math.PI / 2;
        m.position.set((x0 + x1) / 2, box.min.y + y, (z0 + z1) / 2);
        m.receiveShadow = true;
        scene.add(m);
      };
      // an L of street: along the front and along the left side, each with a pale pavement on the site side
      flat(site.x0 + r * 0.3, site.x1 - r * 0.3, site.z1 - band, site.z1 - walk * 0.15, 0xd9d5cc, 0.006);
      flat(site.x0 + r * 0.3, site.x1 - r * 0.3, site.z1 - road - walk * 0.15, site.z1 - walk * 0.15, 0x8c8e86, 0.012);
      flat(site.x0 + walk * 0.15, site.x0 + band, site.z0 + r * 0.3, site.z1 - band, 0xd9d5cc, 0.006);
      flat(site.x0 + walk * 0.15, site.x0 + walk * 0.15 + road, site.z0 + r * 0.3, site.z1 - walk * 0.15, 0x8c8e86, 0.012);
      // lawn around the buildings
      flat(box.min.x - M * 0.7, box.max.x + M * 0.7, box.min.z - M * 0.7, box.max.z + M * 0.7, 0xc8d6b3, 0.003);
      // trees: a row along the street and a few in the green, kept clear of the buildings
      const blocked = (x: number, z: number) => scene.children.some((o) => o instanceof THREE.Group && o.userData.building !== undefined && new THREE.Box3().setFromObject(o).expandByScalar(1.4).containsPoint(new THREE.Vector3(x, box.min.y + 1, z)));
      const spots: P2[] = [];
      for (let x = box.min.x + 1.5; x <= box.max.x + 0.5; x += 6.5) spots.push([x, box.max.z + M * 0.6]);
      for (let z = box.min.z + 2; z <= box.max.z - 2; z += 7) spots.push([box.min.x - M * 0.6, z]);
      spots.push([box.max.x + M * 0.5, box.min.z + 1.5], [center.x, center.z], [center.x, box.min.z + 2]);
      spots.forEach(([x, z], i) => {
        if (blocked(x, z)) return;
        const t = tree(0.7 + ((i * 37) % 10) / 30);
        t.position.set(x, box.min.y, z);
        scene.add(t);
      });
    }
    sun.position.set(center.x - size.x * 0.5, center.y + Math.max(size.x, size.z) * 1.1, center.z + size.z * 0.9);
    sun.target.position.copy(center);
    {
      const r = Math.max(site.x1 - site.x0, site.z1 - site.z0);
      const cam = sun.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5; cam.far = r * 4;
      cam.updateProjectionMatrix();
    }
    const span = Math.max(size.x, size.y, size.z, 6);
    // labels keep one readable size relative to the model
    const unitW = span * 0.105;
    scene.traverse((o) => { if ((o as THREE.Sprite).isSprite && o.userData.k) o.scale.set(unitW * o.userData.k, unitW * o.userData.k * (112 / 256), 1); });

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, span * 20);
    camera.position.set(center.x + span * 1.4, center.y + span * 1.15, center.z + span * 1.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center).setY(center.y + FLOOR_H * 0.6); // leave headroom for the rising floors
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    // how much the model needs on screen from this angle (with room for a lifted floor and the labels), so it is never cut off
    const need = { w: 1, h: 1 };
    {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), q = new THREE.Vector3();
      const top = box.max.y + FLOOR_H * 2.6;
      for (const x of [site.x0, site.x1]) for (const y of [box.min.y - 0.6, top]) for (const z of [site.z0, site.z1]) {
        q.set(x, y, z).sub(controls.target);
        need.w = Math.max(need.w, Math.abs(q.dot(right))); need.h = Math.max(need.h, Math.abs(q.dot(up)));
      }
    }
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    // zoom is limited so the building can neither vanish nor be flown into
    controls.minZoom = 0.75;
    controls.maxZoom = 2.2;
    controls.enablePan = false;

    const white = new THREE.Color(0xf1ece2), off = new THREE.Color(0xd8d1c4), dim = new THREE.Color(0xeae6de), hi = new THREE.Color(accent), common = new THREE.Color(0xe2dccf);
    const paint = (h: string | null, s: string | null, a?: Set<string>) => {
      for (const m of meshes) {
        const { unitId, status, common: isCommon } = m.userData;
        const [capMat, wallMat] = m.material as THREE.MeshLambertMaterial[];
        const c = wallMat.color;
        if (isCommon) c.copy(common);
        else if (unitId === s) c.copy(hi);
        else if (unitId === h) c.copy(white).lerp(hi, 0.55);
        else if (a && !a.has(unitId)) c.copy(dim);
        else if (status !== "available") c.copy(off);
        else c.copy(white).lerp(hi, 0.14);
        capMat.color.copy(c).multiplyScalar(0.95);
        const faded = !isCommon && !!a && !a.has(unitId) && unitId !== s && unitId !== h;
        const em = (m.userData.edges as THREE.LineSegments | undefined)?.material as THREE.LineBasicMaterial | undefined;
        if (em) em.opacity = faded ? 0.35 : 1;
        const t = unitTags.get(unitId);
        if (t && unitTags.get(unitId)?.parent === m) (t.material as THREE.SpriteMaterial).opacity = faded ? 0.3 : 1;
      }
    };
    api.current = { paint };
    paint(state.current.hover ?? null, state.current.selected ?? null, state.current.active);

    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, camera);
      return (ray.intersectObjects(meshes, false)[0]?.object.userData.unitId as string | null) ?? null;
    };
    let last: string | null = null, down = [0, 0];
    const onMove = (e: PointerEvent) => { const id = pick(e); if (id !== last) { last = id; renderer.domElement.style.cursor = id ? "pointer" : "grab"; cb.current.onHover?.(id); } };
    // leaving the model always clears the hover, even when the pointer jumps straight out of it
    const onLeave = () => { last = null; renderer.domElement.style.cursor = "grab"; cb.current.onHover?.(null); };
    const onAway = (e: PointerEvent) => { if (last && e.target !== renderer.domElement) onLeave(); };
    const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => { if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) { const id = pick(e); if (id) cb.current.onSelect?.(id); } };
    const dom = renderer.domElement;
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onLeave);
    el.ownerDocument.addEventListener("pointermove", onAway, { passive: true });

    const resize = () => {
      const w = el.clientWidth || 600, h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      dom.style.width = "100%";
      dom.style.height = "100%";
      const aspect = w / h, halfH = Math.max(need.h, need.w / aspect) * 1.06, halfW = halfH * aspect;
      camera.left = -halfW; camera.right = halfW;
      camera.top = halfH; camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const win = el.ownerDocument.defaultView ?? window;
    let raf = 0;
    // like on our tower sites: the floors above the hovered apartment rise and reveal its floor
    const LIFT = FLOOR_H * 1.7;
    const loop = () => {
      const { hover: h, selected: sel } = state.current;
      const at = where.get(h ?? sel ?? "");
      for (const m of meshes) {
        const up = at && m.userData.building === at.building && m.userData.level > at.level;
        const to = up ? LIFT : 0;
        m.position.y = Math.abs(to - m.position.y) < 0.004 ? to : m.position.y + (to - m.position.y) * 0.16; // settles exactly, no hairline gaps left behind
      }
      for (const t of tags) {
        const up = at && t.building === at.building && t.top > at.level;
        const to = t.y + (up ? LIFT : 0);
        t.sprite.position.y = Math.abs(to - t.sprite.position.y) < 0.004 ? to : t.sprite.position.y + (to - t.sprite.position.y) * 0.16;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = win.requestAnimationFrame(loop);
    };
    loop();

    return () => {
      win.cancelAnimationFrame(raf);
      ro.disconnect();
      el.ownerDocument.removeEventListener("pointermove", onAway);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      dom.remove();
      api.current = null;
    };
  }, [project.units, project.floorPlans, accent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { api.current?.paint(hover ?? null, selected ?? null, active); }, [hover, selected, active]);

  return <div ref={host} style={{ width: "100%", height: "100%", minHeight: 320 }} aria-label="Building model" />;
}
