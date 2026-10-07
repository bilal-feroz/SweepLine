/**
 * Map → Three.js hand-off. The final map frame is a similarity transform from
 * site metres to screen pixels; a perspective camera looking straight down on
 * the y = 0 plane produces exactly such a transform. So the hand-off pose is
 * solved, not tuned: target = the site point under the 3D canvas centre,
 * height from the map scale and the camera's vertical field of view, heading
 * from the map's screen-up direction.
 */
import * as THREE from 'three';
import type { CameraPose } from '../../three/cameras/CameraRig';
import { apply, invert, multiply, type Affine } from './mapCamera';

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * @param mapToScreen final map camera (SVG km → screen px)
 * @param siteToMap   site metres → SVG km
 * @param canvas      the 3D canvas rectangle on screen
 * @param fovDeg      vertical field of view of the 3D camera
 */
export function handoffPose(mapToScreen: Affine, siteToMap: Affine, canvas: ScreenRect, fovDeg: number): CameraPose {
  const siteToScreen = multiply(mapToScreen, siteToMap);
  const screenToSite = invert(siteToScreen);
  const [tx, tz] = apply(screenToSite, canvas.left + canvas.width / 2, canvas.top + canvas.height / 2);
  // Uniform scale (px per metre) of the similarity transform.
  const k = Math.hypot(siteToScreen[0], siteToScreen[1]);
  const height = canvas.height / 2 / (k * Math.tan((fovDeg * Math.PI) / 360));
  // Screen-up expressed in site coordinates.
  let ux = -screenToSite[2];
  let uz = -screenToSite[3];
  const ul = Math.hypot(ux, uz);
  ux /= ul;
  uz /= ul;
  // A top-down camera faces its screen-up direction when offset a hair the other way.
  const eps = 0.02;
  return {
    pos: new THREE.Vector3(tx - ux * eps, height, tz - uz * eps),
    target: new THREE.Vector3(tx, 0, tz),
  };
}

/** Project a site point (y = 0) through a camera to screen px — used to verify the hand-off. */
export function projectSitePoint(camera: THREE.PerspectiveCamera, canvas: ScreenRect, x: number, z: number): [number, number] {
  const v = new THREE.Vector3(x, 0, z).project(camera);
  return [canvas.left + ((v.x + 1) / 2) * canvas.width, canvas.top + ((1 - v.y) / 2) * canvas.height];
}
