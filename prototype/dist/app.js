import * as THREE from 'three';

/* ============================================================
 * Europe 1year — globe + routes v3
 * - 평소엔 자유 지구본 (드래그/줌 항상 가능, 애니메이션은 1회성)
 * - 선은 화면 기준 얇게 (카메라 거리 비례 보정 + 이중선)
 * - 링(원) 완전 삭제, 마커는 화면 고정 크기 점만
 * - wall-clock 재생 (탭 복귀 튐 방지), 재생 중 입력하면 즉시 중단 후 자유 조작
 * ============================================================ */

const $ = (id) => document.getElementById(id);
const R = 2;
const clamp = THREE.MathUtils.clamp;
const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const rad = Math.PI / 180;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const places = {
  icn: { name: '인천', ll: [126.45, 37.46] },
  bcn: { name: '바르셀로나', ll: [2.149, 41.375] },
  mon: { name: '몬세라트', ll: [1.838, 41.593] },
  lis: { name: '리스본', ll: [-9.139, 38.722] },
  cas: { name: '카사블랑카', ll: [-7.591, 33.590] },
  rab: { name: '라바트', ll: [-6.858, 33.992] },
  tan: { name: '탕헤르', ll: [-5.787, 35.771] },
  alg: { name: '알헤시라스', ll: [-5.434, 36.126] },
  mlg: { name: '말라가', ll: [-4.421, 36.721] },
};

const montserrat = [[2.149,41.375],[2.037,41.348],[2.008,41.396],[1.918,41.486],[1.892,41.545],[1.861,41.592],[1.851,41.612],[1.838,41.593]];
const rabat = [[-7.591,33.590],[-7.385,33.684],[-7.159,33.789],[-7.040,33.852],[-6.921,33.921],[-6.858,33.992]];
const tangier = [[-6.858,33.992],[-6.792,34.075],[-6.578,34.251],[-6.480,34.520],[-6.160,34.930],[-6.120,35.150],[-5.990,35.470],[-5.880,35.650],[-5.787,35.771]];
const crossing = [[-5.787,35.771],[-5.798,35.804],[-5.755,35.872],[-5.590,35.985],[-5.460,36.052],[-5.434,36.126]];
const algecirasMalaga = [[-5.434,36.126],[-5.28,36.02],[-5.05,36.01],[-4.85,36.12],[-4.62,36.45],[-4.421,36.721]];

const legs = [
  { from:'icn', to:'bcn', mode:'flight', duration:9 },
  { from:'bcn', to:'mon', mode:'train', duration:7, waypoints:montserrat },
  { from:'mon', to:'bcn', mode:'train', duration:7, waypoints:[...montserrat].reverse() },
  { from:'bcn', to:'lis', mode:'flight', duration:7 },
  { from:'lis', to:'cas', mode:'flight', duration:7 },
  { from:'cas', to:'rab', mode:'train', duration:7, waypoints:rabat },
  { from:'rab', to:'tan', mode:'train', duration:7, waypoints:tangier },
  { from:'tan', to:'alg', mode:'ferry', duration:8, waypoints:crossing },
  { from:'alg', to:'mlg', mode:'car', duration:7, waypoints:algecirasMalaga },
];

const MODE = {
  flight: { name:'비행', color:'#dd7743' },
  train:  { name:'기차', color:'#7f63d8' },
  ferry:  { name:'페리', color:'#1f9e86' },
  car:    { name:'택시', color:'#c99a3c' },
};
const HALO = '#fdfaff';

function geo([lon, lat], radius = R) {
  return new THREE.Vector3(
    Math.cos(lat * rad) * Math.cos(lon * rad),
    Math.sin(lat * rad),
    -Math.cos(lat * rad) * Math.sin(lon * rad)
  ).multiplyScalar(radius);
}
function slerp(a, b, t) {
  const angle = Math.acos(clamp(a.dot(b), -1, 1));
  if (angle < 0.00001) return a.clone().lerp(b, t).normalize();
  return a.clone().multiplyScalar(Math.sin((1 - t) * angle) / Math.sin(angle))
    .addScaledVector(b, Math.sin(t * angle) / Math.sin(angle)).normalize();
}

