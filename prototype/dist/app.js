import * as THREE from 'three';
import { PLACE_NAMES, MODE_NAMES, UI } from './text.js';

/* ============================================================
 * Europe 1year - globe + routes v4
 *
 * Korean copy lives in text.js so this file stays ASCII-only.
 *
 * Line width is fixed in screen pixels: the vertex shader expands a ribbon
 * perpendicular to the tangent in clip space, so distance cannot change it.
 * Markers are sized the same way and share the route's altitude, so a dot
 * never drifts away from the line that passes through it.
 * Free zoom is capped per region by the texture density we actually ship,
 * which is what keeps the raster from falling apart.
 * ============================================================ */

const $ = (id) => document.getElementById(id);
const R = 2;
const FOV = 36;
const TAN_HALF = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const LIFT = 0.0002;          // shared surface offset for routes and dots; small enough to stay aligned on a tilted view
const clamp = THREE.MathUtils.clamp;
const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const rad = Math.PI / 180;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const places = {
  icn: { name: PLACE_NAMES.icn, ll: [126.45, 37.46] },
  bcn: { name: PLACE_NAMES.bcn, ll: [2.149, 41.375] },
  mon: { name: PLACE_NAMES.mon, ll: [1.838, 41.593] },
  lis: { name: PLACE_NAMES.lis, ll: [-9.139, 38.722] },
  cas: { name: PLACE_NAMES.cas, ll: [-7.591, 33.590] },
  rab: { name: PLACE_NAMES.rab, ll: [-6.858, 33.992] },
  tan: { name: PLACE_NAMES.tan, ll: [-5.787, 35.771] },
  alg: { name: PLACE_NAMES.alg, ll: [-5.434, 36.126] },
  mlg: { name: PLACE_NAMES.mlg, ll: [-4.421, 36.721] },
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
  flight: { name: MODE_NAMES.flight, color: '#d2663a' },
  train:  { name: MODE_NAMES.train, color: '#6b4fc9' },
  ferry:  { name: MODE_NAMES.ferry, color: '#12806d' },
  car:    { name: MODE_NAMES.car, color: '#b8862a' },
};

/* Texture density we actually ship. Going closer than the source resolution
 * is what makes the map look broken, so every region gets its own floor. */
const KM_PER_UNIT = 40075 / (2 * Math.PI * R);
const KM_PER_DEG = 111.32;
const BLUR_TOLERANCE = 1.4;   // magnification up to this factor is not noticeable
const GLOBAL_PX_PER_DEG = 8192 / 360;
const PATCHES = [
  { west: 0, south: 40, east: 4, north: 43, pxPerDeg: 2048 / 4 },
  { west: -12, south: 30, east: 5, north: 45, pxPerDeg: 4096 / 17 },
  { west: -15, south: 25, east: 32, north: 58, pxPerDeg: 4096 / 47 },
  { west: 123, south: 33, east: 131, north: 40, pxPerDeg: 2048 / 8 },
];

function geo([lon, lat], radius = R) {
  return new THREE.Vector3(
    Math.cos(lat * rad) * Math.cos(lon * rad),
    Math.sin(lat * rad),
    -Math.cos(lat * rad) * Math.sin(lon * rad)
  ).multiplyScalar(radius);
}
function toLonLat(v) {
  const n = v.clone().normalize();
  return [Math.atan2(-n.z, n.x) / rad, Math.asin(clamp(n.y, -1, 1)) / rad];
}
function pxPerDegAt(v) {
  const [lon, lat] = toLonLat(v);
  let best = GLOBAL_PX_PER_DEG;
  for (const p of PATCHES) {
    if (lon >= p.west && lon <= p.east && lat >= p.south && lat <= p.north) best = Math.max(best, p.pxPerDeg);
  }
  return best;
}
// Floor is the altitude where a screen pixel becomes finer than a texture pixel
function minAltitudeAt(v) {
  const nativeKmPerPx = KM_PER_DEG / pxPerDegAt(v);
  return (nativeKmPerPx * frameHeight) / (2 * TAN_HALF * KM_PER_UNIT * BLUR_TOLERANCE);
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
    return target.copy(normal).multiplyScalar(R + lift * this.peak + LIFT);
  }
}

