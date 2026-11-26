import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Real furniture models (Poly Haven, CC0) bundled in /public/models. Each catalogue piece says which models stand
 * where inside its footprint; pieces without a model here (bed, kitchen, bathroom) keep their generated shapes.
 * Local coordinates: metres from the back-left corner of the footprint, the back (wall side) at z = 0.
 */
export interface Slot { id: string; x: number; z: number; yaw?: number; fit: { w?: number; h?: number; d?: number } }
export interface ModelPlan { slots: Slot[]; /** generated parts that stay visible next to the models */ keep?: (part: { color: string; flat?: boolean; y0: number }) => boolean }

const FABRIC = "#b7b1a6";
export function modelPlan(type: string, s: number, w: number, d: number): ModelPlan | null {
  switch (type) {
    case "sofa": return { slots: [{ id: "sofa_02", x: w / 2, z: 0.48, fit: { w: 2.2 } }, { id: "modern_coffee_table_01", x: w / 2, z: 1.62, yaw: Math.PI / 2, fit: { d: 1.1 } }], keep: (p) => !!p.flat };
    case "armchair": return { slots: [{ id: "modern_arm_chair_01", x: w / 2, z: d / 2, fit: { w: 0.85 } }] };
    case "tv": return { slots: [{ id: "modern_wooden_cabinet", x: w / 2, z: 0.22, fit: { w: 1.6, d: 0.42, h: 0.45 } }], keep: (p) => p.y0 >= 0.45 };
    case "bench": return { slots: [{ id: "modern_wooden_cabinet", x: w / 2, z: d / 2, fit: { w, d: 0.38, h: 0.5 } }] };
    case "shelf": return { slots: [{ id: "Shelf_01", x: w / 2, z: 0.16, fit: { w: 1.1, h: 1.95, d: 0.3 } }] };
    case "plant": return { slots: [{ id: "potted_plant_01", x: w / 2, z: d / 2, fit: { h: 1.25 } }] };
    case "wardrobe": {
      const n = Math.max(1, Math.round(w / 1.15));
      return { slots: Array.from({ length: n }, (_, k) => ({ id: "drawer_cabinet", x: (w / n) * (k + 0.5), z: 0.3, fit: { w: w / n, h: 2.05, d: 0.58 } })) };
    }
    case "desk": return { slots: [{ id: "dining_chair_02", x: 0.65, z: 0.95, yaw: Math.PI, fit: { h: 0.92 } }], keep: (p) => p.color !== FABRIC };
    case "dining": {
      const half = s >= 6 ? 3 : 2;
      const slots: Slot[] = [{ id: "dining_table", x: w / 2, z: 0.95, fit: { w, d: 0.9, h: 0.75 } }];
      for (let k = 0; k < half; k++) {
        const cx = (w / half) * (k + 0.5);
        slots.push({ id: "dining_chair_02", x: cx, z: 0.36, fit: { h: 0.92 } }, { id: "dining_chair_02", x: cx, z: 1.54, yaw: Math.PI, fit: { h: 0.92 } });
      }
      return { slots };
    }
    default: return null;
  }
}

interface Loaded { scene: THREE.Object3D; size: THREE.Vector3; centre: THREE.Vector3; minY: number }
const cache = new Map<string, Promise<Loaded>>();
/** loads a model once; every use gets its own copy that shares geometry and textures */
export function loadModel(id: string): Promise<Loaded> {
  let p = cache.get(id);
  if (!p) {
    p = new GLTFLoader().loadAsync(`/models/${id}/${id}_1k.gltf`).then((g) => {
      const box = new THREE.Box3().setFromObject(g.scene);
      return { scene: g.scene, size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()), minY: box.min.y };
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
/** a copy of the model, scaled to the wanted size, standing on the floor, centred on the holder's origin */
export function instance(m: Loaded, slot: Slot): THREE.Group {
  const { w, h, d } = slot.fit;
  const given = [w ? w / m.size.x : 0, h ? h / m.size.y : 0, d ? d / m.size.z : 0].filter(Boolean);
  const uni = given.length ? given.reduce((a, b) => a + b, 0) / given.length : 1;
  // one measure given: keep the proportions; several: match each of them
  const sx = given.length > 1 && w ? w / m.size.x : uni, sy = given.length > 1 && h ? h / m.size.y : uni, sz = given.length > 1 && d ? d / m.size.z : uni;
  const obj = m.scene.clone(true);
  obj.scale.set(sx, sy, sz);
  obj.position.set(-m.centre.x * sx, -m.minY * sy, -m.centre.z * sz);
  const holder = new THREE.Group();
  holder.rotation.y = slot.yaw ?? 0;
  holder.add(obj);
  holder.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
  return holder;
}