class TravelCurve extends THREE.Curve {
  constructor(leg) {
    super();
    this.leg = leg;
    this.a = geo(places[leg.from].ll, 1);
    this.b = geo(places[leg.to].ll, 1);
    this.angle = this.a.angleTo(this.b);
    this.arcLengthDivisions = 600;
    this.peak = leg.mode === 'flight' ? clamp(this.angle * 0.45, 0.055, 0.65) : 0;
    if (leg.waypoints) this.ground = new THREE.CatmullRomCurve3(leg.waypoints.map((ll) => new THREE.Vector3(ll[0], ll[1], 0)), false, 'centripetal');
  }
  getPoint(t, target = new THREE.Vector3()) {
    t = clamp(t, 0, 1);
    let normal;
    if (this.ground) { const p = this.ground.getPoint(t); normal = geo([p.x, p.y], 1); }
    else normal = slerp(this.a, this.b, t);
    const lift = this.peak > 0 ? (1 - Math.cos(Math.PI * 2 * t)) * 0.5 : 0;
    // 지상 노선은 표면 위로 살짝 띄워 지구 곡률에 묻히지 않게 함
    const hug = this.peak > 0 ? 0 : 0.004;
    return target.copy(normal).multiplyScalar(R + lift * this.peak + 0.0015 + hug);
  }
}

/* ---------- 얇은 이중선: 밝은 밑선 + 진한 윗선, 굵기는 화면 기준 보정 ---------- */
function lineMaterial(colorHex, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      radius: { value: 0.0015 },
      color: { value: new THREE.Color(colorHex) },
      opacity: { value: opacity },
      head: { value: 0 },
    },
    vertexShader: 'uniform float radius; attribute float routeT; varying float vT; varying float vLight; void main(){ vT = routeT; vLight = .82 + .18 * abs(dot(normal, normalize(vec3(.4, 1., 1.)))); gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * radius, 1.); }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; uniform float head; varying float vT; varying float vLight; void main(){ if (vT > head + .001) discard; gl_FragColor = vec4(color * vLight, opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false,
  });
}