/* ---------- Ribbon with a width fixed in screen pixels ----------
 * halfW is half the line thickness in CSS pixels. The shader offsets each
 * vertex perpendicular to the screen-space tangent, so the thickness is the
 * same for a 9600 km flight and a 46 km train ride. */
const screenRes = new THREE.Vector2(1, 1);
const DIM = new THREE.Color('#9a8ec0');

const RIBBON_VERT = `
uniform float halfW;
uniform vec2 res;
attribute vec3 nextPos;
attribute float side;
attribute float routeT;
varying float vT;
void main(){
  vT = routeT;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 n = projectionMatrix * modelViewMatrix * vec4(nextPos, 1.0);
  vec2 cs = c.xy / max(abs(c.w), 1e-5);
  vec2 ns = n.xy / max(abs(n.w), 1e-5);
  vec2 d = (ns - cs) * res;
  vec2 dir = length(d) < 1e-6 ? vec2(1.0, 0.0) : normalize(d);
  vec2 perp = vec2(-dir.y, dir.x) * (halfW * side);
  c.xy += (perp / res) * 2.0 * c.w;
  gl_Position = c;
}`;

const RIBBON_FRAG = `
uniform vec3 color;
uniform float opacity;
uniform float head;
varying float vT;
void main(){
  if (vT > head + 0.0015) discard;
  gl_FragColor = vec4(color, opacity);
  #include <colorspace_fragment>
}`;

function makeTrail(curve, colorHex) {
  const N = 420;
  const pts = [];
  for (let i = 0; i <= N; i++) pts.push(curve.getPointAt(i / N));
  const pos = [], nxt = [], sd = [], tt = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const n = i < N ? pts[i + 1] : pts[i].clone().multiplyScalar(2).sub(pts[i - 1]);
    for (const s of [-1, 1]) { pos.push(p.x, p.y, p.z); nxt.push(n.x, n.y, n.z); sd.push(s); tt.push(i / N); }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('nextPos', new THREE.Float32BufferAttribute(nxt, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sd, 1));
  geometry.setAttribute('routeT', new THREE.Float32BufferAttribute(tt, 1));
  geometry.setIndex(idx);
  geometry.setDrawRange(0, 0);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      halfW: { value: 0.9 },
      res: { value: screenRes },
      color: { value: new THREE.Color(colorHex) },
      opacity: { value: 0.95 },
      head: { value: 0 },
    },
    vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
    transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const total = N * 6;
  return {
    mesh, material,
    setProgress(p) {
      geometry.setDrawRange(0, p >= 1 ? total : Math.floor(clamp(p, 0, 1) * N) * 6);
      material.uniforms.head.value = p;
    },
    setStyle(px, opacity, dimmed) {
      material.uniforms.halfW.value = px;
      material.uniforms.opacity.value = opacity;
      material.uniforms.color.value.set(colorHex);
      if (dimmed) material.uniforms.color.value.lerp(DIM, 0.5);
    },
  };
}

/* ---------- Vehicle models ---------- */
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

/* ---------- State ---------- */
const stage = $('globe-stage');
let renderer, scene, camera, planet;
let ready = false, legIndex = 0, dirty = true, overview = true, drag = null;
let phase = 'overview';       // overview | move | play | arrived
let playT0 = 0, playDurMs = 7000, holdE = 1;
let pausedByHidden = false, hiddenAt = 0;
let transition = null;
let frameWidth = 1, frameHeight = 1, projScale = 1000;
const trailObjects = [], markerObjects = [];
const plane = makePlane(), ferry = makeFerry(), car = makeCar();
// A long consist swallows a short route, so keep it to a power car plus one coach
const trainCars = [makeTrainCar(true), makeTrainCar(false)];
let smoothScale = 0;
const cameraTarget = new THREE.Vector3();

