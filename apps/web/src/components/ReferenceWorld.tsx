'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createPaperPerson, type PaperPerson } from '../lib/scene/paper-person';
import { createGiantLegs } from '../lib/scene/giant-leg';
import styles from './ReferenceWorld.module.css';

export type ReferenceMember = {
  id: bigint | string | number;
  name: string;
  connected?: boolean;
  isBot?: boolean;
  status?: string;
  active?: boolean;
  confirmed?: boolean;
};

type Props = {
  variant?: 'cover' | 'stage';
  members?: readonly ReferenceMember[];
  phase?: string;
  onSelectMember?: (id: string) => void;
};

type Walker = {
  rig: PaperPerson;
  leaves: THREE.Mesh[];
  head?: THREE.Object3D;
  target: THREE.Vector3;
  distance: number;
  speed: number;
  seed: number;
  nextTurn: number;
};

type Bucket = { mesh: THREE.InstancedMesh; count: number };
const EMPTY_MEMBERS: readonly ReferenceMember[] = [];
const COVER_COUNT = 120;
const PAPER = 0xf4f3ef;
const INK = 0x14140f;
const TAU = Math.PI * 2;

function hash(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return n >>> 0;
}

function random(seed: number): () => number {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function walker(seed: number): Walker {
  const rig = createPaperPerson({ seed, color: 0xffffff });
  const leaves: THREE.Mesh[] = [];
  rig.group.traverse(object => { if (object instanceof THREE.Mesh) leaves.push(object); });
  return { rig, leaves, head: rig.group.getObjectByName('head-pivot'),
    target: new THREE.Vector3(), distance: 0, speed: 0, seed, nextTurn: 0 };
}

/** A real mesh table: people correctly pass behind its top and pedestal. */
function conversationTable(): THREE.Group {
  const group = new THREE.Group();
  const white = new THREE.MeshToonMaterial({ color: 0xffffff });
  const black = new THREE.MeshBasicMaterial({ color: INK });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.12, 64), white);
  top.position.y = 1.02;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 0.16, 64), black);
  rim.position.y = 0.985;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.85, 16), black);
  leg.position.y = 0.48;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.07, 24), black);
  foot.position.y = 0.04;
  group.add(rim, top, leg, foot);
  for (let i = 0; i < 3; i++) {
    const angle = i * TAU / 3;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.025, 32), white);
    plate.position.set(Math.sin(angle) * 1.35, 1.105, Math.cos(angle) * 1.35);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 5, 32), black);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(plate.position);
    ring.position.y += 0.025;
    group.add(plate, ring);
  }
  group.traverse(object => {
    if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
  });
  return group;
}

/**
 * The cover is a continuous 3D crowd, not an image or a tiled avatar grid.
 * Stage characters correspond only to the room's actual public member state.
 */
