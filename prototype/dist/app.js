import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const R = 2;
const clamp = THREE.MathUtils.clamp;
const ease = (t) => t * t * (3 - 2 * t);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const rad = Math.PI / 180;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const places = {
  icn: { name: '인천', en: 'INCHEON', code: 'ICN', ll: [126.45, 37.46] },
  bcn: { name: '바르셀로나', en: 'BARCELONA', code: 'BCN', ll: [2.149, 41.375] },
  mon: { name: '몬세라트', en: 'MONTSERRAT', code: 'MON', ll: [1.838, 41.593] },
  lis: { name: '리스본', en: 'LISBON', code: 'LIS', ll: [-9.139, 38.722] },
  cas: { name: '카사블랑카', en: 'CASABLANCA', code: 'CAS', ll: [-7.591, 33.590] },
  rab: { name: '라바트', en: 'RABAT', code: 'RBA', ll: [-6.858, 33.992] },
  tan: { name: '탕헤르', en: 'TANGIER', code: 'TNG', ll: [-5.787, 35.771] },
  alg: { name: '알헤시라스', en: 'ALGECIRAS', code: 'ALG', ll: [-5.434, 36.126] },
};
const montserrat = [[2.149,41.375],[2.037,41.348],[2.008,41.396],[1.918,41.486],[1.892,41.545],[1.861,41.592],[1.851,41.612],[1.838,41.593]];
const rabat = [[-7.591,33.590],[-7.385,33.684],[-7.159,33.789],[-7.040,33.852],[-6.921,33.921],[-6.858,33.992]];
const tangier = [[-6.858,33.992],[-6.792,34.075],[-6.578,34.251],[-6.480,34.520],[-6.160,34.930],[-6.120,35.150],[-5.990,35.470],[-5.880,35.650],[-5.787,35.771]];
// Schematic city-to-city crossing. Departure port/transfer are not yet confirmed.
const crossing = [[-5.787,35.771],[-5.798,35.804],[-5.755,35.872],[-5.590,35.985],[-5.460,36.052],[-5.434,36.126]];
const legs = [
  { from:'icn',to:'bcn',mode:'flight',title:'첫 번째 출발',kicker:'THE FIRST DEPARTURE',description:'우리의 여행이 시작된 날.',caption:'대한민국 → 스페인',duration:9,date:'2025. 10. 18' },
  { from:'bcn',to:'mon',mode:'train',title:'몬세라트로 가는 날',kicker:'A DAY IN MONTSERRAT',description:'바르셀로나에서 기차를 타고.',caption:'스페인 · 몬세라트로',duration:7,waypoints:montserrat },
  { from:'mon',to:'bcn',mode:'train',title:'다시 바르셀로나',kicker:'BACK TO BARCELONA',description:'하루의 여행을 마치고, 다시 바르셀로나.',caption:'스페인 · 돌아오는 길',duration:7,waypoints:[...montserrat].reverse() },
  { from:'bcn',to:'lis',mode:'flight',title:'리스본으로',kicker:'ON TO LISBON',description:'스페인에서 포르투갈로.',caption:'스페인 → 포르투갈',duration:7 },
  { from:'lis',to:'cas',mode:'flight',title:'카사블랑카로',kicker:'ACROSS TO MOROCCO',description:'포르투갈을 떠나, 모로코에 도착.',caption:'포르투갈 → 모로코',duration:7 },
  { from:'cas',to:'rab',mode:'train',title:'라바트로 가는 기차',kicker:'BY RAIL TO RABAT',description:'카사블랑카에서 라바트까지.',caption:'모로코 · 북쪽으로',duration:7,waypoints:rabat },
  { from:'rab',to:'tan',mode:'train',title:'북쪽의 탕헤르로',kicker:'NORTH TO TANGIER',description:'라바트에서 다시 기차를 타고.',caption:'모로코 · 탕헤르로',duration:7,waypoints:tangier },
  { from:'tan',to:'alg',mode:'ferry',title:'바다 건너 알헤시라스',kicker:'ACROSS THE STRAIT',description:'페리를 타고, 다시 스페인으로.',caption:'모로코 → 스페인',duration:8,waypoints:crossing },
];
const modeNames = {flight:'비행',train:'기차',ferry:'페리'};
const modeEnglish = {flight:'OUR FLIGHT',train:'OUR TRAIN RIDE',ferry:'OUR SEA CROSSING'};
const icons = {
  flight:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="m20.8 3.2-3.9.8-5 5.1-7.1-1.6-1.4 1.4 6 2.9-4 4.4-3.1-.1-1 1 4.1 1.3 1.3 4.1 1-1-.1-3.1 4.4-4 2.9 6 1.4-1.4-1.6-7.1 5.1-5 .8-3.9z"/></svg>',
  train:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 11h14M12 3v8M8 18l-2 3m10-3 2 3M7 21h10"/><circle cx="8.5" cy="14.5" r=".8"/><circle cx="15.5" cy="14.5" r=".8"/></svg>',
  ferry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 12 9-3 9 3-3 6H6l-3-6ZM7 11V6h10v5M10 6V3h4v3M2 21c2-2 3 2 5 0s3 2 5 0 3 2 5 0 3 2 5 0"/></svg>',
};

