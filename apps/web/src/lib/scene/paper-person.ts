import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** An original, small articulated paper person. Forward is local +Z. */
export type PaperPersonOptions = {
  seed: number;
  variant?: 'plain' | 'hat' | 'shirt';
  color?: number;
};

export type PaperPersonFrame = {
  time: number;
  delta: number;
  /** Total distance travelled, in world units, rather than distance this frame. */
  distance: number;
  speed: number;
  speaking?: boolean;
  alert?: boolean;
};

export type PaperPerson = {
  group: THREE.Group;
  update(frame: PaperPersonFrame): void;
  /** Idempotent. Shared resources are released only after the final person. */
  dispose(): void;
};

const INK = 0x14140f;
const HEIGHT = 1.7;
const HEAD_RADIUS = 0.235;
const OUTLINE = 0.05;
const TAU = Math.PI * 2;

type Resources = {
  users: number;
  geometries: Record<string, THREE.BufferGeometry>;
  fills: Map<number, THREE.MeshToonMaterial>;
  ink: THREE.MeshBasicMaterial;
  solid: THREE.MeshBasicMaterial;
  faces: THREE.MeshBasicMaterial[][];
  shadow: THREE.MeshBasicMaterial;
  textures: THREE.Texture[];
  gradient: THREE.DataTexture;
};

let shared: Resources | undefined;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (lo: number, hi: number, v: number) => {
  const x = clamp((v - lo) / (hi - lo), 0, 1);
  return x * x * (3 - 2 * x);
};

/** Expand along welded vertex normals, preserving thickness around limb joints. */
function outlineGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = source.clone();
  const position = result.getAttribute('position');
  const normal = result.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>();
  const keys: string[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
    keys.push(key);
    let sum = sums.get(key);
    if (!sum) {
      sum = new THREE.Vector3();
      sums.set(key, sum);
    }
    sum.x += normal.getX(i);
    sum.y += normal.getY(i);
    sum.z += normal.getZ(i);
  }
  for (const sum of sums.values()) sum.normalize();
  for (let i = 0; i < position.count; i++) {
    const n = sums.get(keys[i])!;
    position.setXYZ(i, position.getX(i) + n.x * OUTLINE,
      position.getY(i) + n.y * OUTLINE, position.getZ(i) + n.z * OUTLINE);
  }
  position.needsUpdate = true;
  result.deleteAttribute('uv');
  result.computeBoundingSphere();
  return result;
}

function combine(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('Paper person geometry could not be assembled.');
  geometry.computeBoundingSphere();
  return geometry;
}

/** Capsule anchored at its top, with an overlapping rounded hand or foot. */
function limb(radius: number, length: number, foot: boolean): THREE.BufferGeometry {
  const capsule = new THREE.CapsuleGeometry(radius, length, 4, 10);
  capsule.translate(0, -(length / 2 + radius), 0);
  const end = new THREE.SphereGeometry(radius, 12, 8);
  end.scale(foot ? 1.28 : 1.12, foot ? 0.65 : 1, foot ? 1.75 : 1.12);
  end.translate(0, -(length + radius * 1.7), radius * 0.5);
  return combine([capsule, end]);
}

/** Distance to a round-ended circular arc in normalized texture coordinates. */
function arcDistance(x: number, y: number, cx: number, cy: number, radius: number,
  start: number, end: number): number {
  const dx = x - cx;
  const dy = y - cy;
  const angle = (Math.atan2(dy, dx) + TAU) % TAU;
  if (angle >= start && angle <= end) return Math.abs(Math.hypot(dx, dy) - radius);
  return Math.min(Math.hypot(dx - Math.cos(start) * radius, dy - Math.sin(start) * radius),
    Math.hypot(dx - Math.cos(end) * radius, dy - Math.sin(end) * radius));
}

