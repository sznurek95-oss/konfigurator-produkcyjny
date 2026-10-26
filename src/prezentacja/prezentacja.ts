// Tryb prezentacji: realistyczny render do zdjęć produktowych (szuflada z modułami albo pojedynczy model).
//
// Cały kod sceny, światła, materiałów, panelu i zapisu zdjęcia jest tutaj i w widok.ts.
// Z resztą konfiguratora łączy go wyłącznie kontrakt: src/editor/prezentacja-kontrakt.ts
// (dane wejściowe: PresEnv.layout() / PresEnv.single(); wyjście: PresEnv.savePhoto()).
//
// Biblioteki: three.js r128 (globalnie jako THREE) z dodatkami ładowanymi w tools/build.py
// (OrbitControls, RoomEnvironment, EffectComposer, SSAOPass, ShaderPass, GammaCorrectionShader, SimplexNoise).
// Kolejne dodatki three r128 można dopisać w src/prezentacja/biblioteki.txt.
import type { PresApi, PresEnv, PresLayout, PresPhotoOpts, PresSingle, PresSubject } from '../editor/prezentacja-kontrakt.js';
import { findFil } from '../materials/rosa3d.js';
import { mulberry } from '../layout/autofill.js';
import { PRES_CSS, PRES_HTML } from './widok.js';

declare const THREE: any;
const $ = (s: string): any => document.querySelector(s);

let env: PresEnv;
const pres: any = {open:false, shot:'hero', drawer:'oak', bg:'#F4F4F2', la:35, le:55, layers:true, ao:true, size:'2000x2000', wm:'', P:null,
  subj:'layout', rad:'white', one:null, L:null, keep:{}};  // subj: 'layout' (szuflada) albo 'single' (pojedynczy model, np. wieszak)
