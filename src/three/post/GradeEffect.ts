import { BlendFunction, Effect } from 'postprocessing';
import { Uniform } from 'three';
import { GRADE_GLSL, SCENE_EXPOSURE } from '../environment/grade';

const fragmentShader = /* glsl */ `
uniform float exposure;
${GRADE_GLSL}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(slGrade(inputColor.rgb * exposure), inputColor.a);
}
`;

/** The scene grade (ACES filmic + vibrance) as a post-processing effect: linear HDR in, display-referred linear out. */
export class GradeEffect extends Effect {
  constructor(exposure = SCENE_EXPOSURE) {
    super('GradeEffect', fragmentShader, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([['exposure', new Uniform(exposure)]]),
    });
  }
}