export function ReferenceWorld({ variant = 'cover', members = EMPTY_MEMBERS, phase = '', onSelectMember }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef({ members, phase, onSelectMember });
  const focus = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { latest.current = { members, phase, onSelectMember }; }, [members, phase, onSelectMember]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch {
      element.dataset.webglReady = 'false';
      setFailed(true);
      return;
    }
    setFailed(false);
    renderer.setClearColor(PAPER, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = variant === 'stage';
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.className = styles.canvas;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    element.prepend(renderer.domElement);
    element.dataset.webglReady = 'true';

    const scene = new THREE.Scene();
    const giant = variant === 'cover' ? createGiantLegs() : null;
    if (giant) scene.add(giant.group);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 250);
    const ambient = new THREE.HemisphereLight(0xffffff, PAPER, 1.35);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-19.25, 35, 14.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
    if (variant === 'cover') Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 160 });
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.04;
    const floorGeometry = new THREE.PlaneGeometry(220, 220);
    // Keep the reference's paper colour independent of the character lighting.
    const floorMaterial = new THREE.MeshBasicMaterial({ color: PAPER });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.025;
    const groundShadowMaterial = new THREE.ShadowMaterial({ color: INK, opacity: 0.12 });
    const groundShadow = new THREE.Mesh(floorGeometry, groundShadowMaterial);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = -0.02;
    groundShadow.receiveShadow = true;
    groundShadow.visible = true;
    scene.add(ambient, sun, floor, groundShadow);
    const table = conversationTable();
    table.visible = false;
    scene.add(table);

    const cover: Walker[] = [];
    const named = new Map<string, Walker>();
    const buckets = new Map<string, Bucket>();
    const projected = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    const pointer = new THREE.Vector2();
    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointerWorld = new THREE.Vector3();
    let pointerPresent = false;
    let width = 1;
    let height = 1;
    let frame = 0;
    let elapsed = 0;
    let lastDraw = 0;
    let lastSimulation = 0;
    let raf = 0;
    let stopped = false;
    let previousPhase = '';
    let memberSignature = '';
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionPreference.matches;

    if (variant === 'cover') {
      const rng = random(41579);
      for (let i = 0; i < COVER_COUNT; i++) {
        const person = walker(i + 1);
        person.rig.group.position.set((rng() - 0.5) * 56, 0, (rng() - 0.5) * 56);
        // The closer part of the dolly always has an actual foreground conversation.
        if (i < 3) person.rig.group.position.set((i - 1) * 1.8, 0, (i % 2) * 1.7);
        person.target.set((rng() - 0.5) * 56, 0, (rng() - 0.5) * 56);
        person.rig.group.rotation.y = rng() * TAU;
        person.nextTurn = 3 + rng() * 15;
        cover.push(person);
      }
    }

    const resize = () => {
      const bounds = element.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('resize', resize);
    resize();

    const reconcileMembers = () => {
      const current = latest.current;
      const key = `${current.phase}|${current.members.map(member => `${member.id}:${member.confirmed ? 1 : 0}`).join(',')}`;
      if (key === memberSignature) return;
      memberSignature = key;
      const plan = current.phase.toUpperCase() === 'PLAN';
      table.visible = plan;
      const liveIds = new Set(current.members.map(member => String(member.id)));
      for (const [id, person] of named) {
        if (!liveIds.has(id)) { person.rig.dispose(); named.delete(id); }
      }
      const count = current.members.length;
      current.members.forEach((member, index) => {
        const id = String(member.id);
        const seed = hash(id);
        let person = named.get(id);
        const angle = index / Math.max(1, count) * TAU + 0.35;
        if (!person) {
          person = walker(seed);
          const entryAngle = (seed % 628) / 100;
          person.rig.group.position.set(Math.sin(entryAngle) * 27, 0, Math.cos(entryAngle) * 27);
          named.set(id, person);
          scene.add(person.rig.group);
        }
        const radius = plan ? (member.confirmed ? 3.25 : 8.5) : 8.5 + ((seed % 9) - 4) * 0.2;
        // Ground-plane circle projects naturally in perspective; it is not an HTML seating grid.
        person.target.set(Math.sin(angle) * radius, 0, plan ? Math.cos(angle) * radius : Math.cos(angle) * radius * 0.7 - 1.5);
        if (reduced) person.rig.group.position.copy(person.target);
      });
      if (previousPhase !== current.phase) {
        element.dataset.phase = current.phase;
        previousPhase = current.phase;
      }
      element.dataset.memberCount = String(count);
    };

    const move = (person: Walker, dt: number, isCover: boolean, speaking: boolean) => {
      const position = person.rig.group.position;
      const dx = person.target.x - position.x;
      const dz = person.target.z - position.z;
      const remaining = Math.hypot(dx, dz);
      const speed = !reduced && remaining > 0.12 ? (isCover ? 0.65 : Math.min(3, remaining * 1.4)) : 0;
      const distance = Math.min(remaining, speed * dt);
      if (distance > 0) {
        position.x += dx / remaining * distance;
        position.z += dz / remaining * distance;
        person.distance += distance;
        const heading = Math.atan2(dx, dz);
        const turn = Math.atan2(Math.sin(heading - person.rig.group.rotation.y), Math.cos(heading - person.rig.group.rotation.y));
        person.rig.group.rotation.y += turn * Math.min(1, dt * 8);
      } else if (!isCover) {
        const heading = Math.atan2(-position.x, -1.5 - position.z);
        const turn = Math.atan2(Math.sin(heading - person.rig.group.rotation.y), Math.cos(heading - person.rig.group.rotation.y));
        person.rig.group.rotation.y += turn * Math.min(1, dt * 3);
      }
      person.speed = speed;
      person.rig.update({ time: reduced ? 0 : elapsed, delta: reduced ? 0 : dt,
        distance: person.distance, speed, speaking: !reduced && speaking });
      if (pointerPresent && person.head && remaining < 0.2) {
        const heading = Math.atan2(pointerWorld.x - position.x, pointerWorld.z - position.z);
        const local = Math.atan2(Math.sin(heading - person.rig.group.rotation.y), Math.cos(heading - person.rig.group.rotation.y));
        person.head.rotation.y = THREE.MathUtils.clamp(local, -0.55, 0.55);
      }
      person.rig.group.updateMatrixWorld(true);
    };

    const batchCover = () => {
      for (const bucket of buckets.values()) bucket.count = 0;
      for (const person of cover) for (const leaf of person.leaves) {
        // Face material changes use the factory's ten shared states, not per-person textures.
        const material = leaf.material as THREE.Material;
        const key = `${leaf.geometry.uuid}/${material.uuid}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          const mesh = new THREE.InstancedMesh(leaf.geometry, material, COVER_COUNT * 2);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.frustumCulled = false;
          mesh.renderOrder = leaf.userData.paperContactShadow ? -1 : leaf.renderOrder;
          mesh.name = `crowd-batch-${buckets.size}`;
          bucket = { mesh, count: 0 };
          buckets.set(key, bucket);
          scene.add(mesh);
        }
        bucket.mesh.setMatrixAt(bucket.count++, leaf.matrixWorld);
      }
      for (const bucket of buckets.values()) {
        bucket.mesh.count = bucket.count;
        bucket.mesh.instanceMatrix.needsUpdate = true;
      }
    };

    const positionLabels = () => {
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const current = latest.current;
      // Focused labels take precedence when people overlap in perspective.
      const ordered = [...current.members].sort((a, b) => Number(String(b.id) === focus.current) - Number(String(a.id) === focus.current));
      for (const member of ordered) {
        const id = String(member.id);
        const label = labels.current.get(id);
        const person = named.get(id);
        if (!label || !person) continue;
        projected.copy(person.rig.group.position);
        projected.y = 2.05;
        projected.project(camera);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.03 || Math.abs(projected.y) > 1.03) { label.style.visibility = 'hidden'; continue; }
        const w = Math.max(76, label.offsetWidth);
        const h = Math.max(34, label.offsetHeight);
        const x = THREE.MathUtils.clamp((projected.x * 0.5 + 0.5) * width - w / 2, 4, width - w - 4);
        const baseY = THREE.MathUtils.clamp((-projected.y * 0.5 + 0.5) * height - h - 6, 4, height - h - 4);
        let y: number | undefined;
        for (let tries = 0; tries < 24; tries++) {
          const candidate = baseY + (tries === 0 ? 0 : (tries % 2 ? -1 : 1) * Math.ceil(tries / 2) * (h + 7));
          if (candidate < 4 || candidate + h > height - 4) continue;
          const collision = occupied.some(rect => x < rect.x + rect.w + 6 && x + w + 6 > rect.x && candidate < rect.y + rect.h + 5 && candidate + h + 5 > rect.y);
          if (!collision) { y = candidate; break; }
        }
        if (y === undefined) { label.style.visibility = 'hidden'; continue; }
        occupied.push({ x, y, w, h });
        label.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
        label.style.visibility = 'visible';
      }
    };

    const draw = (now: number) => {
      if (stopped) return;
      raf = window.requestAnimationFrame(draw);
      if (document.hidden) { lastDraw = now; lastSimulation = 0; return; }
      const interval = 1000 / 30;
      const sinceDraw = now - lastDraw;
      if (sinceDraw < interval) return;
      // Retain the fractional frame budget so a 60 Hz display does not drift
      // into one render every three frames. Simulation uses actual visible time.
      lastDraw = now - sinceDraw % interval;
      const dt = lastSimulation ? Math.min(0.1, (now - lastSimulation) / 1000) : 0;
      lastSimulation = now;
      if (!reduced) elapsed += dt;
      giant?.update(reduced ? 0 : elapsed);
      if (variant === 'cover') {
        const close = reduced ? 0 : (1 - Math.cos(elapsed / 16 * TAU)) / 2;
        const distance = THREE.MathUtils.lerp(64, 13, close);
        const elevation = THREE.MathUtils.lerp(35, 4.4, close);
        const orbit = reduced ? 0 : elapsed * 0.08;
        camera.position.set(Math.sin(orbit) * distance, elevation, Math.cos(orbit) * distance);
        lookAt.set(0, 1, -1);
        for (const person of cover) {
          if (!reduced && elapsed > person.nextTurn) {
            const rng = random(person.seed + Math.floor(elapsed) * 117);
            person.target.set((rng() - 0.5) * 56, 0, (rng() - 0.5) * 56);
            person.nextTurn = elapsed + 8 + rng() * 18;
          }
          move(person, dt, true, false);
        }
        batchCover();
      } else {
        // The reference has hundreds of people. Ten actual players need a closer
        // camera, shifted towards the clear left half beside the game controls.
        const compact = width < 620;
        const offset = compact || latest.current.phase === 'LOBBY' ? 0 : latest.current.phase === 'PLAN' ? 9 : 7.5;
        camera.position.set(offset, compact ? 30 : 24, compact ? 39 : 31);
        lookAt.set(offset, 1.2, -2);
        reconcileMembers();
        for (const member of latest.current.members) {
          const person = named.get(String(member.id));
          if (person) {
            move(person, dt, false, !!member.active);
            if (focus.current === String(member.id) && person.speed < 0.1) {
              const position = person.rig.group.position;
              const heading = Math.atan2(camera.position.x - position.x, camera.position.z - position.z);
              const turn = Math.atan2(Math.sin(heading - person.rig.group.rotation.y), Math.cos(heading - person.rig.group.rotation.y));
              person.rig.group.rotation.y += turn * Math.min(1, dt * 7);
              person.rig.group.updateMatrixWorld(true);
            }
          }
        }
      }
      camera.lookAt(lookAt);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      if (variant === 'stage') positionLabels();
      frame++;
      if (frame === 1 || frame % 15 === 0) {
        element.dataset.frameCount = String(frame);
        element.dataset.renderCalls = String(renderer.info.render.calls);
        element.dataset.personCount = String(variant === 'cover' ? cover.length : named.size);
        element.dataset.triangleCount = String(renderer.info.render.triangles);
        element.dataset.cameraPosition = camera.position.toArray().map(n => n.toFixed(2)).join(',');
        element.dataset.sceneSeconds = elapsed.toFixed(2);
      }
    };

    const pointerMove = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / width * 2 - 1, -(event.clientY - bounds.top) / height * 2 + 1);
      ray.setFromCamera(pointer, camera);
      pointerPresent = ray.ray.intersectPlane(ground, pointerWorld) !== null;
    };
    const pointerLeave = () => { pointerPresent = false; };
    const visibility = () => { lastDraw = 0; lastSimulation = 0; };
    const preferenceChange = () => { reduced = motionPreference.matches; element.dataset.reducedMotion = String(reduced); };
    const contextLost = (event: Event) => {
      event.preventDefault();
      element.dataset.webglReady = 'false';
      setFailed(true);
    };
    const contextRestored = () => {
      element.dataset.webglReady = 'true';
      lastDraw = 0;
      lastSimulation = 0;
      renderer.shadowMap.needsUpdate = true;
      setFailed(false);
      resize();
    };
    element.dataset.reducedMotion = String(reduced);
    element.addEventListener('pointermove', pointerMove);
    element.addEventListener('pointerleave', pointerLeave);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
    document.addEventListener('visibilitychange', visibility);
    motionPreference.addEventListener('change', preferenceChange);
    raf = window.requestAnimationFrame(draw);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibility);
      motionPreference.removeEventListener('change', preferenceChange);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
      for (const bucket of buckets.values()) { scene.remove(bucket.mesh); bucket.mesh.dispose(); }
      for (const person of cover) person.rig.dispose();
      for (const person of named.values()) person.rig.dispose();
      const tableGeometries = new Set<THREE.BufferGeometry>();
      const tableMaterials = new Set<THREE.Material>();
      table.traverse(object => {
        if (object instanceof THREE.Mesh) {
          tableGeometries.add(object.geometry);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => tableMaterials.add(material));
        }
      });
      tableGeometries.forEach(geometry => geometry.dispose());
      tableMaterials.forEach(material => material.dispose());
      floorGeometry.dispose();
      giant?.dispose();
      floorMaterial.dispose();
      groundShadowMaterial.dispose();
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      scene.clear();
      element.dataset.webglReady = 'false';
    };
  }, [variant]);

  return (
    <div ref={container} className={`${styles.world} ${variant === 'cover' ? styles.cover : styles.stage}`}
      data-reference-world={variant} aria-label={variant === 'cover' ? 'A crowd of little people walking together' : 'People in this room'}>
      {variant === 'stage' && members.map(member => {
        const id = String(member.id);
        const status = member.connected === false ? 'Disconnected' : member.status;
        return <button key={id} type="button"
          ref={node => { if (node) labels.current.set(id, node); else labels.current.delete(id); }}
          className={`${styles.label} ${member.active ? styles.active : ''} ${member.connected === false ? styles.disconnected : ''}`}
          aria-pressed={onSelectMember ? selected === id : undefined}
          aria-label={`${member.name}${status ? `, ${status}` : ''}${member.isBot ? ', bot' : ''}`}
          onPointerEnter={() => { focus.current = id; }} onPointerLeave={() => { focus.current = selected; }}
          onFocus={() => { focus.current = id; }} onBlur={() => { focus.current = selected; }}
          onClick={() => { setSelected(id); focus.current = id; latest.current.onSelectMember?.(id); }}>
          <span className={styles.name}>{member.name}{member.isBot && <small> BOT</small>}</span>
          {status && <span className={styles.status}>{status}</span>}
        </button>;
      })}
      {failed && <p className={styles.fallback} role="status">The 3D crowd is unavailable in this browser.{variant === 'stage' && members.length > 0 ? ` ${members.map(member => member.name).join(', ')} are in the room.` : ''}</p>}
      {variant === 'stage' && members.length === 0 && <span className={styles.empty}>The room is waiting for its first person.</span>}
    </div>
  );
}
