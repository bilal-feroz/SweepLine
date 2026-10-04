# 3D model drop-in folder

Place optional GLB/GLTF assets here (for example Hyper3D exports). Missing files are
fine — SweepLine falls back to procedural geometry automatically.

| File                  | Used for                                                         |
| --------------------- | ---------------------------------------------------------------- |
| `blue-blubber.glb`    | Jellyfish (one model, instanced for the whole bloom — near LOD)  |
| `coastal-intake.glb`  | Intake structure and screens                                     |
| `breakwater.glb`      | Rock revetment / breakwater                                      |
| `guide-curtain.glb`   | One float element, instanced along the curtain float line        |
| `recovery-throat.glb` | Recovery throat bellmouth                                        |
| `transfer-module.glb` | Transfer module housing                                          |

Adjust scale, rotation and offset in `src/config/assets.ts`. Simulation geometry is in
`src/config/site.ts` and does not change when a model is replaced.