function makeTrail(curve, colorHex) {
  const segments = 360, sides = 6;
  const centers = [], normals = [], times = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const f = curve.getTangentAt(clamp(t, 0.0001, 0.9999));
    const up = p.clone().normalize();
    const right = new THREE.Vector3().crossVectors(f, up).normalize();
    const normal = new THREE.Vector3().crossVectors(right, f).normalize();
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const n = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(normal, Math.sin(a));
      centers.push(...p.toArray()); normals.push(...n.toArray()); times.push(t);
      if (i < segments) {
        const q = i * sides + j, r = i * sides + ((j + 1) % sides);
        const s = (i + 1) * sides + j, u = (i + 1) * sides + ((j + 1) % sides);
        indices.push(q, r, s, r, u, s);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(centers, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('routeT', new THREE.Float32BufferAttribute(times, 1));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 1);
  const haloMat = lineMaterial(HALO, 0.35);
  const coreMat = lineMaterial(colorHex, 0.95);
  const halo = new THREE.Mesh(geometry, haloMat); halo.frustumCulled = false;
  const core = new THREE.Mesh(geometry, coreMat); core.frustumCulled = false;
  const indexCount = segments * sides * 6;
  return {
    halo, core, geometry, haloMat, coreMat, segments, sides,
    setProgress(p) {
      const n = Math.floor(clamp(p, 0, 1) * segments) * sides * 6;
      geometry.setDrawRange(0, p >= 1 ? indexCount : n);
      haloMat.uniforms.head.value = p; coreMat.uniforms.head.value = p;
    },
    // 화면상 같은 굵기로 보이게: 카메라 거리에 비례
    setRadius(r) { haloMat.uniforms.radius.value = r * 2.3; coreMat.uniforms.radius.value = r; },
    setStyle(coreOpacity, haloOpacity, dimmed) {
      coreMat.uniforms.opacity.value = coreOpacity;
      haloMat.uniforms.opacity.value = haloOpacity;
      coreMat.uniforms.color.value.set(colorHex).multiplyScalar(dimmed ? 0.55 : 1);
    },
  };
}

/* ---------- 탈것 모형 ---------- */
const materials = {
  body: new THREE.MeshStandardMaterial({ color: '#f6efe4', roughness: 0.5 }),
  trim: new THREE.MeshStandardMaterial({ color: '#c26a52', roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: '#3c5a66', roughness: 0.35 }),
  wing: new THREE.MeshStandardMaterial({ color: '#ded8cf', roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: '#4c5a63', roughness: 0.65 }),
  blue: new THREE.MeshStandardMaterial({ color: '#5f8b94', roughness: 0.55 }),
  taxi: new THREE.MeshStandardMaterial({ color: '#2e2a33', roughness: 0.5 }),
};
function mesh(g, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); return m; }
function box(w, h, d, mat, x = 0, y = 0, z = 0) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
function ball(x, y, z, mat, px = 0, py = 0, pz = 0) { const m = mesh(new THREE.SphereGeometry(1, 20, 12), mat, px, py, pz); m.scale.set(x, y, z); return m; }
function wingShape(points, thickness, mat, y = 0) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, steps: 1 });
  g.rotateX(Math.PI / 2);
  return mesh(g, mat, 0, y, 0);
}
function makePlane() {
  const g = new THREE.Group();
  const profile = [new THREE.Vector2(0.008,-0.61),new THREE.Vector2(0.043,-0.50),new THREE.Vector2(0.09,-0.25),new THREE.Vector2(0.095,0.23),new THREE.Vector2(0.07,0.46),new THREE.Vector2(0.035,0.57),new THREE.Vector2(0,0.62)];
  const body = new THREE.LatheGeometry(profile, 24); body.rotateX(Math.PI / 2);
  g.add(mesh(body, materials.body));
  g.add(wingShape([[-0.08,0.18],[-0.64,-0.2],[-0.66,-0.31],[-0.11,-0.16],[0.11,-0.16],[0.66,-0.31],[0.64,-0.2],[0.08,0.18]], 0.019, materials.wing, -0.015));
  g.add(wingShape([[-0.035,-0.37],[-0.26,-0.54],[-0.27,-0.61],[0.27,-0.61],[0.26,-0.54],[0.035,-0.37]], 0.012, materials.body, 0.025));
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.59, 0.02); finShape.lineTo(-0.56, 0.31); finShape.lineTo(-0.43, 0.32); finShape.lineTo(-0.25, 0.015); finShape.closePath();
  const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.018, bevelEnabled: false }); fin.rotateY(-Math.PI / 2);
  g.add(mesh(fin, materials.trim, 0.009, 0, 0));
  g.add(ball(0.064, 0.034, 0.1, materials.glass, 0, 0.068, 0.39));
  return g;
}
function makeTrainCar(front = false) {
  const g = new THREE.Group();
  g.add(box(0.20, 0.16, 0.43, materials.body, 0, 0.1, 0));
  g.add(ball(0.1, 0.075, 0.225, materials.body, 0, 0.17, 0));
  g.add(box(0.206, 0.038, 0.435, materials.trim, 0, 0.068, 0));
  g.add(box(0.15, 0.035, 0.36, materials.dark, 0, 0.012, 0));
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) g.add(box(0.006, 0.05, 0.063, materials.glass, side * 0.102, 0.135, -0.145 + i * 0.095));
  if (front) {
    g.add(ball(0.095, 0.084, 0.10, materials.body, 0, 0.10, 0.20));
    g.add(box(0.142, 0.042, 0.013, materials.glass, 0, 0.147, 0.268));
  }
  for (const z of [-0.14, 0.14]) for (const x of [-0.102, 0.102]) {
    const w = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 12), materials.dark, x, 0.025, z);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  return g;
}
function makeFerry() {
  const g = new THREE.Group();
  g.add(ball(0.20, 0.09, 0.48, materials.blue, 0, 0.01, 0));
  g.add(box(0.33, 0.11, 0.63, materials.body, 0, 0.095, -0.035));
  g.add(box(0.27, 0.085, 0.49, materials.body, 0, 0.19, -0.035));
  g.add(box(0.25, 0.065, 0.15, materials.body, 0, 0.262, 0.11));
  g.add(box(0.255, 0.027, 0.055, materials.glass, 0, 0.265, 0.19));
  g.add(box(0.095, 0.13, 0.10, materials.trim, 0, 0.285, -0.17));
  return g;
}
function makeCar() {
  const g = new THREE.Group();
  g.add(box(0.24, 0.09, 0.52, materials.body, 0, 0.10, 0));
  g.add(box(0.20, 0.075, 0.28, materials.glass, 0, 0.165, -0.02));
  g.add(box(0.245, 0.028, 0.06, materials.trim, 0, 0.10, 0.20));
  for (const z of [-0.17, 0.17]) for (const x of [-0.115, 0.115]) {
    const w = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 14), materials.taxi, x, 0.042, z);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  return g;
}

