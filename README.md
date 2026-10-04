# SweepLine — Adaptive Live Jellyfish Bypass Visualiser

**Don't stop the bloom. Give it another path.**

SweepLine is an engineering design visualiser and agent-based simulation of a temporary marine
guide curtain that diverts seasonal Blue Blubber jellyfish (*Catostylus mosaicus*) blooms away from
a coastal seawater intake. It acts **after** the plant's existing early warning:

```
DETECT → DEPLOY → SWEEP → TRANSFER → RELEASE
```

A smooth curtain is laid upstream of the intake at a shallow angle (15° / 20° / 25° pre-engineered
anchor layouts). The current sweeps jellyfish sideways along it into a large, low-stress recovery
throat. A large-aperture, low-shear transfer module carries them around the protected intake and
releases them alive down-current. **Existing intake screens remain unchanged.**

> Engineering design visualiser. Performance values are simulation estimates and are not
> field-validated. Reference coastal intake geometry is schematic and does not represent
> confidential or exact ENEC facility design.

---

## Run it

Requirements: Node.js 20+ (developed on Node 22) and a WebGL2-capable browser (Chrome / Edge recommended).

```bash
npm install
npm run dev
```

Open http://localhost:5173. The app pre-rolls the simulation for a moment, then opens on the
Overview with SweepLine in live operation.

### Build

```bash
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the production build locally
```

The production build is a static site (everything is bundled locally — no CDN or network needed at
demo time, fonts included).

---

## What's in the application

| Page | Purpose |
| --- | --- |
| **Overview** | AquaTwin-style operations view: live 3D twin, anchored labels, performance rail, timeline, key metrics, live camera views |
| **3D Visualiser** | Full camera set, Flow View, **Compare** (split Baseline vs SweepLine), failure injection, SafeOpen operations, operating envelope, event log |
| **Scenarios** | Normal Bloom, Extreme Bloom, Deep Bloom, High Current, High Waves, Transfer Failure, SafeOpen Demonstration — each with *Load Scenario* and *Run* |
| **Performance** | Baseline vs SweepLine charts and table view (same seed), CSV / JSON export |
| **Environment** | Site inputs, live bloom-depth distribution vs skirt, current–curtain geometry, full operating envelope |
| **System Design** | Process chain, plan-view schematic generated from the simulation geometry, L1/L2/L3 safety architecture, upstream-first reef rule, transfer candidates |
| **Validation** | Built / pending / future status, proposed test programme mapped to the assumptions each test calibrates, development targets (not achieved metrics) |
| **Cost Analysis** | Editable CAPEX/OPEX quote model (AED). No prices are invented — totals are computed only from entered supplier quotations |

**Export Run** (top bar or Performance page) downloads the scenario, seed, parameters, assumptions,
envelope, metrics for both worlds, failures, timeline, event log and metric history as JSON; the
metric history is also available as CSV.

### Suggested 2-minute demo

1. **Compare** — 3D Visualiser → split icon. Left: no SweepLine, the bloom reaches the screens and
   contact rises. Right: same seed, same bloom — it bends along the curtain into the throat, transfer
   runs and the release plume carries animals away. Metrics diverge live.
2. **Underwater** — camera *Underwater*. Watch jellyfish travel along the skirt; deep ones pass
   beneath (red flash, *UNDER-SKIRT ESCAPE +1*). Raise **Skirt Depth** — the winches lower the skirt
   and the next deep jellyfish is intercepted. (Scenario *Deep Bloom* makes this obvious.)
3. **Failure test** — *Inject transfer failure*: primary turns red, standby activates. *Fail standby
   transfer too*: **SAFEOPEN INITIATED** — the upstream end reefs first, existing curtain traffic
   clears through the throat, the rest reefs progressively and the site returns to existing intake
   protection.
4. **Envelope** — push Current Speed or Wave Height past the limit (or run *High Current*):
   **OUTSIDE VALIDATED OPERATING ENVELOPE — DEPLOYMENT NOT RECOMMENDED**.

---