function geo([lon,lat],radius=R){return new THREE.Vector3(Math.cos(lat*rad)*Math.cos(lon*rad),Math.sin(lat*rad),-Math.cos(lat*rad)*Math.sin(lon*rad)).multiplyScalar(radius);}
function slerp(a,b,t){const angle=Math.acos(clamp(a.dot(b),-1,1));if(angle<.00001)return a.clone().lerp(b,t).normalize();return a.clone().multiplyScalar(Math.sin((1-t)*angle)/Math.sin(angle)).addScaledVector(b,Math.sin(t*angle)/Math.sin(angle)).normalize();}

class TravelCurve extends THREE.Curve {
  constructor(leg){super();this.leg=leg;this.a=geo(places[leg.from].ll,1);this.b=geo(places[leg.to].ll,1);this.angle=this.a.angleTo(this.b);this.arcLengthDivisions=600;this.peak=leg.mode==='flight'?clamp(this.angle*.45,.055,.65):0;if(leg.waypoints)this.ground=new THREE.CatmullRomCurve3(leg.waypoints.map(ll=>new THREE.Vector3(ll[0],ll[1],0)),false,'centripetal');}
  getPoint(t,target=new THREE.Vector3()){t=clamp(t,0,1);let normal;if(this.ground){const p=this.ground.getPoint(t);normal=geo([p.x,p.y],1);}else normal=slerp(this.a,this.b,t);const lift=this.peak>0?(1-Math.cos(Math.PI*2*t))*.5:0;return target.copy(normal).multiplyScalar(R+lift*this.peak+.0015);}
}