/* ---------- 상태: 평소엔 자유 지구본, 애니메이션은 1회성 ---------- */
const stage = $('globe-stage');
let renderer, scene, camera, planet;
let ready = false, legIndex = 0, dirty = true, overview = true, drag = null;
let phase = 'overview';           // overview | move | play | arrived
let playT0 = 0, playDurMs = 7000, holdE = 1;
let pausedByHidden = false, hiddenAt = 0;
let transition = null, lastTime = 0;
let frameWidth = 1, frameHeight = 1;
const trailObjects = [], markerObjects = [];
const plane = makePlane(), ferry = makeFerry(), car = makeCar();
const trainCars = [makeTrainCar(true), makeTrainCar(false), makeTrainCar(false)];
let headGlow = null, smoothScale = 0.05;
const cameraTarget = new THREE.Vector3();

function patchGeometry(w, s, e, n, segments = 128) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let y = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) {
    const u = x / segments, v = y / segments;
    const p = geo([w + (e - w) * u, s + (n - s) * v], R + 0.000035);
    positions.push(...p.toArray()); normals.push(...p.clone().normalize().toArray()); uvs.push(u, v);
    if (y < segments && x < segments) { const a = y * (segments + 1) + x, b = a + 1, c = a + segments + 1, d = c + 1; indices.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function initialize() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('globe'), alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, 0.001, 50);

    scene.add(new THREE.HemisphereLight(0xd9ccff, 0x2a2138, 1.55));
    const sun = new THREE.DirectionalLight(0xffe9d2, 2.3); sun.position.set(7, 8, 8); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9a7fe8, 1.1); rim.position.set(-8, 2, -6); scene.add(rim);

    const loader = new THREE.TextureLoader();
    const maps = await Promise.all(['globe-color-8192.png', 'globe-patch-iberia-morocco.png', 'globe-patch-barcelona.png'].map((f) => loader.loadAsync('./assets/' + f)));
    maps.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
    const globeMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, color: 0xcdbfe8 });
    planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 192), globeMat(maps[0]));
    scene.add(planet);
    const regional = new THREE.Mesh(patchGeometry(-12, 30, 5, 45), globeMat(maps[1])); regional.renderOrder = 1; scene.add(regional);
    const localGeometry = patchGeometry(0, 40, 4, 43, 96); localGeometry.scale(1.000008, 1.000008, 1.000008);
    const local = new THREE.Mesh(localGeometry, globeMat(maps[2])); local.renderOrder = 2; scene.add(local);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.03, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { glow: { value: new THREE.Color('#a584f0') } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 glow; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1. - abs(dot(normalize(vN), normalize(vV))), 3.2); gl_FragColor = vec4(glow, 1.) * rim * .55;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      })
    );
    atmo.renderOrder = 5; scene.add(atmo);

    legs.forEach((leg) => {
      leg.curve = new TravelCurve(leg);
      leg.length = leg.curve.getLength();
      leg.angle = leg.curve.angle;
      const trail = makeTrail(leg.curve, MODE[leg.mode].color);
      scene.add(trail.halo, trail.core); trailObjects.push(trail);
    });

    // 마커: 링 없음. 화면 고정 크기의 작은 점만.
    for (const [id, p] of Object.entries(places)) {
      const dot = mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x9d8fc2 }));
      const normal = geo(p.ll, 1);
      dot.position.copy(normal).multiplyScalar(R + 0.002);
      scene.add(dot);
      const label = document.createElement('div');
      label.className = 'map-label';
      label.textContent = p.name;
      $('map-labels').append(label);
      markerObjects.push({ id, dot, label, normal });
    }

    scene.add(plane, ferry, car);
    trainCars.forEach((c) => scene.add(c));
    plane.visible = ferry.visible = car.visible = false;
    trainCars.forEach((c) => (c.visible = false));

    headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    headGlow.scale.setScalar(0.03); headGlow.visible = false; scene.add(headGlow);

    new ResizeObserver(resize).observe(stage);
    resize();
    buildNav();
    // 첫 화면: 자유 지구본 (자동재생 없음)
    const n = geo([16, 40], 1);
    camera.position.copy(n.multiplyScalar(5.6));
    cameraTarget.set(0, 0, 0); camera.up.set(0, 1, 0); camera.lookAt(cameraTarget);
    overview = true; phase = 'overview'; holdE = 1;
    ready = true;
    $('loading').classList.add('done');
    updateNav(); updateScene(1, performance.now()); updateLabels();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  } catch (error) {
    console.error('Globe initialization failed', error);
    $('loading').hidden = true; $('map-error').hidden = false;
  }
}

