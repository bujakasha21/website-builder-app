"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clampToRoom, furnish, kindOf, piecesOf, sizeOf, type Piece } from "@/lib/floorplan/furnish";
import { instance, loadModel, modelPlan } from "./models";
import type { FloorPlan } from "@/lib/types";
import { planBounds } from "./Plan2D";

interface Props {
  plan: FloorPlan;
  onlyConfirmed?: boolean;
  accent?: string;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  furniture?: boolean;
  /** offer the first-person walk-through */
  walkable?: boolean;
  /** makes furniture selectable and draggable; receives the new arrangement per room */
  onFurniture?: (next: Record<string, Piece[]>) => void;
  piece?: string | null;
  onPiece?: (id: string | null) => void;
  /** lets the owner take pictures while standing in the flat; receives the view and where it was taken */
  onCapture?: (shot: { image: string; x: number; z: number; yaw: number; roomId: string | null }) => void;
}

const WALL_H = 2.5, DOOR_H = 2.05, SILL = 0.9, HEAD = 2.1, EYE = 1.6;
/** the view survives a rebuild of the scene (e.g. after moving a piece of furniture) */
const views = new Map<string, { pos: THREE.Vector3; target: THREE.Vector3 }>();

function labelSprite(name: string, area: string) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 160;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.fillStyle = "#1c1b19";
  g.font = "500 44px system-ui, sans-serif";
  g.fillText(name, 256, 62);
  g.fillStyle = "#5c5852";
  g.font = "400 36px system-ui, sans-serif";
  g.fillText(area, 256, 114);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set(2.4, 0.75, 1);
  s.renderOrder = 5;
  return s;
}