function makeTrail(curve,color){
  const segments=360,sides=8,centers=[],normals=[],times=[],indices=[];
  for(let i=0;i<=segments;i++){const t=i/segments,p=curve.getPointAt(t),f=curve.getTangentAt(clamp(t,.0001,.9999)),up=p.clone().normalize(),right=new THREE.Vector3().crossVectors(f,up).normalize(),normal=new THREE.Vector3().crossVectors(right,f).normalize();for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2,n=right.clone().multiplyScalar(Math.cos(a)).addScaledVector(normal,Math.sin(a));centers.push(...p.toArray());normals.push(...n.toArray());times.push(t);if(i<segments){const a=i*sides+j,b=i*sides+(j+1)%sides,c=(i+1)*sides+j,d=(i+1)*sides+(j+1)%sides;indices.push(a,b,c,b,d,c);}}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(centers,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('routeT',new THREE.Float32BufferAttribute(times,1));geometry.setIndex(indices);geometry.setDrawRange(0,0);geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),R+1);
  const material=new THREE.ShaderMaterial({uniforms:{radius:{value:.004},color:{value:new THREE.Color(color)},opacity:{value:1},head:{value:0}},vertexShader:'uniform float radius; attribute float routeT; varying float vT; varying float vLight; void main(){vT=routeT;vLight=.82+.18*abs(dot(normal,normalize(vec3(.4,1.,1.))));gl_Position=projectionMatrix*modelViewMatrix*vec4(position+normal*radius,1.);}',fragmentShader:'uniform vec3 color;uniform float opacity;uniform float head;varying float vT;varying float vLight;void main(){float front=smoothstep(head-.04,head,vT);gl_FragColor=vec4(mix(color*vLight,color*1.14,front*.35),opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',transparent:true,depthWrite:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;return {mesh,geometry,material,segments,sides,setProgress(p){geometry.setDrawRange(0,Math.floor(clamp(p,0,1)*segments)*sides*6);material.uniforms.head.value=p;}};
}

const materials={body:new THREE.MeshStandardMaterial({color:'#fff9e9',roughness:.5}),trim:new THREE.MeshStandardMaterial({color:'#ae614d',roughness:.6}),glass:new THREE.MeshStandardMaterial({color:'#365961',roughness:.35}),wing:new THREE.MeshStandardMaterial({color:'#d9e1dc',roughness:.55}),dark:new THREE.MeshStandardMaterial({color:'#476168',roughness:.65}),blue:new THREE.MeshStandardMaterial({color:'#6f969e',roughness:.55})};
function mesh(geometry,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);return m;}
function box(w,h,d,mat,x=0,y=0,z=0){return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
function sphere(x,y,z,mat,px=0,py=0,pz=0){const m=mesh(new THREE.SphereGeometry(1,20,12),mat,px,py,pz);m.scale.set(x,y,z);return m;}
function wingShape(points,thickness,mat,y=0){const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:1,steps:1});g.rotateX(Math.PI/2);return mesh(g,mat,0,y,0);}
function makePlane(){const g=new THREE.Group();const profile=[new THREE.Vector2(.008,-.61),new THREE.Vector2(.043,-.50),new THREE.Vector2(.09,-.25),new THREE.Vector2(.095,.23),new THREE.Vector2(.07,.46),new THREE.Vector2(.035,.57),new THREE.Vector2(0,.62)];const body=new THREE.LatheGeometry(profile,24);body.rotateX(Math.PI/2);g.add(mesh(body,materials.body));g.add(wingShape([[-.08,.18],[-.64,-.2],[-.66,-.31],[-.11,-.16],[.11,-.16],[.66,-.31],[.64,-.2],[.08,.18]],.019,materials.wing,-.015));g.add(wingShape([[-.035,-.37],[-.26,-.54],[-.27,-.61],[.27,-.61],[.26,-.54],[.035,-.37]],.012,materials.body,.025));const finShape=new THREE.Shape();finShape.moveTo(-.59,.02);finShape.lineTo(-.56,.31);finShape.lineTo(-.43,.32);finShape.lineTo(-.25,.015);finShape.closePath();const fin=new THREE.ExtrudeGeometry(finShape,{depth:.018,bevelEnabled:false});fin.rotateY(-Math.PI/2);g.add(mesh(fin,materials.trim,.009,0,0));g.add(sphere(.064,.034,.1,materials.glass,0,.068,.39));for(const x of [-.27,.27]){const engine=mesh(new THREE.CylinderGeometry(.048,.043,.19,16),materials.body,x,-.065,-.055);engine.rotation.x=Math.PI/2;g.add(engine);const inlet=mesh(new THREE.CircleGeometry(.034,16),materials.dark,x,-.065,.041);g.add(inlet);}for(let i=0;i<7;i++){for(const side of [-1,1])g.add(box(.009,.024,.027,materials.glass,.092*side,.033,.24-i*.069));}return g;}
function makeTrain(front=false){const g=new THREE.Group();g.add(box(.20,.16,.43,materials.body,0,.1,0));g.add(sphere(.1,.075,.225,materials.body,0,.17,0));g.add(box(.206,.038,.435,materials.trim,0,.068,0));g.add(box(.15,.035,.36,materials.dark,0,.012,0));for(const side of [-1,1])for(let i=0;i<4;i++)g.add(box(.006,.05,.063,materials.glass,side*.102,.135,-.145+i*.095));if(front){g.add(sphere(.095,.084,.10,materials.body,0,.10,.20));g.add(box(.142,.042,.013,materials.glass,0,.147,.268));for(const side of [-1,1])g.add(sphere(.014,.012,.008,materials.wing,side*.063,.075,.286));}for(const z of [-.14,.14])for(const x of [-.102,.102]){const w=mesh(new THREE.CylinderGeometry(.035,.035,.018,12),materials.dark,x,.025,z);w.rotation.z=Math.PI/2;g.add(w);}return g;}
function makeFerry(){const g=new THREE.Group();g.add(sphere(.20,.09,.48,materials.blue,0,.01,0));g.add(box(.33,.11,.63,materials.body,0,.095,-.035));g.add(box(.27,.085,.49,materials.body,0,.19,-.035));g.add(box(.25,.065,.15,materials.body,0,.262,.11));g.add(box(.255,.027,.055,materials.glass,0,.265,.19));g.add(box(.095,.13,.10,materials.trim,0,.285,-.17));for(const side of [-1,1])for(let i=0;i<6;i++)g.add(box(.007,.027,.045,materials.glass,side*.169,.125,-.26+i*.085));for(const side of [-1,1])g.add(box(.018,.023,.61,materials.wing,side*.177,.159,-.035));g.add(box(.012,.16,.012,materials.dark,0,.365,.05));return g;}