function resize() {
  frameWidth = stage.clientWidth; frameHeight = stage.clientHeight;
  renderer.setSize(frameWidth, frameHeight, false);
  camera.aspect = frameWidth / frameHeight; camera.updateProjectionMatrix();
  dirty = true;
}

/* ---------- 프레이밍 밴드: 지상은 절대 바짝 안 들어감 ---------- */
function bandFor(leg) {
  if (leg.mode === 'flight') return { alt: clamp(leg.angle * 2.0, 0.95, 2.4), descend: 0.25 };
  if (leg.mode === 'ferry') return { alt: clamp(leg.length * 2.2, 0.40, 0.62), descend: 0 };
  return { alt: clamp(leg.length * 1.7, 0.32, 0.55), descend: 0 };
}

function getPose(leg, e) {
  e = clamp(e, 0, 1);
  const { alt, descend } = bandFor(leg);
  let focus;
  if (leg.mode === 'flight') {
    focus = slerp(leg.curve.a, leg.curve.b, 0.5 + (e - 0.5) * 0.5);
    const arrival = smoother(clamp((e - 0.7) / 0.3, 0, 1));
    return aim(focus, alt * (1 - descend * arrival));
  }
  const mid = leg.curve.getPointAt(0.5).normalize();
  const here = leg.curve.getPointAt(e).normalize();
  focus = mid.clone().lerp(here, 0.35).normalize();
  return aim(focus, alt);
}

function aim(focus, altitude) {
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(focus, -focus.y).normalize();
  const east = new THREE.Vector3().crossVectors(north, focus).normalize();
  const target = focus.clone().multiplyScalar(R);
  const position = focus.clone().multiplyScalar(R + altitude)
    .addScaledVector(north, -altitude * 0.30).addScaledVector(east, altitude * 0.13);
  return { position, target, up: north };
}

function beginTransition(pose, duration, onComplete) {
  transition = {
    t0: performance.now(), duration: reduced ? 0 : duration,
    from: camera.position.clone(), fromTarget: cameraTarget.clone(), fromUp: camera.up.clone(),
    ...pose, onComplete,
  };
  dirty = true;
}

function rawProgress(now) {
  if (phase !== 'play') return holdE;
  return clamp((now - playT0) / playDurMs, 0, 1);
}
function travelEased(now) {
  const p = rawProgress(now);
  return smoother(clamp((p - 0.055) / 0.87, 0, 1));
}

/* ---------- 1회성 애니메이션: 보고 나면 자유 지구본으로 복귀 ---------- */
function setLeg(i) {
  legIndex = clamp(i, 0, legs.length - 1);
  overview = false; holdE = 0; smoothScale = 0;
  updateNav();
  if (!ready) return;
  phase = 'move';
  updateScene(0, performance.now());
  beginTransition(getPose(legs[legIndex], 0), 1300, () => startPlay());
}

function startPlay() {
  if (!ready || phase === 'play') return;
  overview = false; transition = null;
  phase = 'play'; holdE = 0;
  playT0 = performance.now(); playDurMs = legs[legIndex].duration * 1000;
  updateNav(); dirty = true;
}