function patchGeometry(w, s, e, n, segments = 128, lift = 0.00002) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let y = 0; y <= segments; y++) for (let x = 0; x <= segments; x++) {
    const u = x / segments, v = y / segments;
    const p = geo([w + (e - w) * u, s + (n - s) * v], R + lift);
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

async function initialize() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: $('globe'), alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 0.001, 50);

    scene.add(new THREE.HemisphereLight(0xd9ccff, 0x2a2138, 1.55));
    const sun = new THREE.DirectionalLight(0xffe9d2, 2.3); sun.position.set(7, 8, 8); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9a7fe8, 1.1); rim.position.set(-8, 2, -6); scene.add(rim);

    const loader = new THREE.TextureLoader();
    // Stacked from coarse to fine: europe, korea, iberia + morocco, barcelona
    const sheets = [
      ['globe-patch-europe.png', -15, 25, 32, 58, 160, 0.00002],
      ['globe-patch-korea.png', 123, 33, 131, 40, 96, 0.00003],
      ['globe-patch-iberia-morocco.png', -12, 30, 5, 45, 128, 0.00005],
      ['globe-patch-barcelona.png', 0, 40, 4, 43, 96, 0.00008],
    ];
    const maps = await Promise.all(['globe-color-8192.png', ...sheets.map((s) => s[0])].map((f) => loader.loadAsync('./assets/' + f)));
    maps.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
    const globeMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, color: 0xcdbfe8 });
    planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 192), globeMat(maps[0]));
    scene.add(planet);
    sheets.forEach(([, w, s, e, n, seg, lift], i) => {
      const patch = new THREE.Mesh(patchGeometry(w, s, e, n, seg, lift), globeMat(maps[i + 1]));
      patch.renderOrder = i + 1;
      scene.add(patch);
    });

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.03, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { glow: { value: new THREE.Color('#a584f0') } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 glow; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1. - abs(dot(normalize(vN), normalize(vV))), 3.2); gl_FragColor = vec4(glow, 1.) * rim * .5;\n#include <colorspace_fragment>\n}',
        transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      })
    );
    atmo.renderOrder = 9; scene.add(atmo);

    legs.forEach((leg) => {
      leg.curve = new TravelCurve(leg);
      leg.length = leg.curve.getLength();
      leg.angle = leg.curve.angle;
      const trail = makeTrail(leg.curve, MODE[leg.mode].color);
      scene.add(trail.mesh); trailObjects.push(trail);
    });

    for (const [id, p] of Object.entries(places)) {
      const dot = mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x6b5f8c, toneMapped: false }));
      const normal = geo(p.ll, 1);
      dot.position.copy(normal).multiplyScalar(R + LIFT);
      dot.renderOrder = 6;
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

    new ResizeObserver(resize).observe(stage);
    resize();
    buildNav();
    // Opening state is a free globe with no autoplay
    const n = geo([16, 40], 1);
    camera.position.copy(n.multiplyScalar(5.6));
    cameraTarget.set(0, 0, 0); camera.up.set(0, 1, 0); camera.lookAt(cameraTarget);
    overview = true; phase = 'overview'; holdE = 1;
    ready = true;
    $('loading').classList.add('done');
    updateNav();
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
  screenRes.set(frameWidth, frameHeight);
  projScale = (frameHeight * 0.5) / TAN_HALF;   // converts world size to screen pixels
  dirty = true;
}

/* ---------- Framing ----------
 * Solve for the altitude at which a route of length L fills the target share
 * of the screen: visible height = 2 * alt * tan(fov/2), so alt = L / (share *
 * 2 * tan(fov/2)). Then raise it to the region's texture floor. */
function bandFor(leg) {
  const share = leg.mode === 'flight' ? 0.68 : 0.28;
  return {
    alt: clamp(leg.length / (share * 2 * TAN_HALF), 0.08, 6.5),
    descend: leg.mode === 'flight' ? 0.22 : 0,
  };
}

