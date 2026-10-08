import { BlendFunction, Effect } from 'postprocessing';

const fragmentShader = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  // A NaN or infinite pixel would be smeared across the frame by the blur and bloom passes
  // (a black flash): drop it, and cap the HDR range well above anything the scene lights.
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  outputColor = vec4(clamp(c, 0.0, 64.0), inputColor.a);
}
`;

/** Guards the HDR frame before the blur, bloom and grade passes: no NaN, no infinity, no negative light. */
export class SanitizeEffect extends Effect {
  constructor() {
    super('SanitizeEffect', fragmentShader, { blendFunction: BlendFunction.SRC });
  }
}