// 자연 종료든 사용자 중단이든: 그 자리에서 멈추고 자유 조작으로
function settlePlay(now, finished) {
  holdE = finished ? 1 : travelEased(now);
  phase = 'arrived';
  updateNav(); dirty = true;
}

function setOverview() {
  if (!ready) return;
  phase = 'move'; overview = true;
  const n = geo([16, 40], 1);
  beginTransition({ position: n.multiplyScalar(5.6), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }, 1200, () => { phase = 'overview'; holdE = 1; updateNav(); });
  updateNav();
}

/* ---------- 최소 내비게이션 ---------- */
function buildNav() {
  const dots = $('nav-dots');
  legs.forEach((leg, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'nav-dot';
    b.setAttribute('aria-label', places[leg.from].name + '에서 ' + places[leg.to].name + '까지 (' + MODE[leg.mode].name + ')');
    b.addEventListener('click', () => setLeg(i));
    dots.append(b);
  });
  $('prev-leg').addEventListener('click', () => setLeg((legIndex + legs.length - 1) % legs.length));
  $('next-leg').addEventListener('click', () => setLeg((legIndex + 1) % legs.length));
  $('overview').addEventListener('click', setOverview);
}
function updateNav() {
  const dots = $('nav-dots').children;
  for (let i = 0; i < dots.length; i++) {
    dots[i].classList.toggle('is-active', i === legIndex && !overview);
    dots[i].classList.toggle('is-past', i < legIndex);
  }
  const leg = legs[legIndex];
  $('nav-caption').innerHTML = overview ? '자유롭게 돌려보세요' : '<b>' + places[leg.from].name + ' → ' + places[leg.to].name + '</b> · ' + MODE[leg.mode].name;
  dirty = true;
}

/* ---------- 배치 ---------- */
const modelLength = { flight: 1.23, train: 0.48, ferry: 1.05, car: 0.55 };
const screenFraction = { flight: 0.062, train: 0.045, ferry: 0.05, car: 0.042 };
const clearance = { flight: 0.16, train: 0.04, ferry: 0.12, car: 0.04 };
const fovTan = Math.tan(THREE.MathUtils.degToRad(18));

function orient(obj, point, tangent, bank = 0) {
  const up = point.clone().normalize();
  const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, right).normalize();
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, normal, tangent));
  if (bank) obj.rotateZ(bank);
}
function seat(obj, point, scale, c) {
  obj.position.copy(point).addScaledVector(point.clone().normalize(), scale * c);
  obj.scale.setScalar(scale);
}
function targetScale(leg, t) {
  const pose = getPose(leg, t);
  const point = leg.curve.getPointAt(t);
  const distance = Math.max(pose.position.distanceTo(point), 0.02);
  let scale = (distance * 2 * fovTan * screenFraction[leg.mode]) / modelLength[leg.mode];
  if (leg.mode === 'train') {
    const consist = scale * modelLength.train * 2.6;
    const limit = Math.max(leg.length * 0.2, 0.004);
    if (consist > limit) scale *= limit / consist;
  }
  if (leg.mode === 'flight') {
    const limit = Math.max(leg.length * 0.08, 0.01);
    if (scale * modelLength.flight > limit) scale = limit / modelLength.flight;
  }
  return scale;
}

function currentE(now) {
  if (overview) return 1;
  if (phase === 'play') return travelEased(now);
  return holdE;
}