function getPose(leg, e) {
  e = clamp(e, 0, 1);
  const { alt, descend } = bandFor(leg);
  let focus;
  if (leg.mode === 'flight') {
    focus = slerp(leg.curve.a, leg.curve.b, 0.5 + (e - 0.5) * 0.5);
  } else {
    const mid = leg.curve.getPointAt(0.5).normalize();
    const here = leg.curve.getPointAt(e).normalize();
    focus = mid.clone().lerp(here, 0.35).normalize();
  }
  const arrival = descend ? smoother(clamp((e - 0.7) / 0.3, 0, 1)) : 0;
  const wanted = alt * (1 - descend * arrival);
  return aim(focus, Math.max(wanted, minAltitudeAt(focus)));
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

function rawProgress(now) { return phase === 'play' ? clamp((now - playT0) / playDurMs, 0, 1) : holdE; }
function travelEased(now) { return smoother(clamp((rawProgress(now) - 0.055) / 0.87, 0, 1)); }
function currentE(now) { return overview ? 1 : phase === 'play' ? travelEased(now) : holdE; }

/* ---------- A leg plays once, then control goes back to the user ---------- */
function setLeg(i) {
  legIndex = clamp(i, 0, legs.length - 1);
  overview = false; holdE = 0; smoothScale = 0;
  updateNav();
  if (!ready) return;
  phase = 'move';
  beginTransition(getPose(legs[legIndex], 0), 1300, startPlay);
}
function startPlay() {
  if (!ready) return;
  overview = false; transition = null;
  phase = 'play'; holdE = 0;
  playT0 = performance.now(); playDurMs = legs[legIndex].duration * 1000;
  updateNav(); dirty = true;
}
function settlePlay(now, finished) {
  holdE = finished ? 1 : travelEased(now);
  phase = 'arrived';
  updateNav(); dirty = true;
}
function setOverview() {
  if (!ready) return;
  phase = 'move'; overview = true;
  const n = geo([16, 40], 1);
  beginTransition({ position: n.multiplyScalar(5.6), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }, 1200,
    () => { phase = 'overview'; holdE = 1; updateNav(); });
  updateNav();
}

function buildNav() {
  const dots = $('nav-dots');
  legs.forEach((leg, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'nav-dot';
    b.setAttribute('aria-label', places[leg.from].name + UI.from + places[leg.to].name + UI.to + '(' + MODE[leg.mode].name + ')');
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
  $('nav-caption').innerHTML = overview
    ? UI.free
    : '<b>' + places[leg.from].name + UI.arrow + places[leg.to].name + '</b>' + UI.middot + MODE[leg.mode].name;
  dirty = true;
}

/* ---------- Placing the vehicles ---------- */
const modelLength = { flight: 1.23, train: 0.48, ferry: 1.05, car: 0.55 };
// Share of screen height one model should take up, tuned to stay legible on a laptop
const screenFraction = { flight: 0.062, train: 0.035, ferry: 0.05, car: 0.05 };
const clearance = { flight: 0.16, train: 0.04, ferry: 0.12, car: 0.04 };

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
  let scale = (distance * 2 * TAN_HALF * screenFraction[leg.mode]) / modelLength[leg.mode];
  if (leg.mode === 'flight') {
    const limit = Math.max(leg.length * 0.08, 0.01);
    if (scale * modelLength.flight > limit) scale = limit / modelLength.flight;
  }
  return scale;
}

function updateScene(e, now) {
  const leg = legs[legIndex];
  const show = !overview;
  const isFlight = leg.mode === 'flight', isTrain = leg.mode === 'train', isFerry = leg.mode === 'ferry', isCar = leg.mode === 'car';
  plane.visible = show && isFlight; ferry.visible = show && isFerry; car.visible = show && isCar;
  trainCars.forEach((m) => (m.visible = show && isTrain));

  if (show) {
    const point = leg.curve.getPointAt(e);
    const ts = targetScale(leg, e);
    smoothScale = smoothScale ? smoothScale + (ts - smoothScale) * 0.15 : ts;
    const scale = smoothScale, c = clearance[leg.mode];
    if (isTrain) {
      trainCars.forEach((m, i) => {
        const u = e - (i * scale * modelLength.train * 1.1) / Math.max(leg.length, 0.001);
        m.visible = u >= -0.001;
        const p = leg.curve.getPointAt(clamp(u, 0, 1));
        seat(m, p, scale, c); orient(m, p, leg.curve.getTangentAt(clamp(u, 0.001, 0.999)));
      });
    } else {
      const model = isFlight ? plane : isFerry ? ferry : car;
      seat(model, point, scale, c);
      orient(model, point, leg.curve.getTangentAt(clamp(e, 0.001, 0.999)), isFlight ? Math.sin(e * Math.PI * 2) * 0.065 : 0);
    }
  }

  trailObjects.forEach((trail, i) => {
    const active = i === legIndex && !overview;
    trail.setProgress(active ? e : 1);
    if (active) trail.setStyle(1.0, 0.95, false);
    else trail.setStyle(0.7, overview ? 0.62 : 0.4, true);
  });

  // Dots stay 3 px across and sit at the route's own altitude, so they never drift off the line
  markerObjects.forEach((m) => {
    const dist = camera.position.distanceTo(m.dot.position);
    m.dot.scale.setScalar((3.0 * dist) / projScale);
    const endpoint = !overview && (m.id === leg.from || m.id === leg.to);
    m.dot.visible = overview || endpoint;
    m.dot.material.color.set(!overview && m.id === leg.to ? 0xe08a63 : 0x6b5f8c);
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
    candidates.push({ m, x: ((p.x + 1) * frameWidth) / 2, y: ((-p.y + 1) * frameHeight) / 2 - 12 });
  }
  // On a collision keep the destination and hide the rest
  candidates.sort((a, b) => (b.m.priority - a.m.priority) || (a.y - b.y));
  const accepted = [];
  for (const cand of candidates) {
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
  if (document.hidden || !ready) return;
  const playing = phase === 'play';
  const changed = dirty || playing || !!transition;

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
    updateScene(currentE(now), now);
    updateLabels();
    renderer.render(scene, camera);
    dirty = false;
  }
}

function applyPose(pose) {
  camera.position.copy(pose.position); cameraTarget.copy(pose.target); camera.up.copy(pose.up);
  camera.lookAt(cameraTarget);
}

/* ---------- Input is always live; touching the globe mid-playback hands over control ---------- */
const canvas = $('globe');
function userTakeover() {
  if (phase === 'play') settlePlay(performance.now(), false);
  if (transition) { transition = null; if (phase === 'move') phase = 'arrived'; }
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
  // Spinning toward a low-resolution region pushes the camera back to its floor
  const floor = R + minAltitudeAt(camera.position);
  if (camera.position.length() < floor) camera.position.setLength(floor);
  camera.lookAt(cameraTarget);
  dirty = true;
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
  const floor = R + minAltitudeAt(candidate);
  if (candidate.length() > floor && candidate.length() < 12) {
    camera.position.copy(candidate); camera.lookAt(cameraTarget); dirty = true;
  }
}, { passive: false });

/* ---------- Tab switches: absorb the elapsed gap so playback does not jump ---------- */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (phase === 'play') { pausedByHidden = true; hiddenAt = performance.now(); }
  } else {
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
  $('map-error').textContent = UI.contextLost;
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault();
    if (phase === 'play') settlePlay(performance.now(), false); else setLeg(legIndex);
  }
  if (e.code === 'ArrowRight') setLeg((legIndex + 1) % legs.length);
  if (e.code === 'ArrowLeft') setLeg((legIndex + legs.length - 1) % legs.length);
});

initialize();