const stage=$('globe-stage');let renderer,scene,camera,planet;
let index=0,elapsed=0,playing=false,ready=false,transition=null,intro=false,lastTime=0,dirty=true,overview=true,drag=null,queuedPlay=false;
let frameWidth=1,frameHeight=1,arrivedAt=0;
const trailObjects=[],markerObjects=[],carModels=[];
const plane=makePlane(),ferry=makeFerry();
let activeModel=plane;
let cameraTarget=new THREE.Vector3();

function patchGeometry(w,s,e,n,segments=128){const positions=[],normals=[],uvs=[],indices=[];for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++){const u=x/segments,v=y/segments,p=geo([w+(e-w)*u,s+(n-s)*v],R+.000035);positions.push(...p.toArray());normals.push(...p.clone().normalize().toArray());uvs.push(u,v);if(y<segments&&x<segments){const a=y*(segments+1)+x,b=a+1,c=a+segments+1,d=c+1;indices.push(a,b,c,b,d,c);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);return g;}

async function initialize(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('globe'),alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0xf7f4ed,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.001,50);
    scene.add(new THREE.HemisphereLight(0xffffff,0xa4b1a1,2.3));const sun=new THREE.DirectionalLight(0xfff5e2,3.1);sun.position.set(7,8,8);scene.add(sun);const fill=new THREE.DirectionalLight(0xc9e7ef,.65);fill.position.set(-8,2,-5);scene.add(fill);
    const loader=new THREE.TextureLoader();const files=['globe-color-8192.png','globe-patch-iberia-morocco.png','globe-patch-barcelona.png'];const maps=await Promise.all(files.map(f=>loader.loadAsync('./assets/'+f)));maps.forEach(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
    const globeMat=(map)=>new THREE.MeshStandardMaterial({map,roughness:.83,metalness:0,color:0xffffff});
    planet=new THREE.Mesh(new THREE.SphereGeometry(R,256,192),globeMat(maps[0]));scene.add(planet);
    const regional=new THREE.Mesh(patchGeometry(-12,30,5,45),globeMat(maps[1]));regional.renderOrder=1;scene.add(regional);
    const localGeometry=patchGeometry(0,40,4,43,96);localGeometry.scale(1.000008,1.000008,1.000008);const local=new THREE.Mesh(localGeometry,globeMat(maps[2]));local.renderOrder=2;scene.add(local);
    legs.forEach((leg)=>{leg.curve=new TravelCurve(leg);leg.length=leg.curve.getLength();leg.angle=leg.curve.angle;const trail=makeTrail(leg.curve,'#b86249');scene.add(trail.mesh);trailObjects.push(trail);});
    for(const [id,p]of Object.entries(places)){const group=new THREE.Group();const dot=mesh(new THREE.SphereGeometry(1,14,10),new THREE.MeshBasicMaterial({color:0xad5e49}));const ring=mesh(new THREE.RingGeometry(1.6,2.1,40),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.82,depthWrite:false}));group.add(dot,ring);const normal=geo(p.ll,1);group.position.copy(normal).multiplyScalar(R+.001);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);scene.add(group);const label=document.createElement('div');label.className='map-label';label.textContent=p.name;$('map-labels').append(label);markerObjects.push({id,group,dot,ring,label,normal,labelOn:true});}
    scene.add(plane,ferry);for(let i=0;i<3;i++){const car=makeTrain(i===0);scene.add(car);carModels.push(car);}plane.visible=false;ferry.visible=false;
    const observer=new ResizeObserver(resize);observer.observe(stage);resize();setOverviewPose();ready=true;$('loading').classList.add('done');updateUI();requestAnimationFrame(frame);
    if(queuedPlay){queuedPlay=false;startPlayback();}
  }catch(error){console.error('Globe initialization failed',error);$('loading').hidden=true;$('map-error').hidden=false;}
}

