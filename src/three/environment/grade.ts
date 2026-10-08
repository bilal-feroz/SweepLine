import * as THREE from 'three';

/** Strength of the vibrance lift applied after the filmic curve. */
const VIBRANCE = 0.34;

const STOCK = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
const patched = THREE.ShaderChunk.tonemapping_pars_fragment.includes(STOCK);
if (patched) {
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    STOCK,
    /* glsl */ `vec3 CustomToneMapping( vec3 color ) {
  vec3 c = ACESFilmicToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float mx = max( c.r, max( c.g, c.b ) );
  float s = ( mx - min( c.r, min( c.g, c.b ) ) ) / max( mx, 1e-4 );
  return saturate( l + ( c - l ) * ( 1.0 + ${VIBRANCE.toFixed(3)} * ( 1.0 - s ) ) );
}`,
  );
}

/**
 * Scene colour grade for every tone-mapped material: the ACES filmic curve, then a vibrance
 * lift that boosts muted colours (water, sand, haze) more than already-saturated ones, so the
 * scene reads vivid while the amber/red status colours keep their hue. Falls back to plain ACES
 * if three.js changes its tone-mapping chunk.
 */
export const SCENE_TONE_MAPPING: THREE.ToneMapping = patched ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
