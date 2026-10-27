import { Box3, BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Matrix4, MeshStandardMaterial,
  Quaternion, SkinnedMesh, SphereGeometry, Uint16BufferAttribute, Vector3, type BufferGeometry, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Local, authored low-poly beach guests. Only the bind skeleton is reused from G24;
 * no helmet, visor, backpack, jacket or player mesh is retained. One skinned draw per guest. */
export function createClubGuestAppearance(scene: Object3D, variant: 0 | 1) {
  const originals: SkinnedMesh[] = [];
  scene.traverse(o => { if (o instanceof SkinnedMesh) originals.push(o); });
  const skeleton = originals[0]?.skeleton;
  if (!skeleton) throw new Error('Club guest requires a bind skeleton');
  skeleton.pose(); scene.updateMatrixWorld(true);
  const lookup = new Map(skeleton.bones.map((b, i) => [b.name.replace(/[._]/g, ''), { bone: b, i }]));
  const joint = (name: string) => {
    const entry = lookup.get(name); if (!entry) throw new Error(`Club guest missing ${name}`);
    return scene.worldToLocal(entry.bone.getWorldPosition(new Vector3()));
  };
  // Measure the loaded player's bind vertices, not a second independently guessed
  // humanoid. X is depth/front and Z is shoulder width in this asset's frame.
  const sourcePoints: { p: Vector3; bone: string; material: string }[] = [];
  for (const original of originals) {
    const p = original.geometry.getAttribute('position'), ids = original.geometry.getAttribute('skinIndex');
    const weights = original.geometry.getAttribute('skinWeight');
    const material = Array.isArray(original.material) ? original.material[0] : original.material;
    for (let i = 0; i < p.count; i++) {
      let strongest = 0;
      for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, strongest)) strongest = k;
      sourcePoints.push({ p: scene.worldToLocal(new Vector3().fromBufferAttribute(p, i).applyMatrix4(original.matrixWorld)),
        bone: skeleton.bones[ids.getComponent(i, strongest)].name.replace(/[._]/g, ''), material: material.name });
    }
  }
  const bounds = (filter: (p: typeof sourcePoints[number]) => boolean) => {
    const points = sourcePoints.filter(filter);
    if (!points.length) throw new Error('Club guest requires the G24 body envelope');
    return new Box3().setFromPoints(points.map(p => p.p));
  };
  const headBounds = bounds(p => p.material === 'guide_helmet_metal');
  const bodyBounds = bounds(p => p.material === 'guide_jacket_paint');
  const headSize = headBounds.getSize(new Vector3()), bodySize = bodyBounds.getSize(new Vector3());
  const radius = (bone: string, end: string) => {
    const a = joint(bone), axis = joint(end).sub(a), length = axis.length(); axis.normalize();
    const distances = sourcePoints.filter(p => p.bone === bone).map(({ p }) => {
      const offset = p.clone().sub(a), along = offset.dot(axis);
      return { along: along / length, r: offset.addScaledVector(axis, -along).length() };
    }).filter(p => p.along > .15 && p.along < .85).map(p => p.r).sort((a, b) => a - b);
    if (!distances.length) throw new Error(`Club guest missing ${bone} envelope`);
    return distances[Math.floor((distances.length - 1) * .8)];
  };
  const sourceFrame = { headWidth: headSize.z, headHeight: headSize.y, torsoWidth: bodySize.z,
    shoulderSpan: joint('upperarmL').distanceTo(joint('upperarmR')),
    // G24's broad shoulder sits near the root of the sleeve; middle-only
    // sampling misses it. Preserve at least 92% of its actual depth envelope.
    upperArmRadius: Math.max(radius('upperarmL', 'forearmL'), bounds(p => p.bone === 'upperarmL').getSize(new Vector3()).x * .46),
    forearmRadius: radius('forearmL', 'handL'),
    thighRadius: radius('thighL', 'shinL'), calfRadius: radius('shinL', 'footL') };
  const palette = variant === 0
    ? { skin: '#a86840', hair: '#302622', top: '#79aca1', bottom: '#3e554a', shoes: '#e8dfc9', trim: '#ebc66c' }
    : { skin: '#d6a480', hair: '#3a2920', top: '#d8dfce', bottom: '#345166', shoes: '#e3cda4', trim: '#735a39' };
  const pieces: BufferGeometry[] = [], parts: string[] = [], partRanges: { name: string; start: number; count: number }[] = [];
  let vertexCount = 0;
  const spineY = joint('spine').y, chestY = joint('chest').y;
  const add = (geometry: BufferGeometry, color: string, boneName: string, partName: string, torso = false) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    const p = g.getAttribute('position'), ids = new Uint16Array(p.count * 4), weights = new Float32Array(p.count * 4), colors = new Float32Array(p.count * 3);
    const c = new Color(color), entry = lookup.get(boneName);
    if (!entry) { g.dispose(); throw new Error(`Club guest missing ${boneName}`); }
    for (let i = 0; i < p.count; i++) {
      ids[i * 4] = entry.i; weights[i * 4] = 1;
      if (torso) {
        const y = p.getY(i), t = Math.max(0, Math.min(1, (y - spineY) / (chestY - spineY)));
        ids[i * 4] = lookup.get('spine')!.i; ids[i * 4 + 1] = lookup.get('chest')!.i;
        weights[i * 4] = 1 - t; weights[i * 4 + 1] = t;
      }
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('skinIndex', new Uint16BufferAttribute(ids, 4));
    g.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    pieces.push(g); parts.push(partName); partRanges.push({ name: partName, start: vertexCount, count: p.count }); vertexCount += p.count;
  };
  const oval = (center: Vector3, size: [number, number, number], color: string, bone: string, part: string, segments = 10, rings = 6) => {
    add(new SphereGeometry(1, segments, rings).scale(...size).translate(center.x, center.y, center.z), color, bone, part);
  };
  const box = (center: Vector3, size: [number, number, number], color: string, bone: string, part: string) =>
    add(new BoxGeometry(...size).translate(center.x, center.y, center.z), color, bone, part);
  const segment = (a: Vector3, b: Vector3, radiusA: number, radiusB: number, color: string, bone: string, part: string) => {
    const d = b.clone().sub(a), middle = a.clone().add(b).multiplyScalar(.5);
    add(new CylinderGeometry(radiusB, radiusA, d.length(), 8).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()))
      .translate(middle.x, middle.y, middle.z), color, bone, part);
  };
  let merged: BufferGeometry | null = null;
  try {
    const head = joint('head'), pelvis = joint('pelvis');
    const shoulderWidth = sourceFrame.torsoWidth * (variant === 0 ? .53 : .56);
    const shirtTop = joint('neck').y + .015, shirtBottom = bodyBounds.min.y;
    const shirt = new CylinderGeometry(.88, 1, shirtTop - shirtBottom, 8, 3)
      .scale(bodySize.x * .51, 1, shoulderWidth).translate(.008, (shirtTop + shirtBottom) * .5, 0);
    add(shirt, palette.top, 'spine', variant === 0 ? 'sleeveless-seaglass-top' : 'loose-linen-shirt', true);
    oval(pelvis.clone().add(new Vector3(0, -.015, 0)), [bodySize.x * .48, .105, shoulderWidth * .96], palette.bottom, 'pelvis', 'waist');
    // A short, thick collar overlaps both torso and chin. No realistic exposed neck.
    segment(joint('neck').add(new Vector3(0, -.025, 0)), head.clone().add(new Vector3(0, .035, 0)), .095, .10, palette.skin, 'neck', 'tucked-neck');
    const face = headBounds.getCenter(new Vector3()).add(new Vector3(.008, -.005, 0));
    const faceX = headSize.x * .47, faceY = headSize.y * .49, faceZ = headSize.z * .48;
    oval(face, [faceX, faceY, faceZ], palette.skin, 'head', 'bare-face', 16, 10);
    for (const z of [-faceZ * .36, faceZ * .36]) {
      oval(face.clone().add(new Vector3(faceX * .94, .025, z)), [.013, .026, .016], '#242321', 'head', 'eye', 6);
      box(face.clone().add(new Vector3(faceX * .93, .069, z)), [.014, .018, .057], palette.hair, 'head', 'brow');
    }
    oval(face.clone().add(new Vector3(faceX, -.025, 0)), [.036, .040, .035], palette.skin, 'head', 'nose', 6);
    box(face.clone().add(new Vector3(faceX * .93, -.10, 0)), [.014, .014, .067], '#734c3c', 'head', 'mouth');
    for (const s of [-1, 1]) oval(face.clone().add(new Vector3(-.005, -.02, s * faceZ)), [.05, .065, .028], palette.skin, 'head', 'ear', 6);
    if (variant === 0) {
      // Short curls frame a fully visible face; an asymmetric tuft reads from the back too.
      for (let i = 0; i < 9; i++) {
        const angle = i / 9 * Math.PI * 2;
        oval(face.clone().add(new Vector3(Math.cos(angle) * faceX * .64 - .025, faceY * .78 + (i % 2) * .012, Math.sin(angle) * faceZ * .72)),
          [.105, .070, .095], palette.hair, 'head', 'curly-hair', 7);
      }
      oval(face.clone().add(new Vector3(-faceX * .65, .065, 0)), [.11, .18, faceZ * .98], palette.hair, 'head', 'back-hair');
    } else {
      oval(face.clone().add(new Vector3(-faceX * .60, .07, 0)), [.12, .18, faceZ * .99], palette.hair, 'head', 'cropped-hair');
      const hat = face.clone().add(new Vector3(-.012, faceY * .88, 0));
      add(new CylinderGeometry(faceZ * .80, faceZ * .93, .11, 10).translate(hat.x, hat.y, hat.z), '#c5a56b', 'head', 'straw-bucket-hat');
      add(new CylinderGeometry(faceZ * 1.29, faceZ * 1.29, .026, 12).translate(hat.x, hat.y - .055, hat.z), '#c5a56b', 'head', 'wide-hat-brim');
      add(new CylinderGeometry(faceZ * .92, faceZ * .92, .027, 10).translate(hat.x, hat.y - .027, hat.z), palette.trim, 'head', 'hat-band');
    }
    for (const side of ['L', 'R']) {
      const shoulder = joint('upperarm' + side), elbow = joint('forearm' + side), wrist = joint('hand' + side);
      const arm = sourceFrame.upperArmRadius * .96, forearm = sourceFrame.forearmRadius;
      // Overlapping joint volumes rotate about the exact bind pivots. Sleeve roots
      // share the arm's bone and intersect the torso, including in raised poses.
      oval(shoulder, [arm, arm, arm], variant ? palette.top : palette.skin, 'upperarm' + side, 'shoulder');
      segment(shoulder, elbow, arm, forearm, palette.skin, 'upperarm' + side, 'upper-arm');
      if (variant === 1) segment(shoulder, shoulder.clone().lerp(elbow, .50), arm * 1.05, arm * .92, palette.top, 'upperarm' + side, 'short-sleeve');
      oval(elbow, [forearm, forearm, forearm], palette.skin, 'forearm' + side, 'elbow');
      segment(elbow, wrist, forearm, forearm * .76, palette.skin, 'forearm' + side, 'forearm');
      const hand = wrist.clone().addScaledVector(wrist.clone().sub(elbow).normalize(), .043);
      oval(wrist, [forearm * .77, forearm * .77, forearm * .77], palette.skin, 'hand' + side, 'wrist');
      oval(hand, [.047, .06, .045], palette.skin, 'hand' + side, 'bare-hand');
      const hip = joint('thigh' + side), knee = joint('shin' + side), ankle = joint('foot' + side);
      const thigh = sourceFrame.thighRadius, calf = sourceFrame.calfRadius;
      oval(hip, [thigh, thigh, thigh], palette.bottom, 'thigh' + side, 'hip');
      if (variant === 0) {
        segment(hip, knee, thigh, calf, palette.skin, 'thigh' + side, 'exposed-thigh');
        segment(hip, hip.clone().lerp(knee, .58), thigh * 1.04, thigh, palette.bottom, 'thigh' + side, 'olive-shorts');
        segment(knee, ankle, calf, calf * .76, palette.skin, 'shin' + side, 'bare-calf');
      } else {
        segment(hip, knee, thigh * 1.04, calf * 1.03, palette.bottom, 'thigh' + side, 'navy-trouser-upper');
        segment(knee, ankle, calf * 1.03, calf * .80, palette.bottom, 'shin' + side, 'navy-trouser-lower');
      }
      oval(knee, [calf * 1.04, calf * 1.04, calf * 1.04], variant ? palette.bottom : palette.skin, 'shin' + side, 'knee');
      segment(ankle, ankle.clone().add(new Vector3(0, -.04, 0)), calf * .78, calf * .79, palette.skin, 'foot' + side, 'ankle');
      const shoe = new Vector3(.025, .038, ankle.z);
      box(shoe, [.24, .074, .17], palette.shoes, 'foot' + side, 'trainer');
      box(shoe.clone().add(new Vector3(0, -.026, 0)), [.245, .022, .176], '#f1eadb', 'foot' + side, 'trainer-sole');
    }
    merged = mergeGeometries(pieces, false);
    if (!merged) throw new Error('Club guest mesh merge failed');
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: .88, flatShading: true });
    material.name = `club-guest-${variant}-cloth-and-skin`;
    const mesh = new SkinnedMesh(merged, material);
    mesh.name = variant === 0 ? 'club-guest-curly-shorts' : 'club-guest-bucket-linen';
    mesh.bind(skeleton, new Matrix4()); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.userData = { role: 'ambient-club-guest', appearance: variant, parts, partRanges, sourceFrame, reusedPlayerGeometry: false };
    scene.add(mesh); originals.forEach(original => original.removeFromParent());
    pieces.forEach(g => g.dispose());
    return { mesh, scale: variant === 0 ? .98 : 1.01, triangles: merged.getAttribute('position').count / 3, parts,
      dispose: () => { mesh.removeFromParent(); merged!.dispose(); material.dispose(); } };
  } catch (error) { pieces.forEach(g => g.dispose()); merged?.dispose(); throw error; }
}
