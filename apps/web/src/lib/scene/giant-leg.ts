import * as THREE from 'three';

export type GiantLegs = {
  group: THREE.Group;
  update(time: number): void;
  dispose(): void;
};

/**
 * Original oversized trousers and dress shoes, built entirely from primitives.
 * Nominal height48; the figure continues above the cover's crop. No model or
 * texture from the reference site is loaded or embedded.
 */
export function createGiantLegs({ height = 48 }: { height?: number } = {}): GiantLegs {
  const group = new THREE.Group();
  group.name = 'oversized-paper-trousers';
  group.position.set(0, 0, -26);
  group.rotation.y = 0.14;
  group.scale.setScalar(height / 48);
  const figure = new THREE.Group();
  group.add(figure);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const inkColor = 0x14140f;
  const gradient = new THREE.DataTexture(new Uint8Array([214, 244, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.unpackAlignment = 1;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  const paper = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient });
  const ink = new THREE.MeshBasicMaterial({ color: inkColor, side: THREE.BackSide });
  const seam = new THREE.LineBasicMaterial({ color: inkColor, transparent: true, opacity: 0.6 });
  const pencil = new THREE.LineBasicMaterial({ color: 0x615f58, transparent: true, opacity: 0.24 });
  materials.add(paper).add(ink).add(seam).add(pencil);

  const outlined = (parent: THREE.Group, geometry: THREE.BufferGeometry, name: string) => {
    geometries.add(geometry);
    geometry.computeVertexNormals();
    const expanded = geometry.clone();
    const position = expanded.getAttribute('position');
    const normal = expanded.getAttribute('normal');
    // Weld duplicate seam vertices before expansion; whole-object scaling would
    // make the ink too thick at the top of these very long trouser legs.
    const normals = new Map<string, THREE.Vector3>();
    const keys: string[] = [];
    for (let i = 0; i < position.count; i++) {
      const key = [position.getX(i), position.getY(i), position.getZ(i)]
        .map(value => Math.round(value * 1e4)).join(',');
      keys.push(key);
      const n = normals.get(key) ?? new THREE.Vector3();
      n.x += normal.getX(i); n.y += normal.getY(i); n.z += normal.getZ(i);
      normals.set(key, n);
    }
    for (const n of normals.values()) n.normalize();
    for (let i = 0; i < position.count; i++) {
      const n = normals.get(keys[i])!;
      position.setXYZ(i, position.getX(i) + n.x * 0.2,
        position.getY(i) + n.y * 0.2, position.getZ(i) + n.z * 0.2);
    }
    position.needsUpdate = true;
    expanded.deleteAttribute('uv');
    geometries.add(expanded);
    const fill = new THREE.Mesh(geometry, paper);
    fill.name = name;
    fill.castShadow = true;
    const edge = new THREE.Mesh(expanded, ink);
    edge.name = `${name}-ink`;
    parent.add(fill, edge);
  };

  const line = (parent: THREE.Group, points: THREE.Vector3[], material = seam) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(50));
    geometries.add(geometry);
    const stroke = new THREE.Line(geometry, material);
    parent.add(stroke);
  };

  // A closed lengthwise surface with an oval upper and a nearly flat sole.
  const shoeRings = [
    { z: -7.8, w: 1.8, h: 2.35 }, { z: -6.8, w: 2.8, h: 3.5 },
    { z: -3.7, w: 3.6, h: 4.65 }, { z: -0.5, w: 4.2, h: 3.8 },
    { z: 2.9, w: 4.4, h: 2.7 }, { z: 5.7, w: 3.9, h: 1.95 },
    { z: 7.5, w: 2.25, h: 1.3 }, { z: 8.05, w: 0.08, h: 0.15 },
  ];
  const shoeSurface = (sole: boolean) => {
    const vertices: number[] = [];
    const indices: number[] = [];
    const segments = 24;
    for (const ring of shoeRings) for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const y = sole ? 0.31 + Math.sin(angle) * 0.25
        : 0.58 + Math.max(0, Math.sin(angle)) * ring.h + Math.min(0, Math.sin(angle)) * 0.12;
      vertices.push(Math.cos(angle) * ring.w, y, ring.z);
    }
    for (let row = 0; row < shoeRings.length - 1; row++) for (let i = 0; i < segments; i++) {
      const a = row * (segments + 1) + i;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    // Seal the ends. The tiny toe ring keeps the front rounded, rather than a box.
    for (const row of [0, shoeRings.length - 1]) {
      const offset = row * (segments + 1);
      for (let i = 1; i < segments - 1; i++) {
        if (row === 0) indices.push(offset, offset + i + 1, offset + i);
        else indices.push(offset, offset + i, offset + i + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
  };

  for (const side of [-1, 1]) {
    const shoe = new THREE.Group();
    shoe.name = side < 0 ? 'left-dress-shoe' : 'right-dress-shoe';
    shoe.position.x = side * 8.5;
    shoe.rotation.y = side * 0.34;
    figure.add(shoe);
    outlined(shoe, shoeSurface(false), 'shoe-upper');
    outlined(shoe, shoeSurface(true), 'shoe-sole');
    // Toe-cap seam, curved vamp seams and a few restrained laces.
    line(shoe, Array.from({ length: 9 }, (_, index) => {
      const angle = index / 8 * Math.PI;
      return new THREE.Vector3(Math.cos(angle) * 4.37, 0.65 + Math.sin(angle) * 2.72, 2.94);
    }));
    for (const edge of [-1, 1]) {
      line(shoe, [new THREE.Vector3(edge * 2.6, 2.9, -6.8),
        new THREE.Vector3(edge * 2.1, 4.65, -3.9), new THREE.Vector3(edge * 1.7, 4.1, -1.3),
        new THREE.Vector3(edge * 3.3, 2.5, 2.6)]);
    }
    for (let i = 0; i < 4; i++) {
      const z = -2.7 + i * 0.75;
      line(shoe, [new THREE.Vector3(-1.2, 4.72 - i * 0.19, z - 0.18),
        new THREE.Vector3(0, 4.82 - i * 0.19, z),
        new THREE.Vector3(1.2, 4.72 - i * 0.19, z + 0.18)]);
    }

    // Slightly tapered, soft elliptical trouser tubes. They join outside the
    // usual cover crop, leaving the enormous scale legible at the ankle.
    const legLevels = [
      { y: 4.7, x: 6.2, z: -4, rx: 3.15, rz: 3.8 },
      { y: 7.5, x: 6.2, z: -4, rx: 3.4, rz: 4 },
      { y: 13, x: 6.15, z: -3.75, rx: 3.3, rz: 4 },
      { y: 24, x: 5.9, z: -3.3, rx: 3.8, rz: 4.45 },
      { y: 36, x: 5.3, z: -2.7, rx: 4.7, rz: 5.1 },
      { y: 48, x: 4.9, z: -2, rx: 4.9, rz: 5.6 },
    ];
    const vertices: number[] = [];
    const indices: number[] = [];
    const radial = 28;
    for (const level of legLevels) for (let j = 0; j <= radial; j++) {
      const angle = j / radial * Math.PI * 2;
      vertices.push(side * level.x + Math.cos(angle) * level.rx,
        level.y, level.z + Math.sin(angle) * level.rz);
    }
    for (let row = 0; row < legLevels.length - 1; row++) for (let j = 0; j < radial; j++) {
      const a = row * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const legGeometry = new THREE.BufferGeometry();
    legGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    legGeometry.setIndex(indices);
    outlined(figure, legGeometry, side < 0 ? 'left-trouser-leg' : 'right-trouser-leg');

    const cuff = new THREE.TorusGeometry(3.57, 0.62, 10, 36);
    cuff.rotateX(Math.PI / 2);
    cuff.scale(1, 1.05, 1.18);
    cuff.translate(side * 6.2, 7.15, -4);
    outlined(figure, cuff, 'rolled-cuff');

    // Fine vertical pinstripes use one line-segment batch per leg. Small
    // deterministic waviness gives a pencil quality without a copied texture.
    const stripes: THREE.Vector3[] = [];
    for (let stripe = 0; stripe < 24; stripe++) {
      const angle = stripe / 24 * Math.PI * 2;
      for (let row = 0; row < legLevels.length - 1; row++) {
        for (let step = 0; step < 6; step++) {
          for (const fraction of [step / 6, (step + 1) / 6]) {
            const a = legLevels[row]; const b = legLevels[row + 1];
            const y = THREE.MathUtils.lerp(a.y, b.y, fraction);
            const rx = THREE.MathUtils.lerp(a.rx, b.rx, fraction) + 0.025;
            const rz = THREE.MathUtils.lerp(a.rz, b.rz, fraction) + 0.025;
            const jitter = Math.sin(y * 1.7 + stripe * 3.9) * 0.025;
            stripes.push(new THREE.Vector3(side * THREE.MathUtils.lerp(a.x, b.x, fraction)
              + Math.cos(angle) * rx + jitter, y,
              THREE.MathUtils.lerp(a.z, b.z, fraction) + Math.sin(angle) * rz));
          }
        }
      }
    }
    const stripeGeometry = new THREE.BufferGeometry().setFromPoints(stripes);
    geometries.add(stripeGeometry);
    figure.add(new THREE.LineSegments(stripeGeometry, pencil));
  }

  let disposed = false;
  return {
    group,
    update(time: number) {
      if (disposed) return;
      // Barely perceptible weight shift, keeping both shoes planted.
      const t = Number.isFinite(time) ? time : 0;
      figure.rotation.z = Math.sin(t * 0.21) * 0.004;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      gradient.dispose();
    },
  };
}