function resize(){frameWidth=stage.clientWidth;frameHeight=stage.clientHeight;renderer.setSize(frameWidth,frameHeight,false);camera.aspect=frameWidth/frameHeight;camera.updateProjectionMatrix();dirty=true;}
function getPose(leg,t,preview=false){
  const angle=leg.angle;let focus,altitude;
  if(leg.mode==='flight'){
    const z=Math.sin(Math.PI*t);focus=slerp(leg.curve.a,leg.curve.b,clamp(t+Math.sin(Math.PI*t)*.035,0,1));
    const endAlt=clamp(angle*.76,.23,1.3);const highAlt=clamp(angle*3.15,.60,4.9);altitude=endAlt+(highAlt-endAlt)*Math.pow(z,.83);
    if(preview){focus=slerp(leg.curve.a,leg.curve.b,.5);altitude=highAlt;}
  }else{
    const mid=leg.curve.getPointAt(.5).normalize(),here=leg.curve.getPointAt(t).normalize();focus=mid.clone().lerp(here,.3).normalize();altitude=clamp(leg.length*1.18,.027,.35);if(leg.mode==='ferry')altitude=clamp(leg.length*1.3,.045,.22);
  }
  const north=new THREE.Vector3(0,1,0).addScaledVector(focus,-focus.y).normalize();const east=new THREE.Vector3().crossVectors(north,focus).normalize();
  const target=focus.clone().multiplyScalar(R);const position=focus.clone().multiplyScalar(R+altitude).addScaledVector(north,-altitude*.30).addScaledVector(east,altitude*.13);
  return {position,target,up:north};
}
function setOverviewPose(){const n=geo([56,37],1);camera.position.copy(n.multiplyScalar(7.25));cameraTarget.set(0,0,0);camera.up.set(0,1,0);camera.lookAt(cameraTarget);overview=true;dirty=true;}
function beginTransition(pose,duration,onComplete){transition={start:performance.now(),duration:reduced?0:duration,from:camera.position.clone(),fromTarget:cameraTarget.clone(),fromUp:camera.up.clone(),...pose,onComplete};dirty=true;}
function applyPose(pose){camera.position.copy(pose.position);cameraTarget.copy(pose.target);camera.up.copy(pose.up);camera.lookAt(cameraTarget);}
function progress(){return clamp(elapsed/legs[index].duration,0,1);}
function travelProgress(){const p=progress();return smoother(clamp((p-.055)/.87,0,1));}

function setLeg(i,autoPlay=false){
  index=clamp(i,0,legs.length-1);elapsed=0;playing=false;intro=false;arrivedAt=0;overview=false;updateUI();if(ready)updateScene(0);
  if(ready){const pose=getPose(legs[index],autoPlay?0:.5,!autoPlay);beginTransition(pose,autoPlay?1200:950,()=>{if(autoPlay){playing=true;updatePlayback();}});}else if(autoPlay)queuedPlay=true;
}
function startPlayback(){
  if(!ready){queuedPlay=true;return;}if(transition){transition=null;}
  if(playing){playing=false;updatePlayback();return;}
  if(progress()>=.999){elapsed=0;arrivedAt=0;}
  if(overview||elapsed===0){overview=false;intro=true;updatePlayback();beginTransition(getPose(legs[index],travelProgress()),1100,()=>{intro=false;playing=true;updatePlayback();});}else{playing=true;updatePlayback();}
}
function updateUI(){
  document.querySelectorAll('.route-stop').forEach((el,i)=>{el.classList.toggle('is-active',i===index);el.classList.toggle('is-past',i<index);el.setAttribute('aria-current',i===index?'step':'false');});
  dirty=true;
}
function updatePlayback(){}