function updateScene(e, now) {
  const leg = legs[legIndex];
  const showVehicle = !overview && (phase === 'play' || phase === 'move' || phase === 'arrived');
  const isFlight = leg.mode === 'flight', isTrain = leg.mode === 'train', isFerry = leg.mode === 'ferry', isCar = leg.mode === 'car';
  plane.visible = showVehicle && isFlight; ferry.visible = showVehicle && isFerry; car.visible = showVehicle && isCar;
  trainCars.forEach((m) => (m.visible = showVehicle && isTrain));

  if (showVehicle) {
    const point = leg.curve.getPointAt(e);
    const ts = targetScale(leg, e);
    smoothScale += (ts - smoothScale) * 0.12;
    const scale = smoothScale || ts, c = clearance[leg.mode];
    if (isTrain) {
      trainCars.forEach((m, i) => {
        const u = e - (i * scale * modelLength.train * 1.15) / Math.max(leg.length, 0.001);
        m.visible = u >= -0.001;
        const p = leg.curve.getPointAt(clamp(u, 0, 1));
        seat(m, p, scale, c); orient(m, p, leg.curve.getTangentAt(clamp(u, 0.001, 0.999)));
      });
    } else {
      const model = isFlight ? plane : isFerry ? ferry : car;
      seat(model, point, scale, c);
      orient(model, point, leg.curve.getTangentAt(clamp(e, 0.001, 0.999)), isFlight ? Math.sin(e * Math.PI * 2) * 0.065 : 0);
    }
    headGlow.visible = phase === 'play';
    headGlow.position.copy(point).addScaledVector(point.clone().normalize(), 0.008);
    headGlow.material.color.set(MODE[leg.mode].color);
    headGlow.scale.setScalar(clamp(camera.position.distanceTo(point) * 0.012, 0.008, 0.06));
  } else {
    headGlow.visible = false;
  }

  trailObjects.forEach((trail, i) => {
    const active = i === legIndex && !overview;
    trail.halo.visible = trail.core.visible = overview || i <= legIndex;
    trail.setProgress(active ? e : 1);
    // 화면 기준 얇기: 각 선의 중점까지 거리에 비례해 굵기 보정
    const mid = legs[i].curve.getPointAt(0.5);
    const d = camera.position.distanceTo(mid);
    trail.setRadius(clamp(d * 0.0011, 0.0006, 0.0035));
    if (overview) trail.setStyle(0.45, 0.18, true);
    else if (active) trail.setStyle(0.95, 0.35, false);
    else trail.setStyle(0.30, 0.12, true);
  });

  // 마커: 화면 고정 크기 점. 링 없음.
  markerObjects.forEach((m) => {
    const d = camera.position.distanceTo(m.dot.position);
    const s = clamp(d * 0.0016, 0.0012, 0.012);
    m.dot.scale.setScalar(s);
    const endpoint = !overview && (m.id === leg.from || m.id === leg.to);
    const seen = overview && legs.slice(0, legIndex + 1).some((l) => l.from === m.id || l.to === m.id);
    m.dot.visible = overview ? seen : endpoint;
    m.dot.material.color.set(!overview && m.id === leg.to ? 0xf0a080 : !overview && m.id === leg.from ? 0xcfc3ee : 0x8f81b5);
    m.priority = !overview && m.id === leg.to ? 2 : !overview && m.id === leg.from ? 1 : 0;
    m.show = m.dot.visible;
  });
}

function updateLabels() {
  camera.updateMatrixWorld(true);
  const candidates = [];
  for (const m of markerObjects) {
    if (!m.show) { m.label.style.opacity = '0'; continue; }
    const toward = camera.position.clone().sub(m.dot.position).normalize();
    if (m.normal.dot(toward) < 0.02) { m.label.style.opacity = '0'; continue; }
    const p = m.dot.position.clone().project(camera);
    if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) { m.label.style.opacity = '0'; continue; }
    candidates.push({ m, x: ((p.x + 1) * frameWidth) / 2, y: ((-p.y + 1) * frameHeight) / 2 - 14 });
  }
  candidates.sort((a, b) => (b.m.priority - a.m.priority) || (a.y - b.y));
  const accepted = [];
  for (const cand of candidates) {
    // 출발·도착이 화면에서 붙어 있으면 도착지만 표시 (몬세라트/바르셀로나 겹침 해결)
    const clash = accepted.some((k) => Math.abs(k.y - cand.y) < 30 && Math.abs(k.x - cand.x) < 110);
    if (clash) { cand.m.label.style.opacity = '0'; continue; }
    accepted.push(cand);
    cand.m.label.style.opacity = '1';
    cand.m.label.classList.toggle('arriving', cand.m.priority === 2);
    cand.m.label.style.transform = 'translate3d(' + cand.x.toFixed(1) + 'px,' + cand.y.toFixed(1) + 'px,0) translate(-50%,-100%)';
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  lastTime = now;
  if (document.hidden || !ready) return;
  const playing = phase === 'play';
  let changed = dirty || playing || !!transition;

  if (transition) {
    const tx = transition;
    const p = tx.duration === 0 ? 1 : clamp((now - tx.t0) / tx.duration, 0, 1);
    const s = smoother(p);
    camera.position.copy(tx.from).lerp(tx.position, s);
    cameraTarget.copy(tx.fromTarget).lerp(tx.target, s);
    camera.up.copy(tx.fromUp).lerp(tx.up, s).normalize();
    camera.lookAt(cameraTarget);
    if (p >= 1) { transition = null; tx.onComplete && tx.onComplete(); }
  } else if (playing) {
    applyPose(getPose(legs[legIndex], travelEased(now)));
    if (rawProgress(now) >= 1) settlePlay(now, true);
  }

  if (changed) {
    const nearH = Math.max(0.003, camera.position.length() - R);
    camera.near = clamp(nearH * 0.012, 0.0001, 0.05);
    camera.updateProjectionMatrix();
    const e = currentE(now);
    // 재생·전이 중이 아니면 카메라를 건드리지 않음 (자유 지구본 유지)
    updateScene(e, now);
    updateLabels();
    renderer.render(scene, camera);
    dirty = false;
  }
}

