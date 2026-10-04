// 3.0 · Pós-processamento: bloom (brilhos de cristais, lâmpadas, Júpiter, auroras), correção de cor
// com vinheta, e a névoa de altura (bruma que deita nos vales de madrugada e no pântano).
// Qualidade: alta = bloom cheio + MSAA 4×; média = bloom em meia resolução + MSAA 2×; baixa = sem pós.
import * as THREE from 'three';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../lib/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { GTAOPass } from '../lib/addons/postprocessing/GTAOPass.js';
import { game } from './state.js';

// ─── névoa de altura em todos os materiais (antes do primeiro desenho) ───
// x = altura da base da bruma, y = espessura, z = força. Objeto comum (não Vector3) pra todo material
// compartilhar o MESMO valor (o three só clona vetores/cores ao criar os uniforms).
export const heightFog = { x: 0, y: 14, z: 0 };
(function patchFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying float vFogWY;\n#endif';
  C.fog_vertex = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 fogHeight;
	varying float vFogDepth;
	varying float vFogWY;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float hfog = ( 1.0 - smoothstep( fogHeight.x, fogHeight.x + fogHeight.y, vFogWY ) ) * fogHeight.z * smoothstep( 6.0, 140.0, vFogDepth );
	fogFactor = max( fogFactor, min( hfog, 0.85 ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
  for (const sh of Object.values(THREE.ShaderLib)) if (sh.uniforms?.fogColor) sh.uniforms.fogHeight = { value: heightFog };
  THREE.UniformsLib.fog.fogHeight = { value: heightFog };
})();
// fog_vertex usa a posição no espaço da câmera: mundo.y = R^T (mv - t) .y  (a view é rígida)

// ─── correção de cor final (antes da conversão pra tela) ───
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.12 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: 0.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uLift; uniform vec3 uTint; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat) * uTint + uLift;
      // tom cinematográfico: sombras levemente frias, luzes quentes, contraste suave em S
      float lt = clamp(l, 0.0, 1.0);
      c.rgb += mix(vec3(-0.012, 0.0, 0.022), vec3(0.025, 0.012, -0.018), smoothstep(0.15, 0.75, lt));
      vec3 cl = clamp(c.rgb, 0.0, 1.0);
      c.rgb = mix(c.rgb, cl * cl * (3.0 - 2.0 * cl) + max(c.rgb - 1.0, 0.0), 0.18);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = c;
    }`,
};

let composer = null, bloom = null, grade = null, mode = null, ao = null;
export const post = { enabled: false };
game.post = post;

export function setupPost(quality) {
  const r = game.renderer;
  const want = quality === 'baixa' ? 'off' : quality;
  if (want === mode) return;
  mode = want;
  if (composer) { composer.dispose?.(); composer = null; }
  post.enabled = want !== 'off';
  if (!post.enabled) return;
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: want === 'alta' ? 4 : 2 });
  composer = new EffectComposer(r, rt);
  composer.addPass(new RenderPass(game.scene, game.camera));
  // sombrinha de contato nos cantos (oclusão de ambiente): só na qualidade alta
  if (want === 'alta') {
    ao = new GTAOPass(game.scene, game.camera, size.x, size.y);
    ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.2, thickness: 1.5, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
  } else ao = null;
  const bs = want === 'alta' ? 1 : 0.5;
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * bs, innerHeight * bs), 0.5, 0.55, 0.82);
  composer.addPass(bloom);
  grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  resizePost();
}
export function resizePost() {
  if (!composer) return;
  composer.setPixelRatio(game.renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}

// chamado todo quadro: bloom e cor acompanham a hora e os eventos
const _t = new THREE.Vector3();
export function updatePost() {
  const night = game.nightK ?? 0, sky = game.sky;
  // bruma: de madrugada e à noite nos vales; o pântano sempre tem um pouco; some ao meio-dia
  const t = sky?.t ?? 0.5;
  const dawn = Math.max(0, 1 - Math.abs(t - 0.27) / 0.1);
  const swamp = sky?.biomeW?.pantano || 0;
  const want = Math.min(0.75, dawn * 0.65 + night * 0.25 + swamp * 0.35 + (sky?.wetK || 0) * 0.2);
  heightFog.z += (want - heightFog.z) * 0.02;
  heightFog.x = 0;
  heightFog.y = 10 + swamp * 6;
  if (!composer) return;
  bloom.strength = 0.38 + night * 0.4 + (game.natureFx?.aurora || 0) * 0.15 * night;
  bloom.threshold = 0.86 - night * 0.18;
  // noite levemente azulada, entardecer quente
  const gold = Math.max(0, 1 - Math.abs((sky?.astro?.sun?.y ?? 0.5) - 0.02) / 0.25);
  _t.set(1 - night * 0.06 + gold * 0.04, 1 - night * 0.02, 1 + night * 0.06 - gold * 0.05);
  grade.uniforms.uTint.value.copy(_t);
  grade.uniforms.uSat.value = 1.16 - night * 0.1;
}

export function renderFrame(scene, camera) {
  if (composer && post.enabled) composer.render();
  else game.renderer.render(scene, camera);
}
