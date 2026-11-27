"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FLOORS, floorTexture, type FloorKey } from "@/lib/floorplan/studio";
import type { FloorPlan } from "@/lib/types";

const WALL_H = 2.5;

/**
 * The 3D view of the colleague's Studio: the wall grid read from the plan picture is extruded 2.5 m high, the floor
 * gets the chosen parquet, a warm sun casts soft shadows. Drag to rotate, scroll to zoom.
 */
export default function Studio3D({ studio, floor }: { studio: NonNullable<FloorPlan["studio"]>; floor?: FloorKey }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { el.textContent = "The 3D view could not start in this browser tab. Reload the page to try again."; return; }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const { gw, gh, walls, floors } = studio.grid;
    // real size when the plan's scale is known; otherwise the flat is drawn 13 m across, like in Studio
    const M = studio.mpp > 0 ? studio.mpp : 13 / Math.max(gw, gh);
    const cx = (gw * M) / 2, cz = (gh * M) / 2;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c5, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.2);
    const span = Math.max(gw, gh) * M;
    sun.position.set(-span * 0.6, span * 1.2, span * 0.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.1; sc.far = span * 4;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // floor: one geometry from all floor rectangles, parquet tiled by the metre
    const tex = new THREE.CanvasTexture(floorTexture(FLOORS[floor ?? (studio.floor as FloorKey)] ?? FLOORS["Eiche hell"]));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const fGeos = floors.map(([x, y, w, h]) => {
      const g = new THREE.PlaneGeometry(w * M, h * M);
      g.rotateX(-Math.PI / 2);
      g.translate(x * M + (w * M) / 2 - cx, 0.01, y * M + (h * M) / 2 - cz);
      // world-space UVs, one parquet tile per 2.4 m
      const pos = g.getAttribute("position"), uv = g.getAttribute("uv");
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2.4, pos.getZ(i) / 2.4);
      return g;
    });
    if (fGeos.length) {
      const floorMesh = new THREE.Mesh(mergeGeometries(fGeos), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 }));
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);
    }
    // walls: every wall rectangle extruded, merged into one mesh
    const wGeos = walls.map(([x, y, w, h]) => { const g = new THREE.BoxGeometry(w * M, WALL_H, h * M); g.translate(x * M + (w * M) / 2 - cx, WALL_H / 2, y * M + (h * M) / 2 - cz); return g; });
    if (wGeos.length) {
      const wallMesh = new THREE.Mesh(mergeGeometries(wGeos), new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.9 }));
      wallMesh.castShadow = true; wallMesh.receiveShadow = true;
      scene.add(wallMesh);
      // dark wall tops, like a cut plan
      const tops = walls.map(([x, y, w, h]) => { const g = new THREE.PlaneGeometry(w * M, h * M); g.rotateX(-Math.PI / 2); g.translate(x * M + (w * M) / 2 - cx, WALL_H + 0.002, y * M + (h * M) / 2 - cz); return g; });
      scene.add(new THREE.Mesh(mergeGeometries(tops), new THREE.MeshBasicMaterial({ color: 0x2a2a2c })));
    }
    // a soft ground the flat stands on
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 3, span * 3), new THREE.ShadowMaterial({ opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, span * 20);
    camera.position.set(span * 0.62, span * 1.35, span * 1.3); // the whole flat in view, from the front-right corner
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = span * 0.4;
    controls.maxDistance = span * 3;
    controls.enablePan = false;

    const resize = () => { const w = el.clientWidth || 600, h = el.clientHeight || 420; renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%"; camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mat = m.material as THREE.Material | undefined; mat?.dispose?.(); });
      tex.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [studio, floor]);
  return <div ref={host} style={{ width: "100%", height: "100%", minHeight: 320, cursor: "grab" }} aria-label="3D floor plan" />;
}
