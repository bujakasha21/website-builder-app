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
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bd, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-6, 10, 4);
    scene.add(sun);

    const meshes: THREE.Mesh[] = [];
    const where = new Map<string, { building: string; level: number }>();
    const tags: { sprite: THREE.Sprite; building: string; y: number; top: number }[] = [];
    // one soft edge colour for the whole model; every volume owns its line material so filtered-out units can fade with their edges
    const EDGE = 0x8d877d;
    const unitTags = new Map<string, THREE.Sprite>();
    const many = buildingsOf(project).length > 1;
    const box = new THREE.Box3();
    let offsetX = 0;

    for (const b of buildingsOf(project)) {
      const floors = floorsOf(project, b);
      let width = 0;
      const group = new THREE.Group();
      const mine: THREE.Mesh[] = [];
      const labelled = new Set<string>();
      floors.forEach((floor, level) => {
        const plan = planFor(project, b, floor);
        if (!plan) return;
        const mx = plan.metersPerUnit, my = plan.metersPerUnit * (plan.height / plan.width);
        const units = unitsOnFloor(project, b, floor);
        let slot = 0;
        groupsOf(plan).forEach((g, gi) => {
          const unit: Unit | undefined = g.common ? undefined : units[slot++];
          const polys = g.outline ? [g.outline] : plan.rooms.filter((r) => groupOf(plan, r.group) === gi).map((r) => r.polygon);
          for (const poly of polys) {
            if (poly.length < 3) continue;
            const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x * mx, y * my)));
            const geo = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_H - 0.03, bevelEnabled: false }); // a hairline gap: floors read as one line, not two
            geo.rotateX(Math.PI / 2); // extrusion now points down
            geo.translate(0, level * FLOOR_H + FLOOR_H - 0.03, 0);
            const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
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
      });
      if (!group.children.length) continue;
      const bb = new THREE.Box3().setFromObject(group);
      group.position.x = offsetX - bb.min.x;
      group.position.z = -bb.min.z;
      scene.add(group);
      const size = bb.getSize(new THREE.Vector3());
      // the building letter only helps when there is more than one building; it floats clear of the apartment numbers
      if (many) {
        const label = tag(b, true);
        label.userData.k = 1.25;
        label.position.set(offsetX + size.x / 2, bb.max.y + FLOOR_H * 1.5, size.z / 2);
        scene.add(label);
        tags.push({ sprite: label, building: b, y: label.position.y, top: floors.length - 1 });
      }
      offsetX += size.x + Math.max(6, size.x * 0.3);
    }
    box.setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // soft contact shadow so the building sits on something instead of floating
    {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
      grad.addColorStop(0, "rgba(40,36,30,0.26)"); grad.addColorStop(0.6, "rgba(40,36,30,0.10)"); grad.addColorStop(1, "rgba(40,36,30,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.7, size.z * 1.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(center.x, box.min.y - 0.05, center.z);
      scene.add(shadow);
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
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, top]) for (const z of [box.min.z, box.max.z]) {
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

    const white = new THREE.Color(0xffffff), off = new THREE.Color(0xd9d5ce), dim = new THREE.Color(0xeeebe5), hi = new THREE.Color(accent), common = new THREE.Color(0xe6e2db);
    const paint = (h: string | null, s: string | null, a?: Set<string>) => {
      for (const m of meshes) {
        const { unitId, status, common: isCommon } = m.userData;
        const c = (m.material as THREE.MeshLambertMaterial).color;
        if (isCommon) c.copy(common);
        else if (unitId === s) c.copy(hi);
        else if (unitId === h) c.copy(white).lerp(hi, 0.55);
        else if (a && !a.has(unitId)) c.copy(dim);
        else if (status !== "available") c.copy(off);
        else c.copy(white).lerp(hi, 0.14);
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