// ── small procedural textures, drawn once per scene (nothing is downloaded) ──
/** deterministic noise so a plan always looks the same */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function texture(size: number, metres: number, draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres);
  t.anisotropy = 8;
  return t;
}
/** oak parquet: 12 cm planks, staggered joints, light grain */
const parquet = () => texture(512, 2.4, (g, n) => {
  const r = rng(7), rows = 20, h = n / rows;
  for (let k = 0; k < rows; k++) {
    let x = -r() * n * 0.5;
    while (x < n) {
      const len = n * (0.38 + r() * 0.24), t = r();
      g.fillStyle = `rgb(${196 + t * 22 | 0}, ${160 + t * 20 | 0}, ${112 + t * 18 | 0})`;
      g.fillRect(x, k * h, len, h);
      g.fillStyle = "rgba(90, 62, 30, 0.07)";
      for (let i = 0; i < 5; i++) g.fillRect(x, k * h + r() * h, len, 1);
      g.fillStyle = "rgba(60, 40, 20, 0.28)";
      g.fillRect(x + len - 1, k * h, 1, h);
      x += len;
    }
    g.fillStyle = "rgba(60, 40, 20, 0.2)";
    g.fillRect(0, k * h, n, 1);
  }
});
/** 60 cm porcelain tiles with narrow grout */
const tiles = () => texture(512, 1.2, (g, n) => {
  const r = rng(11);
  g.fillStyle = "#b9b5ad"; g.fillRect(0, 0, n, n);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const t = r();
    g.fillStyle = `rgb(${222 + t * 8 | 0}, ${220 + t * 8 | 0}, ${214 + t * 8 | 0})`;
    g.fillRect(a * n / 2 + 2, b * n / 2 + 2, n / 2 - 4, n / 2 - 4);
  }
  g.fillStyle = "rgba(120, 116, 108, 0.05)";
  for (let i = 0; i < 900; i++) g.fillRect(r() * n, r() * n, 2, 2);
});
const wood = () => texture(256, 1, (g, n) => {
  const r = rng(3);
  g.fillStyle = "#c9b594"; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${90 + r() * 40 | 0}, 66, 36, ${0.04 + r() * 0.07})`; g.fillRect(0, r() * n, n, 1 + r() * 2); }
});
const fabric = () => texture(128, 0.25, (g, n) => {
  const r = rng(5);
  g.fillStyle = "#b9b3a8"; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 1600; i++) { g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(40,36,30,0.10)"; g.fillRect(r() * n | 0, r() * n | 0, 1, 1); }
});

export default function Plan3D({ plan: planProp, onlyConfirmed = false, accent = "#1F5C4A", selected, onSelect, furniture = true, walkable = true, onFurniture, piece, onPiece, onCapture }: Props) {
  // the scene is only rebuilt when something it shows changes (rooms, walls, furniture), not when e.g. a picture is saved
  const sig = JSON.stringify([planProp.id, planProp.metersPerUnit, planProp.walls.length, planProp.rooms.map((r) => [r.id, r.name, r.areaM2, r.confirmed, r.polygon]), planProp.furniture ?? null]);
  const plan = useMemo(() => planProp, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const sel = useRef<{ set: (id: string | null) => void; piece: (id: string | null) => void } | null>(null);
  const walk = useRef<{ enter: (roomId: string) => void; exit: () => void; key: (k: string, down: boolean) => void; pose: () => { x: number; z: number; yaw: number }; room: () => string | null; shot: () => string; place: (x: number, z: number) => void; tour: () => Promise<{ image: string; x: number; z: number; yaw: number; roomId: string | null }[]> } | null>(null);
  const [walking, setWalking] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const setWalkingRef = useRef(setWalking);
  setWalkingRef.current = setWalking;
  const cb = useRef({ onSelect, onFurniture, onPiece });
  cb.current = { onSelect, onFurniture, onPiece };
  const editable = !!onFurniture;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const b = planBounds(plan);
    const mx = plan.metersPerUnit;
    const my = plan.metersPerUnit * (plan.height / plan.width);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const X = (x: number) => (x - cx) * mx, Z = (y: number) => (y - cy) * my;
    const sizeX = (b.x1 - b.x0) * mx, sizeZ = (b.y1 - b.y0) * my;
    const span = Math.max(sizeX, sizeZ, 4);

    // the browser can refuse a 3D context (too many open, graphics driver reset); the page must survive that
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { el.dataset.no3d = "1"; el.textContent = "The 3D view could not start in this browser tab. Reload the page to try again."; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    let alive = true; // models arrive later: nothing is added once this scene is gone
    // soft light from all sides, generated in the browser
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.42;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    camera.position.set(span * 0.75, span * 1.45, span * 1.35);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = span * 0.4;
    controls.maxDistance = span * 5;
    controls.target.set(0, 0.6, 0);
    const keep = views.get(plan.id);
    if (keep) { camera.position.copy(keep.pos); controls.target.copy(keep.target); }

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d2c6, 0.75);
    scene.add(hemi);
    // the sun stands on the side with the most window area, so daylight really comes through the windows
    const out = new THREE.Vector3();
    for (const [x, y, w, h, k] of plan.walls) if (k === 3) out.add(new THREE.Vector3(X(x + w / 2), 0, Z(y + h / 2)).multiplyScalar(Math.max(w * mx, h * my)));
    if (out.lengthSq() < 0.01) out.set(-0.6, 0, 0.5);
    out.normalize();
    const sun = new THREE.DirectionalLight(0xffeccf, 2.6);
    const sunAt = (height: number) => sun.position.set(out.x * span * 1.1 + out.z * span * 0.35, span * height, out.z * span * 1.1 - out.x * span * 0.35);
    sunAt(1.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.far = span * 5;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 5;
    scene.add(sun);

    // slab
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sizeX + 0.3, 0.2, sizeZ + 0.3), new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 1 }));
    slab.position.y = -0.11;
    slab.receiveShadow = true;
    scene.add(slab);

    // floors: parquet in living rooms and bedrooms, tiles in bath and kitchen
    const rooms = onlyConfirmed ? plan.rooms.filter((r) => r.confirmed) : plan.rooms;
    const texParquet = parquet(), texTiles = tiles(), texWood = wood(), texFabric = fabric();
    const floors: THREE.Mesh[] = [];
    const white = new THREE.Color(0xffffff), hi = new THREE.Color(accent);
    const fittings: THREE.Object3D[] = [];
    const roomLights: THREE.PointLight[] = [];
    const bySize = [...rooms].sort((p, q) => q.areaM2 - p.areaM2);
    for (const r of rooms) {
      const kind = kindOf(r.name, r.areaM2);
      const wet = kind === "bath" || kind === "wc" || kind === "kitchen";
      const shape = new THREE.Shape(r.polygon.map(([x, y]) => new THREE.Vector2(X(x), Z(y))));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: kind === "none" ? null : wet ? texTiles : texParquet, color: kind === "none" ? 0xd9d5cd : 0xffffff, roughness: wet ? 0.32 : 0.58, side: THREE.DoubleSide }));
      m.position.y = 0.005;
      m.receiveShadow = true;
      m.userData.id = r.id;
      scene.add(m);
      floors.push(m);
      let sx = 0, sz = 0;
      for (const [x, y] of r.polygon) { sx += X(x); sz += Z(y); }
      sx /= r.polygon.length; sz /= r.polygon.length;
      const s = labelSprite(r.name, `${r.areaM2.toFixed(1)} m²`);
      const k = Math.min(1, Math.max(0.45, span / 14));
      s.scale.multiplyScalar(k);
      s.position.set(sx, 0.5, sz);
      scene.add(s);
      // a simple ceiling light per room, only seen when walking through
      if (kind !== "none") {
        const fit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 1.6, roughness: 0.4 }));
        fit.position.set(sx, WALL_H - 0.03, sz);
        fit.visible = false;
        scene.add(fit);
        fittings.push(fit);
        if (bySize.indexOf(r) < 6) {
          const pl = new THREE.PointLight(0xffe9c9, 0, 8, 1.7);
          pl.position.set(sx, WALL_H - 0.35, sz);
          pl.userData.on = Math.max(0.9, Math.min(4.5, r.areaM2 * 0.13)); // a small room needs far less light than a living room
          scene.add(pl);
          roomLights.push(pl);
        }
      }
    }

    // real pendant lamps replace the plain discs once loaded
    loadModel("modern_ceiling_lamp_01").then((m) => {
      if (!alive) return;
      fittings.splice(0).forEach((disc) => {
        const lampModel = instance(m, { id: "modern_ceiling_lamp_01", x: 0, z: 0, fit: { h: 0.5 } });
        lampModel.position.set(disc.position.x, WALL_H - 0.5, disc.position.z);
        lampModel.visible = disc.visible;
        lampModel.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
        scene.add(lampModel);
        scene.remove(disc);
        fittings.push(lampModel);
      });
    }).catch(() => {});

    // walls, lintels, sills, skirting, window frames and glass from the detected rects
    type Kind = "wall" | "glass" | "trim";
    const boxes: { m: THREE.Matrix4; t: Kind }[] = [];
    const add = (x0: number, z0: number, wx: number, wz: number, y0: number, y1: number, t: Kind) => {
      const m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(x0 + wx / 2, (y0 + y1) / 2, z0 + wz / 2), new THREE.Quaternion(), new THREE.Vector3(wx, y1 - y0, wz));
      boxes.push({ m, t });
    };
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf1ece3, roughness: 0.45 });
    for (const [x, y, w, h, k] of plan.walls) {
      const x0 = X(x), z0 = Z(y), wx = w * mx, wz = h * my;
      const alongX = wx >= wz;
      if (k === 1) {
        add(x0, z0, wx, wz, 0, WALL_H, "wall");
        add(x0 - 0.012, z0 - 0.012, wx + 0.024, wz + 0.024, 0, 0.08, "trim"); // skirting board
      } else if (k === 2) {
        add(x0, z0, wx, wz, DOOR_H, WALL_H, "wall");
        // frame: two jambs and a head, a little proud of the wall
        const j = 0.05, o = 0.015;
        if (alongX) { add(x0, z0 - o, j, wz + o * 2, 0, DOOR_H, "trim"); add(x0 + wx - j, z0 - o, j, wz + o * 2, 0, DOOR_H, "trim"); add(x0, z0 - o, wx, wz + o * 2, DOOR_H - j, DOOR_H, "trim"); }
        else { add(x0 - o, z0, wx + o * 2, j, 0, DOOR_H, "trim"); add(x0 - o, z0 + wz - j, wx + o * 2, j, 0, DOOR_H, "trim"); add(x0 - o, z0, wx + o * 2, wz, DOOR_H - j, DOOR_H, "trim"); }
        // the leaf stands open so every room can be walked into
        const len = (alongX ? wx : wz) - j * 2;
        if (len > 0.5) {
          const hinge = new THREE.Group();
          hinge.position.set(alongX ? x0 + j : x0 + wx / 2, 0, alongX ? z0 + wz / 2 : z0 + j);
          hinge.rotation.y = (alongX ? 0 : -Math.PI / 2) - 1.36;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(len, DOOR_H - j - 0.02, 0.04), doorMat);
          leaf.position.set(len / 2, (DOOR_H - j) / 2, 0);
          leaf.castShadow = true; leaf.receiveShadow = true;
          hinge.add(leaf);
          scene.add(hinge);
        }
      } else {
        add(x0, z0, wx, wz, 0, SILL, "wall");
        add(x0, z0, wx, wz, HEAD, WALL_H, "wall");
        const t = Math.min(wx, wz) * 0.25, f = 0.05, o = 0.02;
        if (alongX) {
          add(x0, z0 + wz / 2 - t / 2, wx, t, SILL + f, HEAD - f, "glass");
          add(x0, z0 - o, wx, wz + o * 2, SILL, SILL + f, "trim"); add(x0, z0 + wz * 0.3, wx, wz * 0.4, HEAD - f, HEAD, "trim");
          add(x0, z0 + wz * 0.3, f, wz * 0.4, SILL, HEAD, "trim"); add(x0 + wx - f, z0 + wz * 0.3, f, wz * 0.4, SILL, HEAD, "trim");
          if (wx > 1.6) add(x0 + wx / 2 - f / 2, z0 + wz * 0.3, f, wz * 0.4, SILL, HEAD, "trim");
        } else {
          add(x0 + wx / 2 - t / 2, z0, t, wz, SILL + f, HEAD - f, "glass");
          add(x0 - o, z0, wx + o * 2, wz, SILL, SILL + f, "trim"); add(x0 + wx * 0.3, z0, wx * 0.4, wz, HEAD - f, HEAD, "trim");
          add(x0 + wx * 0.3, z0, wx * 0.4, f, SILL, HEAD, "trim"); add(x0 + wx * 0.3, z0 + wz - f, wx * 0.4, f, SILL, HEAD, "trim");
          if (wz > 1.6) add(x0 + wx * 0.3, z0 + wz / 2 - f / 2, wx * 0.4, f, SILL, HEAD, "trim");
        }
      }
    }
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const mk = (t: Kind, mat: THREE.Material) => {
      const list = boxes.filter((q) => q.t === t);
      if (!list.length) return;
      const im = new THREE.InstancedMesh(unitBox, mat, list.length);
      list.forEach((q, i) => im.setMatrixAt(i, q.m));
      im.castShadow = t !== "glass";
      im.receiveShadow = t !== "glass";
      scene.add(im);
    };
    mk("wall", new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.93 })); // matte paint
    mk("trim", new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.4 }));
    mk("glass", new THREE.MeshPhysicalMaterial({ color: 0xd4e6ec, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.4, depthWrite: false }));

    // selected piece: a thin outline box
    const ring = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), new THREE.Color(accent));
    ring.visible = false;
    scene.add(ring);
    let chosen: string | null = null;
    // furniture: one group per piece, materials by what the part is made of
    const groups = new Map<string, THREE.Group>();
    const pickable: THREE.Mesh[] = [];
    const hard: { x0: number; x1: number; z0: number; z1: number }[] = [];
    const placed = furniture ? furnish(plan, rooms).pieces : [];
    {
      const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
      const mats = new Map<string, THREE.Material>();
      const matFor = (color: string, glass?: boolean) => {
        const key = color + (glass ? "g" : "");
        let m = mats.get(key);
        if (m) return m;
        if (glass) m = new THREE.MeshPhysicalMaterial({ color: 0xdcebef, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
        else if (color === "#c8b596") m = new THREE.MeshStandardMaterial({ map: texWood, roughness: 0.55 });
        else if (color === "#b7b1a6" || color === "#ddd6ca") m = new THREE.MeshStandardMaterial({ map: texFabric, color: color === "#ddd6ca" ? 0xf0e9dd : 0xffffff, roughness: 1 });
        else if (color === "#f5f3ef") m = new THREE.MeshStandardMaterial({ color: 0xf7f5f1, roughness: 0.22 }); // ceramic, lacquer
        else if (color === "#b9bdbf") m = new THREE.MeshStandardMaterial({ color: 0xc4c8ca, roughness: 0.28, metalness: 0.85 });
        else if (color === "#3a3835") m = new THREE.MeshStandardMaterial({ color: 0x2f2d2b, roughness: 0.4 });
        else m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        mats.set(key, m);
        return m;
      };
      for (const pc of placed) {
        const g = new THREE.Group();
        const gx = pc.x - cx * mx, gz = pc.z - cy * my;
        g.position.set(gx, 0, gz);
        g.userData = { piece: pc.id, room: pc.roomId };
        const made: { mesh: THREE.Mesh; part: (typeof pc.parts)[number] }[] = [];
        for (const f of pc.parts) {
          const mesh = new THREE.Mesh(f.shape === "round" ? cyl : unitBox, matFor(f.color, f.glass));
          made.push({ mesh, part: f });
          mesh.scale.set(f.w, Math.max(0.01, f.h), f.d);
          mesh.position.set(f.x + f.w / 2 - cx * mx - gx, f.y0 + f.h / 2, f.z + f.d / 2 - cy * my - gz);
          mesh.castShadow = !f.flat && !f.glass;
          mesh.receiveShadow = true;
          mesh.userData.piece = pc.id;
          g.add(mesh);
          pickable.push(mesh);
          // anything a person would bump into
          if (!f.flat && f.y0 < 1.2 && f.y0 + f.h > 0.3) hard.push({ x0: f.x - cx * mx - 0.2, x1: f.x + f.w - cx * mx + 0.2, z0: f.z - cy * my - 0.2, z1: f.z + f.d - cy * my + 0.2 });
        }
        scene.add(g);
        groups.set(pc.id, g);
        // real models where we have them: they replace the generated shapes as soon as they are loaded
        const [pw, pd, ps] = sizeOf(pc);
        const mp = modelPlan(pc.type, ps, pw, pd);
        if (mp) {
          const rig = new THREE.Group();
          rig.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][pc.rot % 4];
          Promise.all(mp.slots.map((sl) => loadModel(sl.id).then((m) => ({ sl, m })))).then((list) => {
            if (!alive) return;
            for (const { sl, m } of list) {
              const h = instance(m, sl);
              h.position.set(sl.x - pw / 2, 0, sl.z - pd / 2);
              h.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.userData.piece = pc.id; pickable.push(o as THREE.Mesh); } });
              rig.add(h);
            }
            for (const { mesh, part } of made) if (!mp.keep?.(part)) { mesh.visible = false; const k = pickable.indexOf(mesh); if (k >= 0) pickable.splice(k, 1); }
            g.add(rig);
            if (chosen === pc.id) ring.setFromObject(g);
          }).catch(() => { /* the generated shapes simply stay */ });
        }
      }
    }
    const choose = (id: string | null) => { chosen = id; const g = id ? groups.get(id) : undefined; ring.visible = !!g; if (g) ring.setFromObject(g); };

    // selection + hover of rooms
    let current: string | null = null, hovered: string | null = null;
    const paint = () => floors.forEach((f) => {
      const id = f.userData.id;
      (f.material as THREE.MeshStandardMaterial).color.copy(white).lerp(hi, id === current ? 0.42 : id === hovered ? 0.2 : 0);
    });
    sel.current = { set: (id) => { current = id; paint(); }, piece: choose };
    const ray = new THREE.Raycaster(), p2 = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitAt = new THREE.Vector3();
    const aim = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      p2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p2, camera);
    };
    const pickRoom = (e: PointerEvent) => { aim(e); return (ray.intersectObjects(floors)[0]?.object.userData.id as string) ?? null; };
    const pickPiece = (e: PointerEvent) => { aim(e); return (ray.intersectObjects(pickable)[0]?.object.userData.piece as string) ?? null; };
    const dom = renderer.domElement;

    const resize = () => {
      const w = el.clientWidth || 600, h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      dom.style.width = "100%";
      dom.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let raf = 0;
    const win = el.ownerDocument.defaultView ?? window;

    // ── walk-through: stand in a room and move at walking pace ──
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sizeX + 1, 0.12, sizeZ + 1), new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 1 }));
    ceiling.position.y = WALL_H + 0.06;
    ceiling.castShadow = true; // so sunlight only gets in through the windows
    ceiling.visible = false;
    scene.add(ceiling);
    const fill = new THREE.PointLight(0xfff1dc, 0, 9, 1.6); // keeps the corner you stand in from going black
    scene.add(fill);
    const solid = plan.walls.filter((w) => w[4] !== 2).map(([x, y, w, h]) => ({ x0: X(x) - 0.22, x1: X(x + w) + 0.22, z0: Z(y) - 0.22, z1: Z(y + h) + 0.22 }));
    const inBox = (q: { x0: number; x1: number; z0: number; z1: number }, px: number, pz: number) => px > q.x0 && px < q.x1 && pz > q.z0 && pz < q.z1;
    const wallAt = (px: number, pz: number) => solid.some((q) => inBox(q, px, pz));
    const blocked = (px: number, pz: number) => wallAt(px, pz) || hard.some((q) => inBox(q, px, pz));
    const me = { on: false, x: 0, z: 0, yaw: 0, pitch: 0, vf: 0, vs: 0, vy: 0, goal: null as null | { x: number; z: number; stuck: number }, room: null as string | null };
    const keys = new Set<string>();
    const saved = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
    const labels = scene.children.filter((o) => (o as THREE.Sprite).isSprite);
    const polys = rooms.map((r) => ({ id: r.id, poly: r.polygon.map((q) => [X(q[0]), Z(q[1])] as [number, number]) }));
    const within = (poly: [number, number][], px: number, pz: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const enter = (roomId: string) => {
      const room = rooms.find((q) => q.id === roomId) ?? rooms[0];
      if (!room) return;
      if (!me.on) { saved.pos.copy(camera.position); saved.target.copy(controls.target); }
      const poly = polys.find((q) => q.id === room.id)!.poly;
      const xs = poly.map((q) => q[0]), zs = poly.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      // stand back from the furniture with some elbow room, and look at it (an empty room: look across its middle)
      const mine = placed.filter((q) => q.roomId === room.id);
      const tx = mine.length ? mine.reduce((t, q) => t + q.x - cx * mx, 0) / mine.length : (x0 + x1) / 2;
      const tz = mine.length ? mine.reduce((t, q) => t + q.z - cy * my, 0) / mine.length : (z0 + z1) / 2;
      let best = -1;
      me.x = (x0 + x1) / 2; me.z = (z0 + z1) / 2;
      for (let px = x0 + 0.35; px < x1 - 0.3; px += 0.25)
        for (let pz = z0 + 0.35; pz < z1 - 0.3; pz += 0.25) {
          if (!within(poly, px, pz) || blocked(px, pz)) continue;
          let d = Math.min(px - x0, x1 - px, pz - z0, z1 - pz);
          for (const q of [...solid, ...hard]) d = Math.min(d, Math.max(q.x0 - px, px - q.x1, q.z0 - pz, pz - q.z1));
          const score = Math.min(d, 0.6) * 2 + Math.min(Math.hypot(px - tx, pz - tz), 4.5);
          if (score > best) { best = score; me.x = px; me.z = pz; }
        }
      me.yaw = Math.atan2(-(tx - me.x), -(tz - me.z));
      me.pitch = -0.06; me.vf = me.vs = me.vy = 0; me.goal = null; me.room = room.id;
      me.on = true;
      controls.enabled = false;
      ceiling.visible = true;
      fittings.forEach((f) => (f.visible = true));
      roomLights.forEach((l) => (l.intensity = l.userData.on ?? 2));
      fill.intensity = 0.7;
      hemi.intensity = 0.6;
      scene.environmentIntensity = 0.5;
      renderer.toneMappingExposure = 1.05;
      sun.intensity = 5.5;
      sunAt(0.5); // lower sun: long warm patches on the floor
      scene.background = new THREE.Color(0xdfeaf3); // sky behind the windows
      labels.forEach((l) => (l.visible = false));
      ring.visible = false;
      camera.fov = 62;
      camera.near = 0.05;
      camera.updateProjectionMatrix();
      dom.style.cursor = "grab";
      setWalkingRef.current(room.id);
    };
    const exit = () => {
      if (!me.on) return;
      me.on = false;
      keys.clear();
      controls.enabled = true;
      ceiling.visible = false;
      fittings.forEach((f) => (f.visible = false));
      roomLights.forEach((l) => (l.intensity = 0));
      fill.intensity = 0;
      hemi.intensity = 0.75;
      scene.environmentIntensity = 0.42;
      renderer.toneMappingExposure = 0.92;
      sun.intensity = 2.6;
      sunAt(1.25);
      scene.background = null;
      labels.forEach((l) => (l.visible = true));
      camera.fov = saved.fov;
      camera.near = 0.1;
      camera.updateProjectionMatrix();
      camera.position.copy(saved.pos);
      controls.target.copy(saved.target);
      choose(chosen);
      setWalkingRef.current(null);
    };
    const MOVE = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "q", "e"];
    const onKey = (e: KeyboardEvent) => {
      if (!me.on) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, select, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") return exit();
      if (!MOVE.includes(k)) return;
      e.preventDefault();
      me.goal = null;
      if (e.type === "keydown") keys.add(k); else keys.delete(k);
    };
    win.addEventListener("keydown", onKey);
    win.addEventListener("keyup", onKey);

    // ── pointer: look around / tap to walk there (walking), select and drag furniture (overview) ──
    let down: [number, number] = [0, 0], look: [number, number] | null = null;
    let drag: { id: string; ox: number; oz: number; sx: number; sz: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
      if (me.on) { look = [e.clientX, e.clientY]; return; }
      if (!editable) return;
      const id = pickPiece(e);
      const g = id ? groups.get(id) : undefined;
      if (!id || !g) return;
      if (ray.ray.intersectPlane(ground, hitAt)) {
        drag = { id, ox: hitAt.x - g.position.x, oz: hitAt.z - g.position.z, sx: g.position.x, sz: g.position.z, moved: false };
        controls.enabled = false;
        dom.setPointerCapture?.(e.pointerId);
        choose(id);
        cb.current.onPiece?.(id);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (me.on) {
        if (!look) return;
        me.yaw -= (e.clientX - look[0]) * 0.0045;
        me.pitch = Math.max(-0.8, Math.min(0.8, me.pitch - (e.clientY - look[1]) * 0.0036));
        look = [e.clientX, e.clientY];
        return;
      }
      if (drag) {
        aim(e);
        const g = groups.get(drag.id);
        if (g && ray.ray.intersectPlane(ground, hitAt)) {
          g.position.x = hitAt.x - drag.ox; g.position.z = hitAt.z - drag.oz;
          if (Math.hypot(g.position.x - drag.sx, g.position.z - drag.sz) > 0.04) drag.moved = true;
          ring.setFromObject(g);
        }
        return;
      }
      if (e.target !== dom) return;
      const pc = editable ? pickPiece(e) : null;
      const id = pc ? null : pickRoom(e);
      if (id !== hovered) { hovered = id; paint(); }
      dom.style.cursor = pc ? "move" : id ? "pointer" : "grab";
    };
    const onUp = (e: PointerEvent) => {
      const still = Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5;
      if (me.on) {
        look = null;
        // a tap on the floor: walk there
        if (still && e.target === dom) { aim(e); const h = ray.intersectObjects(floors)[0]; if (h) me.goal = { x: h.point.x, z: h.point.z, stuck: 0 }; }
        return;
      }
      if (drag) {
        const d = drag; drag = null;
        controls.enabled = true;
        const g = groups.get(d.id), pc = placed.find((q) => q.id === d.id), room = pc && plan.rooms.find((r) => r.id === pc.roomId);
        if (g && pc && room && d.moved && cb.current.onFurniture) {
          const list = piecesOf(plan, room);
          views.set(plan.id, { pos: camera.position.clone(), target: controls.target.clone() });
          cb.current.onFurniture({ ...(plan.furniture ?? {}), [room.id]: list.map((q) => (q.id === d.id ? clampToRoom(plan, room, { ...q, x: q.x + (g.position.x - d.sx), z: q.z + (g.position.z - d.sz) }, q) : q)) });
        }
        return;
      }
      if (still && e.target === dom) { cb.current.onSelect?.(pickRoom(e)); if (editable) { choose(null); cb.current.onPiece?.(null); } }
    };
    dom.addEventListener("pointerdown", onDown);
    win.addEventListener("pointermove", onMove);
    win.addEventListener("pointerup", onUp);

    const frame = () => new Promise<void>((r) => win.requestAnimationFrame(() => r()));
    const shot = () => { renderer.render(scene, camera); return dom.toDataURL("image/jpeg", 0.88); };
    walk.current = {
      enter, exit, key: (k, on) => { me.goal = null; if (on) keys.add(k); else keys.delete(k); }, pose: () => ({ x: me.x, z: me.z, yaw: me.yaw }), room: () => me.room, shot,
      // "camera on the plan": stand where the map was clicked (walls and furniture excepted)
      place: (x, z) => { if (me.on && !blocked(x, z)) { me.goal = null; me.x = x; me.z = z; } },
      // one picture per furnished room, from the spot Pascal would pick
      tour: async () => {
        const out: { image: string; x: number; z: number; yaw: number; roomId: string | null }[] = [];
        const back = me.room;
        for (const r of [...rooms].sort((p, q) => q.areaM2 - p.areaM2)) {
          if (kindOf(r.name, r.areaM2) === "none" || kindOf(r.name, r.areaM2) === "hall") continue;
          enter(r.id);
          step(); await frame(); await frame();
          out.push({ image: shot(), x: me.x, z: me.z, yaw: me.yaw, roomId: r.id });
        }
        if (back) enter(back);
        return out;
      },
    };
    const clock = new THREE.Clock();
    const SPEED = 1.5, TURN = 1.7; // metres and radians per second: an unhurried walk
    const step = () => {
      const dt = Math.min(0.05, clock.getDelta());
      if (!me.on) return;
      let wantF = (keys.has("arrowup") || keys.has("w") ? 1 : 0) - (keys.has("arrowdown") || keys.has("s") ? 1 : 0);
      const wantS = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
      let wantY = (keys.has("arrowleft") || keys.has("q") ? 1 : 0) - (keys.has("arrowright") || keys.has("e") ? 1 : 0);
      if (me.goal) {
        // turn towards the spot, then walk; give up when something is in the way
        const dx = me.goal.x - me.x, dz = me.goal.z - me.z, dist = Math.hypot(dx, dz);
        let da = Math.atan2(-dx, -dz) - me.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        wantY = Math.max(-1, Math.min(1, da * 2.2));
        wantF = Math.abs(da) < 0.6 ? Math.min(1, dist) : 0;
        if (dist < 0.3 || me.goal.stuck > 0.5) { me.goal = null; wantF = 0; wantY = 0; }
      }
      // ease in and out instead of starting and stopping dead
      const ease = Math.min(1, dt * 7);
      me.vf += (wantF * SPEED - me.vf) * ease;
      me.vs += (wantS * SPEED * 0.8 - me.vs) * ease;
      me.vy += (wantY * TURN - me.vy) * Math.min(1, dt * 9);
      me.yaw += me.vy * dt;
      const dx = (-Math.sin(me.yaw) * me.vf + Math.cos(me.yaw) * me.vs) * dt;
      const dz = (-Math.cos(me.yaw) * me.vf - Math.sin(me.yaw) * me.vs) * dt;
      // slide along walls and furniture instead of passing through
      const bx = blocked(me.x + dx, me.z), bz = blocked(me.x, me.z + dz);
      if (!bx) me.x += dx;
      if (!bz) me.z += dz;
      if (me.goal && bx && bz) me.goal.stuck += dt; else if (me.goal && !bx && !bz) me.goal.stuck = 0; else if (me.goal) me.goal.stuck += dt * 0.5;
      if (bx && bz) { me.vf *= 0.5; me.vs *= 0.5; }
      const here = polys.find((q) => within(q.poly, me.x, me.z))?.id;
      if (here && here !== me.room) { me.room = here; setWalkingRef.current(here); }
      camera.position.set(me.x, EYE, me.z);
      camera.lookAt(me.x - Math.sin(me.yaw) * Math.cos(me.pitch), EYE + Math.sin(me.pitch), me.z - Math.cos(me.yaw) * Math.cos(me.pitch));
      fill.position.set(me.x, 2.1, me.z);
    };
    const loop = () => { step(); if (!me.on) controls.update(); renderer.render(scene, camera); raf = win.requestAnimationFrame(loop); };
    loop();

    return () => {
      alive = false;
      if (!me.on) views.set(plan.id, { pos: camera.position.clone(), target: controls.target.clone() });
      win.cancelAnimationFrame(raf);
      ro.disconnect();
      win.removeEventListener("keydown", onKey);
      win.removeEventListener("keyup", onKey);
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", onUp);
      walk.current = null;
      setWalkingRef.current(null);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      [texParquet, texTiles, texWood, texFabric, env].forEach((t) => t.dispose());
      pmrem.dispose();
      renderer.dispose();
      dom.remove();
      sel.current = null;
    };
  }, [plan, onlyConfirmed, accent, furniture, editable]);

  useEffect(() => { sel.current?.set(selected ?? null); }, [selected, plan]);
  useEffect(() => { sel.current?.piece(piece ?? null); }, [piece, plan]);

  const list = onlyConfirmed ? plan.rooms.filter((r) => r.confirmed) : plan.rooms;
  // minimap: the rooms from above with a dot where you stand
  useEffect(() => {
    if (!walking || !showMap) return;
    const c = map.current;
    if (!c) return;
    const b = planBounds(plan), mx = plan.metersPerUnit, my = plan.metersPerUnit * (plan.height / plan.width);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = (b.x1 - b.x0) * mx, h = (b.y1 - b.y0) * my;
    const k = Math.min((c.width - 16) / w, (c.height - 16) / h);
    const px = (x: number) => c.width / 2 + x * k, pz = (z: number) => c.height / 2 + z * k;
    const click = (e: MouseEvent) => { const r = c.getBoundingClientRect(); walk.current?.place(((e.clientX - r.left) * (c.width / r.width) - c.width / 2) / k, ((e.clientY - r.top) * (c.height / r.height) - c.height / 2) / k); };
    c.addEventListener("click", click);
    const draw = () => {
      const g = c.getContext("2d")!, pose = walk.current?.pose(), here = walk.current?.room();
      g.clearRect(0, 0, c.width, c.height);
      for (const r of list) {
        g.beginPath();
        r.polygon.forEach(([x, y], i) => (i ? g.lineTo(px((x - cx) * mx), pz((y - cy) * my)) : g.moveTo(px((x - cx) * mx), pz((y - cy) * my))));
        g.closePath();
        g.fillStyle = r.id === here ? "rgba(132,191,49,0.5)" : "rgba(255,255,255,0.22)";
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 1.5; g.stroke();
      }
      if (pose) {
        g.save(); g.translate(px(pose.x), pz(pose.z)); g.rotate(-pose.yaw);
        g.fillStyle = "#fff"; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill();
        g.restore();
      }
    };
    draw();
    const t = setInterval(draw, 80);
    return () => { clearInterval(t); c.removeEventListener("click", click); };
  }, [walking, showMap, plan, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); walk.current?.key(k, true); },
    onPointerUp: () => walk.current?.key(k, false),
    onPointerLeave: () => walk.current?.key(k, false),
  });
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 320 }}>
      <div ref={host} style={{ width: "100%", height: "100%" }} aria-label={`3D model ${plan.name}`} />
      {walkable && list.length ? (
        walking ? (
          <div className="walk-ui">
            <div className="walk-top">
              <label className="walk-you" htmlFor="walk-room">Jump to room</label>
              <select id="walk-room" className="walk-room" value={walking} onChange={(e) => { walk.current?.enter(e.target.value); e.target.blur(); }}>
                {list.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button type="button" className="walk-map-btn" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>Map</button>
              <button type="button" className="walk-exit" onClick={() => walk.current?.exit()}>Leave</button>
            </div>
            {onCapture ? (
              <div className="walk-shoot">
                <button type="button" className="walk-snap" onClick={() => { const w = walk.current; if (w) onCapture({ image: w.shot(), ...w.pose(), roomId: w.room() }); }}><i aria-hidden />Take picture</button>
                <button type="button" className="walk-all" onClick={async () => { const list = await walk.current?.tour(); list?.forEach((s) => onCapture(s)); }}>One per room</button>
              </div>
            ) : null}
            {showMap ? <canvas ref={map} className="walk-map" width={300} height={220} aria-label="Map of the apartment: click to stand there" title="Click to stand there" /> : null}
            <div className="walk-pad" aria-label="Move">
              <button type="button" className="up" aria-label="Forward" {...hold("arrowup")}>↑</button>
              <button type="button" className="left" aria-label="Turn left" {...hold("arrowleft")}>←</button>
              <button type="button" className="down" aria-label="Back" {...hold("arrowdown")}>↓</button>
              <button type="button" className="right" aria-label="Turn right" {...hold("arrowright")}>→</button>
            </div>
            <div className="walk-hint" key={walking ? "on" : "off"}>Arrow keys or W A S D to walk · drag to look · click the floor to go there</div>
          </div>
        ) : (
          <button type="button" className="walk-start" onClick={() => walk.current?.enter(selected && list.some((r) => r.id === selected) ? selected : [...list].sort((a, c) => c.areaM2 - a.areaM2)[0].id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="5" r="2" /><path d="M10 22l1-7-3-3 1-5 4 1 3 3M13 15l3 3 1 4" /></svg>
            Walk through
          </button>
        )
      ) : null}
    </div>
  );
}