## 3D assets (Hyper3D GLBs)

The scene runs entirely on procedural geometry, and each element can be swapped for a GLB/GLTF
model without touching simulation logic. Drop files into **`public/models/`**:

| File | Replaces |
| --- | --- |
| `blue-blubber.glb` | Jellyfish (one model, instanced for the whole bloom; used for the near LOD) |
| `coastal-intake.glb` | Intake structure and screens |
| `breakwater.glb` | Rock revetment / breakwater |
| `guide-curtain.glb` | One float element, instanced along the curtain float line |
| `recovery-throat.glb` | Recovery throat bellmouth |
| `transfer-module.glb` | Transfer module housing |

Missing files are detected (HEAD request) and the procedural fallback is used silently — no broken
models. Draco- and Meshopt-compressed GLBs are supported (decoders are bundled from three.js).

### Adjusting model transforms

Edit **`src/config/assets.ts`**: per asset `url`, `enabled`, `scale` (uniform or `[x, y, z]`),
`rotation` (degrees, XYZ) and `offset` (world metres, y-up, still water at y = 0). The jellyfish
model is merged into one geometry, normalised to a 1.0 m bell diameter (bell up = +y) and given
animation attributes automatically, so the pulse/arm-sway shader works on any model.

---

## Where things live

```
src/
  config/
    site.ts               Reference site geometry (shore, intake mouth, curtain end, throat, pipe route, release), bathymetry
    assumptions.ts        Every simulation & design assumption (agent motion, curtain interaction, throat, transfer, SafeOpen timing, loads)
    operatingEnvelope.ts  Assumed operating-envelope thresholds (hard limits vs advisory)
    assets.ts             Replaceable GLB paths and transforms
  simulation/             Pure TypeScript — no three.js
    SimulationEngine.ts   Agent-based engine (one per world)
    Agent.ts              Typed-array agent pool + states
    geometry.ts           Curtain layouts (15/20/25°), funnel curve, throat bellmouth, spatial grid
    flowField.ts          Current field (shore slow-down, intake draw, throat draw, release jet)
    curtain.ts            Curtain deploy / reef / unreef / stow state and per-segment skirt depth
    transfer.ts           Primary / standby / passive transfer paths
    waves.ts              Shared sea-state model (also generates the water shader GLSL)
    safety.ts             Operating-envelope evaluation + SafeOpen sequencing
    metrics.ts            Metric definitions (all derived from simulation state)
    scenarios.ts          Scenario presets and scripts
    SimController.ts      Runtime: both engines in lock-step, timeline, events, failures, history, export
    seededRandom.ts       Deterministic RNG and stateless per-agent noise
  three/
    SceneManager.ts       Renderer, scene graph, single + split (scissor) rendering, picking, thumbnails
    environment/          Sky, ocean shader, seabed, coast & intake, underwater FX, shared light-transport shader chunks
    systems/              JellyfishSystem, CurrentField, CurtainSystem, TransferSystem, ReleaseSystem, LabelSystem, Annotations
    cameras/              Camera presets and smooth transitions
    assets/               GLB loader + procedural fallbacks (jellyfish, rocks, workboat)
  components/, pages/     React UI (Tailwind CSS v4, lucide-react, Recharts)
```

The simulation runs outside React: one `requestAnimationFrame` loop advances the engines with a
fixed time step and renders the scene; React receives throttled snapshots (~8 Hz) only.

---

## How Baseline vs SweepLine works

Two `SimulationEngine` instances run **in lock-step** at all times — `baseline` (no SweepLine, no
transfer) and `sweepline` — with the **same seed and parameters**:

- Spawning consumes a fixed number of draws per jellyfish from a seeded generator, so both worlds
  receive an identical bloom: same spawn times, positions, depths, sizes and swim parameters.
- Per-agent stochastic motion comes from stateless hashes of *(agent id, time)*, so an individual
  follows exactly the same path in both worlds until SweepLine changes it.
- Environmental stress tests (current, waves, bloom depth/density) apply to both worlds; transfer
  and curtain faults apply only to SweepLine.