const modelLength={flight:1.23,train:.48,ferry:1.05};
const screenFraction={flight:.062,train:.045,ferry:.05};
const vehicleClearance={flight:.16,train:.04,ferry:.12};
const fovTan=Math.tan(THREE.MathUtils.degToRad(18));
function orient(object,point,tangent,bank=0){const up=point.clone().normalize(),right=new THREE.Vector3().crossVectors(up,tangent).normalize(),normal=new THREE.Vector3().crossVectors(tangent,right).normalize();object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,tangent));if(bank)object.rotateZ(bank);}
function seat(object,point,scale,clearance){object.position.copy(point).addScaledVector(point.clone().normalize(),scale*clearance);object.scale.setScalar(scale);}
function shotScale(leg,t){
  const pose=getPose(leg,t);
  const point=leg.curve.getPointAt(t);
  const distance=Math.max(pose.position.distanceTo(point),.02);
  let scale=distance*2*fovTan*screenFraction[leg.mode]/modelLength[leg.mode];
  if(leg.mode==='train'){
    const consist=scale*modelLength.train*2.6;
    const limit=Math.max(leg.length*.2,.004);
    if(consist>limit)scale*=limit/consist;
  }
  if(leg.mode==='flight'){
    const limit=Math.max(leg.length*.08,.01);
    if(scale*modelLength.flight>limit)scale=limit/modelLength.flight;
  }
  return scale;
}
function updateScene(t){
  const leg=legs[index];plane.visible=leg.mode==='flight';ferry.visible=leg.mode==='ferry';carModels.forEach(m=>m.visible=leg.mode==='train');activeModel=leg.mode==='flight'?plane:ferry;
  const point=leg.curve.getPointAt(t);const scale=shotScale(leg,t);const clearance=vehicleClearance[leg.mode];
  if(leg.mode==='train'){
    carModels.forEach((car,i)=>{const u=t-i*scale*modelLength.train*1.15/leg.length;car.visible=u>=0;const p=leg.curve.getPointAt(clamp(u,0,1));seat(car,p,scale,clearance);orient(car,p,leg.curve.getTangentAt(clamp(u,.001,.999)));});
  }else{seat(activeModel,point,scale,clearance);orient(activeModel,point,leg.curve.getTangentAt(clamp(t,.001,.999)),leg.mode==='flight'?Math.sin(t*Math.PI*2)*.065:0);}
  trailObjects.forEach((trail,i)=>{const active=i===index;trail.mesh.visible=i<=index;trail.setProgress(active?t:1);const mid=legs[i].curve.getPointAt(.5);const d=camera.position.distanceTo(mid);trail.material.uniforms.radius.value=clamp(d*.00105,.000024,.009);trail.material.uniforms.opacity.value=active?.92:overview?.34:.18;trail.material.uniforms.color.value.set(active?'#b86249':'#7d9993');});
  markerObjects.forEach(m=>{
    const d=camera.position.distanceTo(m.group.position);m.group.scale.setScalar(d*.0035);m.dot.scale.setScalar(1);m.ring.scale.setScalar(1);const endpoint=m.id===leg.from||m.id===leg.to;const accessible=legs.slice(0,index+1).some(l=>l.from===m.id||l.to===m.id);m.group.visible=endpoint||overview&&accessible;m.dot.material.color.set(endpoint?'#ad5e49':'#638b8a');m.label.classList.toggle('active',m.id===leg.to);m.label.classList.toggle('endpoint',endpoint);m.label.hidden=!m.group.visible;
    if(arrivedAt&&m.id===leg.to){const pulse=clamp((performance.now()-arrivedAt)/1000,0,1);m.ring.scale.setScalar(1+pulse*1.6);m.ring.material.opacity=.8*(1-pulse)+.25;}else m.ring.material.opacity=.82;
  });
}
function updateLabels(){camera.updateMatrixWorld(true);for(const m of markerObjects){if(m.label.hidden)continue;const towardCamera=camera.position.clone().sub(m.group.position).normalize();const facing=m.normal.dot(towardCamera);if(m.labelOn){if(facing<-.04)m.labelOn=false;}else if(facing>.1)m.labelOn=true;const p=m.group.position.clone().project(camera);const onScreen=p.z>-1&&p.z<1&&Math.abs(p.x)<1.05&&Math.abs(p.y)<1.05;const x=((p.x+1)*frameWidth/2).toFixed(2),y=((-p.y+1)*frameHeight/2-14).toFixed(2);m.label.style.opacity=m.labelOn&&onScreen?'1':'0';m.label.style.transform='translate3d('+x+'px,'+y+'px,0) translate(-50%,-100%)';} }
function frame(now){
  requestAnimationFrame(frame);const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;if(document.hidden)return;
  let changed=dirty||playing||!!transition||(arrivedAt&&now-arrivedAt<1100);
  if(transition){const tx=transition;const p=tx.duration===0?1:clamp((now-tx.start)/tx.duration,0,1),s=smoother(p);camera.position.copy(tx.from).lerp(tx.position,s);cameraTarget.copy(tx.fromTarget).lerp(tx.target,s);camera.up.copy(tx.fromUp).lerp(tx.up,s).normalize();camera.lookAt(cameraTarget);if(p>=1){transition=null;tx.onComplete?.();}}
  else if(playing){elapsed=Math.min(legs[index].duration,elapsed+dt);applyPose(getPose(legs[index],travelProgress()));if(progress()>=1){playing=false;arrivedAt=now;}updatePlayback();}
  if(changed){const nearHeight=Math.max(.003,camera.position.length()-R);camera.near=clamp(nearHeight*.012,.0001,.05);camera.updateProjectionMatrix();updateScene(travelProgress());updateLabels();renderer.render(scene,camera);dirty=false;}
}

