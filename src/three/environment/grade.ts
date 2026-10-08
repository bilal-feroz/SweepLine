import * as THREE from 'three';

/** Strength of the vibrance lift applied after the filmic curve. */
const VIBRANCE = 0.34;

/**
 * The scene grade as GLSL: the ACES filmic curve (three.js's fit, input already scaled by
 * exposure), then a vibrance lift that boosts muted colours (water, sand, haze) more than
 * already-saturated ones, so the scene reads vivid while the amber/red status colours keep
 * their hue. Shared by the post-processing grade and the direct (thumbnail) render path.
 */
export const GRADE_GLSL = /* glsl */ `
vec3 slAcesFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 slGrade(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  vec3 c = ACESInputMat * (color / 0.6);
  c = clamp(ACESOutputMat * slAcesFit(c), 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(c.r, max(c.g, c.b));
  float s = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
  return clamp(l + (c - l) * (1.0 + ${VIBRANCE.toFixed(3)} * (1.0 - s)), 0.0, 1.0);
}
`;

const STOCK = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const patched = THREE.ShaderChunk.tonemapping_pars_fragment.includes(STOCK);
if (patched) {
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    STOCK,
    `${GRADE_GLSL}\nvec3 CustomToneMapping( vec3 color ) { return slGrade( color * toneMappingExposure ); }`,
  );
}

/** Exposure applied before the grade (renderer and post-processing alike). */
export const SCENE_EXPOSURE = 1.02;

/**
 * Tone mapping for materials drawn straight to the canvas (camera thumbnails). The main view is
 * graded in post-processing (GradeEffect) with the same curve. Falls back to plain ACES if
 * three.js changes its tone-mapping chunk.
 */
export const SCENE_TONE_MAPPING: THREE.ToneMapping = patched ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