The Baseline / SweepLine toggle chooses which world is displayed; **Compare** renders both side by
side with one renderer (scissor viewports). Changing the seed or the agent budget restarts both.

**Metric definitions** (`src/simulation/metrics.ts`) — percentages use resolved outcomes only:

- *Intake contact* = agents reaching the screens ÷ (contacts + diverted + passed the intake line)
- *Diversion efficiency* = reached the recovery throat ÷ resolved curtain encounters
- *Under-skirt escape* = passed beneath the skirt ÷ resolved curtain encounters
- *Transfer utilisation* = throughput ÷ available transfer capacity
- *Screen load* = contact rate per minute (5-min window) per 1000 agents → LOW / MEDIUM / HIGH

The agent model is a kinematic engineering simulation — **not CFD and not validated field
performance**. Each assumption is named in `src/config/assumptions.ts` and mapped to the test that
will calibrate it on the Validation page.

---

## Creating a new scenario

Add an entry to `SCENARIOS` in **`src/simulation/scenarios.ts`**:

```ts
{
  id: 'night-surge',
  name: 'Night Surge',
  tagline: 'Dense patch arrives during operation',
  description: 'What the scenario shows…',
  demonstrates: ['Throat congestion'],
  params: { bloomDensity: 0.9, currentSpeed: 0.3, skirtDepth: 3.0, anchorAngle: 20 },
  start: 'steady',             // 'sequence' = from bloom approach; 'steady' = pre-rolled operation
  script: [                     // optional timed actions (simulated seconds after start)
    { at: 40, action: { kind: 'fail', failure: 'highDensity' } },
    { at: 120, action: { kind: 'params', params: { waveHeight: 1.3 }, message: 'Sea state increasing' } },
  ],
  tone: 'stress',               // 'nominal' | 'stress' | 'failure'
}
```

It appears automatically on the Scenarios page and in the top-bar scenario menu. Outcomes are always
computed by the agent model, never scripted.

---

## Standby transfer line

- **In the app:** 3D Visualiser → *Safety* tab → *Transfer System* → **Standby transfer path armed**.
  Disarm it, then *Inject transfer failure*: with no standby, SafeOpen starts immediately.
- **Default:** `standbyEnabled` in `DEFAULT_PARAMS` (`src/simulation/types.ts`); scenarios can
  override it in their `params`.
- **Behaviour:** `standbyActivationTime` and `passiveDrainFraction` (the residual open-flow line used
  while SafeOpen clears existing traffic; set it to `0` to model no passive path) are in
  `src/config/assumptions.ts`. The Cost Analysis page has an independent toggle to include or
  exclude the optional standby module from CAPEX.

## Operating envelope

Thresholds live in **`src/config/operatingEnvelope.ts`**. *Hard* limits block deployment and, when
exceeded during operation for `safeOpen.violationDwell` seconds, trigger SafeOpen automatically.
*Advisory* limits (bloom deeper than the deepest skirt) report a recommended action — SweepLine
would be ineffective, not unsafe. The anchor layout is fixed while deployed: selecting another
layout restarts the run and redeploys on the new pre-engineered anchors.

---

## Developer tools

```bash
npm run calibrate -- minutes=40 skirtDepth=2.5   # headless Baseline vs SweepLine metrics for any parameters
npm run test:scenario -- safeopen 9             # headless event log for a scenario (id, minutes)
npm run test:lifecycle                           # SafeOpen → stow → redeploy → anchor change
```

In `npm run dev`, `window.__sl` exposes the controller and scene; `await __sl.shot('name')` and
`await __sl.page('name')` save PNG captures of the 3D view / whole UI to `.snapshots/` (dev server
only — handy for slides).

## Performance notes

Instanced jellyfish (two LODs, ~1–2k agents per world), shared materials, typed-array agent
storage, a static shadow map, and React updates at ~8 Hz keep the app at 60 FPS on a typical
modern laptop. Measured CPU+GPU frame cost on the development machine: ~6 ms single view,
~9 ms compare + Flow View.