/** Rasterize the small curved face without DOM/canvas dependencies. */
function faceTexture(open: number, alert: boolean): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    // Sphere UVs have their top at v=1; typed textures upload row zero at v=0.
    const y = 1 - (row + 0.5) / size;
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / size;
      let alpha = 0;
      for (const cx of [0.345, 0.655]) {
        const d = alert
          ? Math.hypot(x - cx, y - 0.415) - 0.071
          : arcDistance(x, y, cx, 0.478, 0.092, Math.PI * 1.16, Math.PI * 1.84) - 0.023;
        alpha = Math.max(alpha, 1 - smoothstep(-0.004, 0.006, d));
      }
      alpha = Math.max(alpha, 1 - smoothstep(0.018, 0.027, Math.hypot(x - 0.5, y - 0.545)));
      let mouthDistance: number;
      if (open > 0 || alert) {
        const rx = alert && open === 0 ? 0.045 : 0.07;
        const ry = alert && open === 0 ? 0.05 : 0.028 + 0.062 * open;
        mouthDistance = Math.abs(Math.hypot((x - 0.5) / rx, (y - 0.645) / ry) - 1) * Math.min(rx, ry);
      } else {
        mouthDistance = arcDistance(x, y, 0.5, 0.61, 0.08, Math.PI * 0.2, Math.PI * 0.8);
      }
      alpha = Math.max(alpha, 1 - smoothstep(0.019, 0.028, mouthDistance));
      const index = (row * size + column) * 4;
      data[index] = 20;
      data[index + 1] = 20;
      data[index + 2] = 15;
      data[index + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function shadowTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round((1 - smoothstep(0.18, 1, r)) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function acquireResources(): Resources {
  if (shared) {
    shared.users++;
    return shared;
  }
  const torso = new THREE.LatheGeometry([
    [0, 0.44], [0.15, 0.485], [0.235, 0.59], [0.283, 0.735],
    [0.295, 0.91], [0.273, 1.065], [0.225, 1.195], [0.145, 1.285], [0, 1.325],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 22);
  const head = new THREE.SphereGeometry(HEAD_RADIUS, 20, 16);
  const arm = limb(0.07, 0.3, false);
  const leg = limb(0.085, 0.34, true);
  const shirt = new THREE.LatheGeometry([
    [0.3, 0.89], [0.28, 1.065], [0.232, 1.195], [0.151, 1.285], [0, 1.33],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 22);
  const cap = new THREE.SphereGeometry(0.19, 16, 10, 0, TAU, 0, Math.PI * 0.52);
  cap.scale(1, 0.88, 1);
  const bill = new THREE.BoxGeometry(0.285, 0.026, 0.17);
  bill.translate(0, -0.009, 0.12);
  const hat = combine([cap, bill]);
  const geometries: Resources['geometries'] = {
    torso, head, arm, leg, shirt, hat,
    face: new THREE.SphereGeometry(HEAD_RADIUS * 1.009, 20, 14,
      Math.PI / 2 - 0.68, 1.36, 0.68, 1.18),
    shadow: new THREE.PlaneGeometry(1.25, 1.25),
  };
  for (const name of ['torso', 'head', 'arm', 'leg']) {
    geometries[`${name}Outline`] = outlineGeometry(geometries[name]);
  }
  const gradient = new THREE.DataTexture(new Uint8Array([214, 244, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.unpackAlignment = 1;
  gradient.needsUpdate = true;
  const textures: THREE.Texture[] = [gradient];
  const faces = [false, true].map(alert => Array.from({ length: 5 }, (_, index) => {
    const texture = faceTexture(index / 4, alert);
    textures.push(texture);
    return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
      alphaTest: 0.01, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }));
  const shadowMap = shadowTexture();
  textures.push(shadowMap);
  shared = {
    users: 1, geometries, gradient, textures, fills: new Map(), faces,
    ink: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }),
    solid: new THREE.MeshBasicMaterial({ color: INK }),
    shadow: new THREE.MeshBasicMaterial({ map: shadowMap, color: INK, transparent: true,
      opacity: 0.17, depthWrite: false, toneMapped: false }),
  };
  return shared;
}

function releaseResources(resources: Resources): void {
  if (--resources.users !== 0) return;
  for (const geometry of Object.values(resources.geometries)) geometry.dispose();
  for (const material of resources.fills.values()) material.dispose();
  for (const row of resources.faces) for (const material of row) material.dispose();
  for (const texture of resources.textures) texture.dispose();
  resources.ink.dispose();
  resources.solid.dispose();
  resources.shadow.dispose();
  if (shared === resources) shared = undefined;
}

export function createPaperPerson({ seed, variant, color = 0xffffff }: PaperPersonOptions): PaperPerson {
  const resources = acquireResources();
  let fill = resources.fills.get(color);
  if (!fill) {
    fill = new THREE.MeshToonMaterial({ color, gradientMap: resources.gradient });
    resources.fills.set(color, fill);
  }
  // Dark clothing stays unlit and shares one material across the whole crowd.
  const solid = resources.solid;
  const number = Math.abs(Math.trunc(Number.isFinite(seed) ? seed : 0));
  const look = variant ?? (['plain', 'hat', 'shirt'] as const)[number % 3];
  const phaseOffset = ((number * 0.61803398875) % 1) * TAU;
  const group = new THREE.Group();
  group.name = `paper-person-${number}`;
  group.userData.paperPersonHeight = HEIGHT;
  group.userData.paperPersonVariant = look;
  const puppet = new THREE.Group();
  puppet.name = 'puppet';
  group.add(puppet);

  const addOutlined = (parent: THREE.Group, name: string) => {
    const mesh = new THREE.Mesh(resources.geometries[name], fill);
    mesh.name = name;
    mesh.castShadow = true;
    const outline = new THREE.Mesh(resources.geometries[`${name}Outline`], resources.ink);
    outline.name = `${name}-outline`;
    parent.add(mesh, outline);
    return mesh;
  };
  addOutlined(puppet, 'torso');
  const head = new THREE.Group();
  head.name = 'head-pivot';
  head.position.y = 1.44;
  puppet.add(head);
  addOutlined(head, 'head');
  const face = new THREE.Mesh(resources.geometries.face, resources.faces[0][0]);
  face.name = 'face';
  face.renderOrder = 2;
  head.add(face);

  const joint = (name: string, x: number, y: number, part: 'arm' | 'leg') => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, y, 0);
    puppet.add(pivot);
    addOutlined(pivot, part);
    return pivot;
  };
  const leftArm = joint('left-arm-pivot', 0.243, 1.12, 'arm');
  const rightArm = joint('right-arm-pivot', -0.243, 1.12, 'arm');
  const leftLeg = joint('left-leg-pivot', 0.105, 0.58, 'leg');
  const rightLeg = joint('right-leg-pivot', -0.105, 0.58, 'leg');
  if (look === 'hat') {
    const hat = new THREE.Mesh(resources.geometries.hat, solid);
    hat.name = 'hat';
    hat.position.y = 0.155;
    hat.castShadow = true;
    head.add(hat);
  }
  if (look === 'shirt') {
    const shirt = new THREE.Mesh(resources.geometries.shirt, solid);
    shirt.name = 'shirt';
    shirt.castShadow = true;
    puppet.add(shirt);
  }
  const shadow = new THREE.Mesh(resources.geometries.shadow, resources.shadow);
  shadow.name = 'contact-shadow';
  shadow.userData.paperContactShadow = true;
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.renderOrder = -1;
  group.add(shadow);

  let walk = 0;
  let disposed = false;
  const update = ({ time, delta, distance, speed, speaking = false, alert = false }: PaperPersonFrame) => {
    if (disposed) return;
    const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.1);
    const t = Number.isFinite(time) ? time : 0;
    const travelled = Number.isFinite(distance) ? distance : 0;
    const velocity = Math.max(0, Number.isFinite(speed) ? speed : 0);
    walk += (clamp(velocity / 1.3, 0, 1) - walk) * (1 - Math.exp(-dt * 14));
    const phase = travelled * 0.62 * TAU + phaseOffset;
    const swing = Math.sin(phase);
    const idle = Math.sin(t * 1.25 + phaseOffset) * 0.05 * (1 - walk);
    leftLeg.rotation.set(swing * 0.6 * walk, 0, 0.03);
    rightLeg.rotation.set(-swing * 0.6 * walk, 0, -0.03);
    leftArm.rotation.x = -swing * 0.45 * walk + idle;
    rightArm.rotation.x = swing * 0.45 * walk - idle;
    const gesture = speaking ? Math.abs(Math.sin(t * 5.5 + phaseOffset)) * 0.2 : 0;
    leftArm.rotation.z = 0.13 + gesture;
    rightArm.rotation.z = -0.13 - gesture;
    puppet.position.y = Math.abs(swing) * 0.05 * walk
      + Math.sin(t * 1.5 + phaseOffset) * 0.009 * (1 - walk);
    puppet.rotation.z = swing * 0.035 * walk;
    puppet.rotation.x = clamp(velocity / 3, 0, 0.09) * walk;
    head.rotation.x = alert ? -0.32 : 0.18;
    head.rotation.y = Math.sin(t * 0.7 + phaseOffset) * 0.065 * (1 - walk);
    const mouth = speaking ? Math.round(Math.max(0, Math.sin(t * 12 + phaseOffset)) * 4) : 0;
    face.material = resources.faces[alert ? 1 : 0][mouth];
  };
  update({ time: 0, delta: 0, distance: 0, speed: 0 });
  return {
    group, update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      releaseResources(resources);
    },
  };
}