legs.forEach((leg,i)=>{const button=document.createElement('button');button.type='button';button.className='route-stop';button.setAttribute('aria-label',places[leg.from].name+'에서 '+places[leg.to].name+'까지 '+modeNames[leg.mode]);button.innerHTML='<span class="stop-dot"></span><span class="stop-name">'+places[leg.to].name+'</span>';button.addEventListener('click',()=>setLeg(i,true));$('route-stops').append(button);});
$('overview').addEventListener('click',()=>{if(!ready)return;playing=false;intro=false;overview=true;const n=geo(index===0?[56,37]:[-3,38],1);beginTransition({position:n.multiplyScalar(index===0?7.25:5.35),target:new THREE.Vector3(),up:new THREE.Vector3(0,1,0)},1100);});
const canvas=$('globe');canvas.addEventListener('pointerdown',(e)=>{if(!ready||playing||intro)return;transition=null;drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
canvas.addEventListener('pointermove',(e)=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;const h=clamp(camera.position.length()-R,.015,5),speed=.003*h/3;const yaw=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-dx*speed),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),pitch=new THREE.Quaternion().setFromAxisAngle(right,-dy*speed);camera.position.applyQuaternion(yaw).applyQuaternion(pitch);cameraTarget.applyQuaternion(yaw).applyQuaternion(pitch);camera.up.applyQuaternion(yaw).applyQuaternion(pitch);camera.lookAt(cameraTarget);dirty=true;});
function endDrag(){drag=null;canvas.classList.remove('dragging');}canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('wheel',(e)=>{if(!ready||playing||intro)return;e.preventDefault();transition=null;const offset=camera.position.clone().sub(cameraTarget),factor=Math.exp(clamp(e.deltaY,-100,100)*.0015);offset.multiplyScalar(factor);const candidate=cameraTarget.clone().add(offset);if(candidate.length()>R+.009&&candidate.length()<12){camera.position.copy(candidate);camera.lookAt(cameraTarget);dirty=true;}},{passive:false});
document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden&&playing){playing=false;updatePlayback();}dirty=true;});
canvas.addEventListener('webglcontextlost',(e)=>{e.preventDefault();playing=false;$('map-error').hidden=false;$('map-error').textContent='지구본이 잠시 멈췄어요. 페이지를 새로 열어주세요.';});
window.addEventListener('keydown',(e)=>{if(e.code==='Space'&&e.target===document.body){e.preventDefault();startPlayback();}});
updateUI();initialize();