function holdPose(e) {
  if (overview) {
    const n = geo([16, 40], 1);
    return { position: n.multiplyScalar(5.6), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
  }
  return getPose(legs[legIndex], e);
}
function applyPose(pose) {
  camera.position.copy(pose.position); cameraTarget.copy(pose.target); camera.up.copy(pose.up);
  camera.lookAt(cameraTarget);
}

/* ---------- 입력: 항상 자유. 재생·이동 중 손대면 즉시 중단하고 넘겨줌 ---------- */
const canvas = $('globe');
function userTakeover() {
  const now = performance.now();
  if (phase === 'play') settlePlay(now, false);
  if (transition) { transition = null; if (phase === 'move') { phase = 'arrived'; holdE = 0; } }
  dirty = true;
}
canvas.addEventListener('pointerdown', (e) => {
  if (!ready) return;
  userTakeover();
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  const h = clamp(camera.position.length() - R, 0.015, 5), speed = (0.003 * h) / 3;
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * speed);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const pitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * speed);
  camera.position.applyQuaternion(yaw).applyQuaternion(pitch);
  cameraTarget.applyQuaternion(yaw).applyQuaternion(pitch);
  camera.up.applyQuaternion(yaw).applyQuaternion(pitch);
  camera.lookAt(cameraTarget); dirty = true;
});
function endDrag() { drag = null; canvas.classList.remove('dragging'); }
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => {
  if (!ready) return;
  userTakeover();
  e.preventDefault();
  const offset = camera.position.clone().sub(cameraTarget);
  offset.multiplyScalar(Math.exp(clamp(e.deltaY, -100, 100) * 0.0015));
  const candidate = cameraTarget.clone().add(offset);
  // 래스터가 깨지는 수준까지는 절대 못 들어감
  if (candidate.length() > R + 0.15 && candidate.length() < 12) {
    camera.position.copy(candidate); camera.lookAt(cameraTarget); dirty = true;
  }
}, { passive: false });

/* ---------- 탭 전환: wall-clock 보정으로 중간 멈춤 방지 ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase === 'play') { pausedByHidden = true; hiddenAt = performance.now(); }
  } else {
    lastTime = 0;
    if (pausedByHidden) {
      const gap = performance.now() - hiddenAt;
      playT0 += gap;
      if (transition) transition.t0 += gap;
      pausedByHidden = false;
    }
    dirty = true;
  }
});
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  phase = 'arrived'; holdE = 1;
  $('map-error').hidden = false;
  $('map-error').textContent = '지구본이 잠시 멈췄어요. 페이지를 새로 열어주세요.';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    if (phase === 'play') settlePlay(performance.now(), false);
    else setLeg(legIndex);
  }
  if (e.code === 'ArrowRight') setLeg((legIndex + 1) % legs.length);
  if (e.code === 'ArrowLeft') setLeg((legIndex + legs.length - 1) % legs.length);
});

initialize();