const isOne = () => pres.subj === 'single';
// otoczenie pojedynczego modelu: rurki grzejnika drabinkowego
const RADS = {
  white:{color:'#F3F3EF', rough:.36, clear:.55, metal:0, env:.45},
  anthracite:{color:'#3B3E42', rough:.48, clear:.35, metal:0, env:.4},
  chrome:{color:'#E4E7EA', rough:.07, clear:0, metal:1, env:1.1},
};
const DRAWERS = {
  oak:{base:'#C9A27A', dark:'#99714C', light:'#DDBB92', rough:.62, grain:true},
  walnut:{base:'#6B4A33', dark:'#45301F', light:'#87624A', rough:.55, grain:true},
  white:{base:'#ECEAE5', rough:.42, grain:false},
  anthracite:{base:'#3A3D41', rough:.55, grain:false}
};
const woodCache = new Map();
function woodTex(kind){
  if(woodCache.has(kind)) return woodCache.get(kind);
  const d = DRAWERS[kind], c = document.createElement('canvas'); c.width = 2048; c.height = 512;
  const x = c.getContext('2d'), rnd = mulberry(kind.length*991 + 7);
  x.fillStyle = d.base; x.fillRect(0, 0, c.width, c.height);
  if(d.grain){
    for(let i=0;i<260;i++){
      const y0 = rnd()*c.height, amp = 2 + rnd()*10, per = 300 + rnd()*900, ph = rnd()*6.28;
      x.strokeStyle = rnd() < .6 ? d.dark : d.light; x.globalAlpha = .04 + rnd()*.16; x.lineWidth = .6 + rnd()*2.6;
      x.beginPath(); for(let px=0; px<=c.width; px+=16){ const py = y0 + Math.sin(px/per*6.28 + ph)*amp + Math.sin(px/97 + ph)*1.2; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    }
    for(let i=0;i<40;i++){ x.globalAlpha = .05 + rnd()*.06; x.fillStyle = d.dark; x.fillRect(rnd()*c.width, rnd()*c.height, 30 + rnd()*120, .8 + rnd()*1.2); }
  }
  const img = x.getImageData(0, 0, c.width, c.height), px = img.data;
  for(let i=0;i<px.length;i+=4){ const n = (rnd() - .5) * (d.grain ? 10 : 5); px[i] += n; px[i+1] += n; px[i+2] += n; }
  x.putImageData(img, 0, 0); x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
  woodCache.set(kind, t); return t;
}
// materiał PLA z wypukłymi ścieżkami warstw (0,2 mm) na ściankach i liniami górnej warstwy
const presMats = new Map();
// axis: kierunek narastania warstw w scenie — 'y' (moduły szuflady) albo 'z' (model drukowany na boku)
function plaMat(hex, axis = 'y'){
  const key = hex + '|' + pres.layers + '|' + axis; if(presMats.has(key)) return presMats.get(key);
  const A = axis === 'z' ? {c:'z', up:'vec4(0.0, 0.0, 1.0, 0.0)', diag:'(vWP.x + vWP.y)', dv:'vec4(0.7071, -0.7071, 0.0, 0.0)'}
                         : {c:'y', up:'vec4(0.0, 1.0, 0.0, 0.0)', diag:'(vWP.x + vWP.z)', dv:'vec4(0.7071, 0.0, -0.7071, 0.0)'};
  const matte = (findFil(hex) || {} as any).matte;
  const m = new THREE.MeshPhysicalMaterial({color:new THREE.Color(hex).convertSRGBToLinear(), metalness:0,
    ...(matte ? {roughness:.88, clearcoat:0, envMapIntensity:.2} : {roughness:.42, clearcoat:.15, clearcoatRoughness:.35, envMapIntensity:.18})});
  const on = pres.layers ? 1 : 0, amp = matte ? .3 : .45;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if(${on}.0 > 0.5){
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float side = 1.0 - smoothstep(0.55, 0.9, abs(wn.${A.c}));
        float t = vWP.${A.c} / 0.2, fw = fwidth(t);
        float a = ${amp.toFixed(2)} * (1.0 - smoothstep(0.35, 0.8, fw)) * side;
        vec3 upV = normalize((viewMatrix * ${A.up}).xyz);
        normal = normalize(normal + upV * sin(t * 6.2831853) * a);
        // nierówności co kilka warstw (lekkie falowanie osi Z) — widoczne także z dalszej odległości
        float t3 = vWP.${A.c} / 0.8, fw3 = fwidth(t3);
        float n3 = sin(t3 * 6.2831853 + sin(vWP.${A.c} * 0.37) * 2.0) * 0.6 + sin(vWP.${A.c} * 2.9 + 1.3) * 0.4;
        normal = normalize(normal + upV * n3 * 0.07 * (1.0 - smoothstep(0.3, 0.9, fw3)) * side);
        float t2 = ${A.diag} / 0.42, fw2 = fwidth(t2);
        float a2 = 0.10 * (1.0 - smoothstep(0.2, 0.55, fw2)) * (1.0 - side);
        vec3 dV = normalize((viewMatrix * ${A.dv}).xyz);
        normal = normalize(normal + dV * sin(t2 * 6.2831853) * a2);
      }`);
  };
  m.customProgramCacheKey = () => 'pla' + on + amp + axis;
  presMats.set(key, m); return m;
}
function presInit(){
  if(pres.P) return true;
  if(!(window as any).THREE){ env.toast('Nie udało się wczytać silnika 3D.'); return false; }
  const host = $('#presHost');
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.appendChild(renderer.domElement);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 5, 20000);
  if(THREE.RoomEnvironment){ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose(); }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a96, .1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, .82); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.5; scene.add(key); scene.add(key.target);
  const fillL = new THREE.DirectionalLight(0xffffff, .12); scene.add(fillL);
  const group = new THREE.Group(); scene.add(group);
  const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, renderer.domElement) : null;
  if(controls){ controls.enableDamping = true; controls.dampingFactor = .1; controls.maxPolarAngle = Math.PI*0.495; controls.screenSpacePanning = true; }
  let composer = null, ssao = null;
  if(THREE.EffectComposer && THREE.SSAOPass && THREE.GammaCorrectionShader){
    composer = new THREE.EffectComposer(renderer);
    // SSAOPass losuje próbki przez Math.random() — na czas tworzenia podstawiamy generator z ziarnem,
    // żeby każde zdjęcie wychodziło identycznie (porównania „przed / po” w tools/prezentacja/podglad.py)
    const rnd0 = Math.random; Math.random = mulberry(20261026);
    try{ ssao = new THREE.SSAOPass(scene, camera, 512, 512); } finally{ Math.random = rnd0; }
    composer.addPass(ssao);
    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  }
  pres.P = {renderer, scene, camera, controls, key, fillL, hemi, group, composer, ssao, host};
  if(controls) controls.addEventListener('change', presDirty);
  new ResizeObserver(presLayout).observe($('#presStage'));
  return true;
}
function presAspect(){ const [w,h] = pres.size.split('x').map(Number); return {w, h, a:w/h}; }
function presLayout(){
  const P = pres.P; if(!P) return;
  const st = $('#presStage'), fr = $('#presFrame'), {a} = presAspect();
  const aw = st.clientWidth - 32, ah = st.clientHeight - 32; if(aw <= 0 || ah <= 0) return;
  let w = aw, h = aw / a; if(h > ah){ h = ah; w = ah * a; }
  fr.style.width = Math.floor(w) + 'px'; fr.style.height = Math.floor(h) + 'px';
  presSetSize(Math.floor(w), Math.floor(h), Math.min(devicePixelRatio, 2));
  pres.dirty = true;
}
function presSetSize(w, h, pr){
  const P = pres.P; P.renderer.setPixelRatio(pr); P.renderer.setSize(w, h, false);
  P.camera.aspect = w / h; P.camera.updateProjectionMatrix();
  if(P.composer){ P.composer.setPixelRatio ? P.composer.setPixelRatio(pr) : 0; P.composer.setSize(w, h); }
}
function presBounds(){
  if(isOne()){ const o: PresSingle = pres.one; return {x0:0, x1:o.size.w, y0:0, y1:o.size.d, z0:0, z1:o.size.h}; }
  const D = (pres.L as PresLayout).drawer, t = pres.drawer === 'none' ? 0 : 16;
  return {x0:-t, x1:D.w + t, z0:-t, z1:D.d + t + (pres.drawer === 'none' ? 0 : 18), y0:pres.drawer === 'none' ? 0 : -10, y1:D.h + 12};
}
function presBuild(){
  const P = pres.P, g = P.group;
  while(g.children.length){ const c = g.children.pop(); if(c.geometry && c.userData.own) c.geometry.dispose(); }
  if(isOne()){ presBuildOne(); return; }
  const L: PresLayout = pres.L, D = L.drawer;
  const none = pres.drawer === 'none', T16 = 16;
  // moduły
  for(const it of L.modules){
    for(const part of it.parts){
      const m = new THREE.Mesh(part.geometry, plaMat(part.color)); m.castShadow = m.receiveShadow = true;
      if(it.rot){ m.rotation.y = Math.PI/2; m.position.set(it.x, 0, it.y + it.w); } else m.position.set(it.x, 0, it.y);
      g.add(m);
    }
  }
  // szuflada
  if(!none){
    const dk = DRAWERS[pres.drawer], tex = woodTex(pres.drawer);
    const board = (L, H, Th, x, y, z, rotY, grainLen) => {
      const t2 = tex.clone(); t2.needsUpdate = true; t2.repeat.set(grainLen/900, H/220); t2.offset.set((x*0.37 + z*0.11) % 1, (y*0.13) % 1);
      const mat = new THREE.MeshPhysicalMaterial({map:t2, roughness:dk.rough, clearcoat: dk.grain ? .1 : .05, clearcoatRoughness:.5, envMapIntensity:.25});
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, H, Th), mat); m.userData.own = true;
      m.rotation.y = rotY || 0; m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m;
    };
    const sideH = D.h + 12;
    board(D.w + 2*T16, 8, D.d + 2*T16, D.w/2, -4, D.d/2, 0, D.w + 2*T16);                       // dno
    board(D.d + T16, sideH, T16, -T16/2, sideH/2 - 8, D.d/2 - T16/2, Math.PI/2, D.d);          // lewy bok
    board(D.d + T16, sideH, T16, D.w + T16/2, sideH/2 - 8, D.d/2 - T16/2, Math.PI/2, D.d);     // prawy bok
    board(D.w, sideH, T16, D.w/2, sideH/2 - 8, -T16/2, 0, D.w);                                 // tył
    const fH = D.h + 22, fW = D.w + 2*T16 + 4;
    board(fW, fH, 18, D.w/2, fH/2 - 10, D.d + 9, 0, fW);                                        // front
    const hm = new THREE.MeshPhysicalMaterial({color:new THREE.Color('#9EA2A6').convertSRGBToLinear(), metalness:.85, roughness:.38, envMapIntensity:.55});
    const hw = Math.min(320, D.w*.45), hd = new THREE.Mesh(new THREE.BoxGeometry(hw, 10, 14), hm); hd.userData.own = true;
    hd.position.set(D.w/2, fH - 10 - 22, D.d + 18 + 7); hd.castShadow = true; g.add(hd);
    [-1,1].forEach(sx => { const leg = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 14), hm); leg.userData.own = true; leg.position.set(D.w/2 + sx*(hw/2 - 14), fH - 10 - 22, D.d + 18 + 7 - 7); g.add(leg); });
  }
  // miękki cień kontaktowy pod szufladą / modułami
  {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const gr = x.createRadialGradient(128,128,40,128,128,128); gr.addColorStop(0,'rgba(0,0,0,0.55)'); gr.addColorStop(.55,'rgba(0,0,0,0.25)'); gr.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0,0,256,256);
    const tx = new THREE.CanvasTexture(c), B = presBounds();
    const cm = new THREE.MeshBasicMaterial({map:tx, transparent:true, depthWrite:false, opacity: pres.bg === '#2A2C2E' ? .9 : .55});
    const cs = new THREE.Mesh(new THREE.PlaneGeometry((B.x1 - B.x0)*1.25, (B.z1 - B.z0)*1.25), cm); cs.userData.own = true;
    cs.rotation.x = -Math.PI/2; cs.position.set((B.x0 + B.x1)/2, (none ? 0 : -8) - 0.05, (B.z0 + B.z1)/2); cs.renderOrder = -1; g.add(cs);
  }
  // podłoże studia (tylko cień)
  const gm = new THREE.ShadowMaterial({opacity: pres.bg === '#2A2C2E' ? .45 : .22});
  const GS = Math.max(D.w, D.d)*6, ground = new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), gm); ground.userData.own = true;
  ground.rotation.x = -Math.PI/2; ground.position.set(D.w/2, none ? -0.01 : -8.01, D.d/2); ground.receiveShadow = true; g.add(ground);
  presBg(); presLight(); pres.dirty = true;
}
// pojedynczy model: wieszak na rurce grzejnika drabinkowego, za nim ściana (tylko cień, w kolorze tła)
function presBuildOne(){
  const P = pres.P, g = P.group, o: PresSingle = pres.one, B = presBounds();
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(o.positions, 3)); bg.computeVertexNormals();
  const hook = new THREE.Mesh(bg, plaMat(o.color.hex, 'z')); hook.userData.own = true; hook.castShadow = hook.receiveShadow = true; g.add(hook);
  const cyl = o.cylinders || [], dark = pres.bg === '#2A2C2E', zc = (B.z0 + B.z1)/2;
  let wallX = B.x0 - 40;
  if(cyl.length && pres.rad !== 'none'){
    const R = RADS[pres.rad];
    const mat = new THREE.MeshPhysicalMaterial({color:new THREE.Color(R.color).convertSRGBToLinear(), roughness:R.rough, metalness:R.metal,
      clearcoat:R.clear, clearcoatRoughness:.18, envMapIntensity:R.env});
    // rurki z modelu + kolejne w tym samym rozstawie (grzejnik drabinkowy), długie — wychodzą poza kadr
    const ys = cyl.map(c => c.y), pitch = cyl.length > 1 ? Math.abs(ys[1] - ys[0]) : 0, top = Math.max(...ys), bot = Math.min(...ys);
    const all = cyl.map(c => ({...c}));
    if(pitch){ for(let k=1;k<=2;k++){ all.push({...cyl[0], y: top + k*pitch}); all.push({...cyl[0], y: bot - k*pitch}); } }
    // ujęcie z boku: krótkie odcinki rurek (przekrój), żeby nie zasłaniały profilu wieszaka
    const len = pres.shot === 'top' ? (B.z1 - B.z0) + 70 : 1400;
    pres.stubs = pres.shot === 'top';
    for(const c of all){
      const m = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, len, 96, 1), mat); m.userData.own = true;
      m.rotation.x = Math.PI/2; m.position.set(c.x, c.y, zc); m.castShadow = m.receiveShadow = true; g.add(m);
    }
    wallX = Math.min(...cyl.map(c => c.x - c.r)) - 45;
  }
  // bez grzejnika: sam wieszak, bez ściany i cienia — czysty wycinek produktu
  if(pres.rad === 'none' || !cyl.length){ presBg(); presLight(); pres.dirty = true; return; }
  const wm = new THREE.ShadowMaterial({opacity: dark ? .32 : .12});
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), wm); wall.userData.own = true;
  wall.rotation.y = Math.PI/2; wall.position.set(wallX, (B.y0 + B.y1)/2, zc); wall.receiveShadow = true; g.add(wall);
  presBg(); presLight(); pres.dirty = true;
}
function presBg(){
  const P = pres.P, tr = pres.bg === 'transparent', useComp = pres.ao && P.composer && !tr;
  P.scene.background = tr ? null : (useComp ? new THREE.Color(pres.bg).convertSRGBToLinear() : new THREE.Color(pres.bg));
  P.renderer.setClearColor(0x000000, tr ? 0 : 1);
  $('#presFrame').style.background = tr ? 'transparent' : pres.bg;
  const dark = pres.bg === '#2A2C2E'; $('#presWm').style.color = dark ? 'rgba(255,255,255,.85)' : 'rgba(27,33,30,.78)';
}
function presLight(){
  if(isOne()){
    const P = pres.P, B = presBounds(), S = Math.max(B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0);
    const c = new THREE.Vector3((B.x0 + B.x1)/2, (B.y0 + B.y1)/2, (B.z0 + B.z1)/2);
    // kąt 0° = światło z boku (oś z), 90° = z przodu, od strony pokoju
    const a = pres.la*Math.PI/180, e = pres.le*Math.PI/180, r = S*6;
    P.key.position.set(c.x + Math.abs(Math.sin(a))*Math.cos(e)*r + S*0.6, c.y + Math.sin(e)*r, c.z + Math.cos(a)*Math.cos(e)*r);
    P.key.target.position.copy(c); P.key.target.updateMatrixWorld();
    const sc = P.key.shadow.camera, ext = S*2.6; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = r*0.2; sc.far = r*2.5; sc.updateProjectionMatrix();
    P.fillL.position.set(c.x + r, c.y + r*0.3, c.z - Math.cos(a)*r);
    pres.dirty = true; return;
  }
  const P = pres.P, D = (pres.L as PresLayout).drawer, S = Math.max(D.w, D.d), cx = D.w/2, cz = D.d/2;
  const a = pres.la*Math.PI/180, e = pres.le*Math.PI/180, r = S*2.2;
  P.key.position.set(cx + Math.sin(a)*Math.cos(e)*r, Math.sin(e)*r, cz + Math.cos(a)*Math.cos(e)*r);
  P.key.target.position.set(cx, 0, cz); P.key.target.updateMatrixWorld();
  const sc = P.key.shadow.camera, ext = S*1.1; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = r*0.3; sc.far = r*2; sc.updateProjectionMatrix();
  P.fillL.position.set(cx - Math.sin(a)*r, r*0.6, cz - Math.cos(a)*r);
  pres.dirty = true;
}
function presShot(kind){
  pres.shot = kind; document.querySelectorAll('#pShot button').forEach((b: any) => b.setAttribute('aria-pressed', b.dataset.v === kind));
  if(isOne()){ presShotOne(kind); return; }
  const P = pres.P, D = (pres.L as PresLayout).drawer, B = presBounds();
  let target = new THREE.Vector3((B.x0 + B.x1)/2, D.h*0.3, (B.z0 + B.z1)/2);
  const rad = Math.hypot(B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0)/2;
  let az = 28, el = 42, fov = 28, k = 1.02;
  if(kind === 'top'){ az = 0; el = 89.5; fov = 24; k = 0.84; target.y = 0; }
  if(kind === 'front'){ az = 0; el = 24; fov = 30; k = 0.98; }
  if(kind === 'detail'){ az = 22; el = 50; fov = 24; k = 0.5; target = new THREE.Vector3(D.w*0.3, D.h*0.2, D.d*0.62); }
  P.camera.fov = fov;
  const dist = rad / Math.sin(fov*Math.PI/360) * k, A = az*Math.PI/180, E = el*Math.PI/180;
  P.camera.position.set(target.x + Math.sin(A)*Math.cos(E)*dist, target.y + Math.sin(E)*dist, target.z + Math.cos(A)*Math.cos(E)*dist);
  P.camera.near = Math.max(2, dist*0.08); P.camera.far = dist*4; P.camera.updateProjectionMatrix();
  if(P.controls){ P.controls.target.copy(target); P.controls.update(); } else P.camera.lookAt(target);
  presAO(); pres.dirty = true;
}
function presShotOne(kind){
  if((kind === 'top') !== !!pres.stubs) presBuild();
  const P = pres.P, B = presBounds(), o: PresSingle = pres.one;
  let target = new THREE.Vector3((B.x0 + B.x1)/2, (B.y0 + B.y1)/2, (B.z0 + B.z1)/2);
  const rad = Math.hypot(B.x1 - B.x0, B.y1 - B.y0, B.z1 - B.z0)/2;
  // azymut 0° = z boku (widać profil), 90° = od frontu (z pokoju)
  let az = 52, el = 16, fov = 26, k = 1.3;
  if(kind === 'top'){ az = 0; el = 2; fov = 24; k = 1.2; }
  if(kind === 'front'){ az = 72; el = 20; fov = 26; k = 1.35; }
  if(kind === 'detail'){ az = 38; el = 26; fov = 24; k = 0.62; target = new THREE.Vector3(o.focus[0], o.focus[1], (B.z0 + B.z1)/2); }
  P.camera.fov = fov;
  const dist = rad / Math.sin(fov*Math.PI/360) * k, A = az*Math.PI/180, E = el*Math.PI/180;
  P.camera.position.set(target.x + Math.sin(A)*Math.cos(E)*dist, target.y + Math.sin(E)*dist, target.z + Math.cos(A)*Math.cos(E)*dist);
  P.camera.near = Math.max(1, dist*0.05); P.camera.far = dist*30; P.camera.updateProjectionMatrix();
  if(P.controls){ P.controls.target.copy(target); P.controls.update(); } else P.camera.lookAt(target);
  presAO(); pres.dirty = true;
}
function presAO(){
  const P = pres.P; if(!P.ssao) return;
  const dist = P.camera.position.distanceTo(P.controls ? P.controls.target : new THREE.Vector3());
  P.ssao.kernelRadius = Math.max(6, dist*0.03); P.ssao.minDistance = 0.0015; P.ssao.maxDistance = 0.05;
}
function presRender(){
  const P = pres.P, tr = pres.bg === 'transparent';
  if(pres.ao && P.composer && !tr) P.composer.render(); else P.renderer.render(P.scene, P.camera);
}
// render tylko gdy coś się zmieniło (ruch kamery, ustawienia) — oszczędza kartę graficzną
function presLoop(){
  if(!pres.open) return;
  const moved = pres.P.controls ? pres.P.controls.update() : false;
  if(moved || pres.dirty){ pres.dirty = false; presRender(); }
  requestAnimationFrame(presLoop);
}
const presDirty = () => { pres.dirty = true; };
function presWm(){ $('#presWm').textContent = pres.wm; }
// ustawienia panelu zależne od tego, co fotografujemy
const PRES_UI = {
  layout:{env:'Szuflada', shots:{hero:'Pod kątem', top:'Z góry', front:'Z przodu', detail:'Detal'},
    opts:[['oak','Dąb naturalny'],['walnut','Orzech'],['white','Biały laminat'],['anthracite','Antracyt'],['none','Bez szuflady (same moduły)']]},
  single:{env:'Grzejnik', shots:{hero:'Pod kątem', top:'Z boku', front:'Z przodu', detail:'Zatrzask'},
    opts:[['white','Biały'],['anthracite','Antracyt'],['chrome','Chrom'],['none','Bez grzejnika (sam wieszak)']]},
};
function presUi(){
  const u = PRES_UI[pres.subj];
  $('#pEnvLbl').textContent = u.env;
  $('#pDrawer').innerHTML = u.opts.map(([v,n]) => `<option value="${v}">${n}</option>`).join('');
  document.querySelectorAll('#pShot button').forEach((b: any) => b.textContent = u.shots[b.dataset.v]);
  $('#pDrawer').value = isOne() ? pres.rad : pres.drawer;
}
function openPres(subj: PresSubject = 'layout'){
  if(subj === 'layout'){
    const L = env.layout(); if(!L){ env.toast('Ułóż najpierw moduły w szufladzie.'); return; }
    pres.L = L;
  }
  if(subj === 'single'){
    pres.one = env.single(); if(!pres.one){ env.toast('Popraw parametry modelu.'); return; }
    // dopóki nie wybrano grzejnika ręcznie: jasny wieszak na antracytowym, ciemny na białym (kontrast na zdjęciu)
    if(!pres.radSet){ const c = new THREE.Color(pres.one.color.hex); pres.rad = (0.2126*c.r + 0.7152*c.g + 0.0722*c.b) > 0.55 ? 'anthracite' : 'white'; }
  }
  // każdy rodzaj ma własne ujęcie i światło — przełączanie nie psuje ustawień drugiego
  if(pres.subj !== subj){
    pres.keep[pres.subj] = {shot:pres.shot, la:pres.la, le:pres.le};
    Object.assign(pres, pres.keep[subj] || (subj === 'single' ? {shot:'hero', la:55, le:40} : {shot:'hero', la:35, le:55}));
    pres.subj = subj;
  }
  $('#presOv').hidden = false; pres.open = true;
  if(!presInit()){ $('#presOv').hidden = true; pres.open = false; return; }
  presUi(); $('#pBg').value = pres.bg; $('#pLightA').value = pres.la; $('#pLightE').value = pres.le;
  $('#pLayers').checked = pres.layers; $('#pAO').checked = pres.ao; $('#pSize').value = pres.size; $('#pWm').value = pres.wm;
  $('#pAO').disabled = !pres.P.composer;
  presLayout(); presBuild(); presShot(pres.shot); presWm(); presInfo(); presLoop();
}
function closePres(){ pres.open = false; $('#presOv').hidden = true; env.closed(pres.subj); }
function presInfo(){
  const {w, h} = presAspect();
  if(isOne()){ $('#pInfo').textContent = `Zdjęcie ${w} × ${h} px, renderowane z podwójną rozdzielczością i zmniejszane, żeby krawędzie były gładkie. Kolor: ${pres.one.color.name}.`; return; }
  const cols = [...new Set((pres.L as PresLayout).colors.map(c => c.name + (c.band ? ' (pas)' : '')))];
  $('#pInfo').textContent = `Zdjęcie ${w} × ${h} px, renderowane z podwójną rozdzielczością i zmniejszane, żeby krawędzie były gładkie. Kolory: ${cols.join(', ')}.`;
}
/** Render w rozdzielczości zdjęcia (z nadpróbkowaniem) do PNG; potem przywraca rozmiar podglądu. */
async function renderPng(w: number, h: number, wm: string): Promise<Blob> {
  const P = pres.P;
  const maxTex = P.renderer.capabilities.maxTextureSize || 8192, ss = Math.max(1, Math.min(2, Math.floor(maxTex / Math.max(w, h))));
  const pr0 = P.renderer.getPixelRatio(), size0 = P.renderer.getSize(new THREE.Vector2());
  presSetSize(w*ss, h*ss, 1);
  presRender();
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const cx = out.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(P.renderer.domElement, 0, 0, w*ss, h*ss, 0, 0, w, h);
  if(wm){
    const fs = Math.round(Math.min(w, h)*0.032), dark = pres.bg === '#2A2C2E';
    cx.font = `600 ${fs}px "Bricolage Grotesque", "Segoe UI", sans-serif`; cx.textAlign = 'right'; cx.textBaseline = 'bottom';
    cx.fillStyle = dark ? 'rgba(255,255,255,.85)' : 'rgba(27,33,30,.78)'; cx.fillText(wm, w - Math.round(w*0.03), h - Math.round(h*0.03));
  }
  if(size0.x > 0 && size0.y > 0){ presSetSize(size0.x, size0.y, pr0); presRender(); }
  return await new Promise(r => out.toBlob(r, 'image/png'));
}
/** Zdjęcie bez otwierania panelu (np. do PDF dla klienta). Ustawienia panelu wracają do poprzednich. */
async function presPhoto(subject: PresSubject, o: PresPhotoOpts = {}): Promise<Blob | null> {
  if(pres.open) return null;
  const data = subject === 'layout' ? env.layout() : env.single(); if(!data) return null;
  const keep = {subj: pres.subj, L: pres.L, one: pres.one, shot: pres.shot, drawer: pres.drawer, rad: pres.rad, bg: pres.bg, la: pres.la, le: pres.le, stubs: pres.stubs};
  try{
    if(!presInit()) return null;
    pres.subj = subject;
    if(subject === 'layout') pres.L = data; else pres.one = data;
    if(o.env){ if(subject === 'layout') pres.drawer = o.env; else pres.rad = o.env; }
    pres.bg = o.bg || '#F4F4F2';
    if(subject !== keep.subj){ const d = subject === 'single' ? {la:55, le:40} : {la:35, le:55}; pres.la = d.la; pres.le = d.le; }
    presBuild(); presShot(o.shot || 'hero');
    return await renderPng(o.w || 1600, o.h || 1600, '');
  }finally{
    Object.assign(pres, keep);
  }
}
async function presSnapshot(){
  const P = pres.P, {w, h} = presAspect(), btn = $('#pShoot');
  btn.disabled = true; $('#presBusy').hidden = false;
  await new Promise(r => setTimeout(r, 30));
  try{
    const blob: Blob = await renderPng(w, h, pres.wm);
    const name = isOne() ? `zdjecie_${pres.one.file}_${pres.shot}_${w}x${h}.png`
      : `zdjecie_organizer_${pres.L.drawer.w}x${pres.L.drawer.d}_${pres.shot}_${w}x${h}.png`;
    await env.savePhoto(name, blob);
  }catch(e){ env.toast('Nie udało się wykonać zdjęcia: ' + (e && e.message || e)); presLayout(); }
  finally{ btn.disabled = false; $('#presBusy').hidden = true; }
}

/** Wstawia panel do strony i podpina obsługę. Wywoływane raz przy starcie konfiguratora. */
export function mountPresentation(e: PresEnv): PresApi {
  env = e;
  const st = document.createElement('style'); st.textContent = PRES_CSS; document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', PRES_HTML);
  $('#presClose').onclick = closePres;
  document.addEventListener('keydown', ev => { if(pres.open && ev.key === 'Escape') closePres(); });
  $('#pShot').addEventListener('click', ev => { const b = ev.target.closest('[data-v]'); if(b) presShot(b.dataset.v); });
  $('#pDrawer').addEventListener('change', ev => { if(isOne()){ pres.rad = ev.target.value; pres.radSet = true; } else pres.drawer = ev.target.value; presBuild(); presShot(pres.shot); });
  $('#pBg').addEventListener('change', ev => { pres.bg = ev.target.value; presBuild(); });
  $('#pLightA').addEventListener('input', ev => { pres.la = +ev.target.value; presLight(); });
  $('#pLightE').addEventListener('input', ev => { pres.le = +ev.target.value; presLight(); });
  $('#pLayers').addEventListener('change', ev => { pres.layers = ev.target.checked; presBuild(); });
  $('#pAO').addEventListener('change', ev => { pres.ao = ev.target.checked; presBg(); pres.dirty = true; });
  $('#pSize').addEventListener('change', ev => { pres.size = ev.target.value; presLayout(); presInfo(); });
  $('#pWm').addEventListener('input', ev => { pres.wm = ev.target.value.trim(); presWm(); });
  $('#pShoot').onclick = presSnapshot;
  return { open: openPres, close: closePres, isOpen: () => pres.open, photo: presPhoto };
}
