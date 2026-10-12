# Blender Train Rig ("Track It") — Project Handoff v9

> **Agent checkpoint.** Read this whole file before touching code or Blender.
> Supersedes handoff v8. Written 12 Oct 2026 after a full review of the latest add-on
> source and every design session so far.

---

## 0. TL;DR for the next agent

- **What it is:** a Blender 3D add-on, **Track It**, single file `Track it compiled 1.py`
  (bl_info still `(1, 32)`, 3,143 lines). It is a framework that makes train animation easy:
  attach vehicles to track curves, drag them along, switch tracks, multi-pivot vehicles
  (bogies/trucks), and consists (trains).
- **Who you work with:** the user (author of the project) designs, tests in a live Blender
  5.1 session, and makes all design calls. You implement, explain and verify.
- **The latest source goes further than v8 describes.** It contains a working consist prototype
  with a distance-based route-history log (see §4.7). The Drag Pad prototype described in v8
  is **not** in this file; it is probably in the user's backed-up "fork" version.
- **A 12-part concept guide exists** in this repo at `docs/concept-guide/`
  (PDF: `docs/concept-guide/pdf/Rail-Animator-Track-It-Concept-Guide.pdf`). It holds the full
  architecture proposal, a code review, workflows, a 2-4-2 locomotive rigging study and a roadmap.
  This handoff summarises it. The guide has the diagrams and detail.
- **Next actions** are listed in §9. The two most important fixes: (1) handlers only update the
  *active* object, which breaks renders and multi-train scenes, and (2) the arc-table cache never
  invalidates when a curve is edited.

---

## 1. Standing rules (do not break these)

1. **The crash rule.** Never create or write constraints on an object from a background handler
   (depsgraph/frame/msgbus) while a 3D transform modal (`TRANSFORM_OT_translate` etc.) is running.
   It caused three byte-identical crashes (`DEG_id_tag_update → BKE_lib_override_id_tag_on_deg_tag_from_user
   → recalcData_objects → transform_modal`). This is why **Mouse Drag is deprecated** and live
   control goes through N-panel widgets (Drag Slider; Drag Pad later).
2. **Never use `bpy.ops.script.reload()`.** It reloads the Blender MCP bridge too and drops the
   connection. Reload only the add-on module with `importlib` (or ask the user to toggle the add-on).
3. **Never leave a modal operator running from a script.** Scripted `transform.translate('INVOKE_DEFAULT')`
   left "zombie" modals with nothing to confirm them. Test modal behaviour by asking the user to
   click, and say clearly that you can't verify it yourself.
4. **Influence is the on/off signal**, not mute/enabled. Every managed Follow Path stays unmuted
   and enabled. Influence is 1.0 = driving, 0.0 = held. Influence keys use CONSTANT interpolation.
5. **One spline per track curve.** Follow Path only ever reads `splines[0]`.
6. **Design talk before code.** The user likes to discuss and diagram a feature first, then build.
   When they say "don't touch Blender / just think", don't run code.
7. **Report honestly.** Say what you verified live and what you couldn't. The user has reverted
   versions more than once after over-confident claims (live switching "worked" for the agent and
   not for the user).
8. **Back up before big changes.** The user keeps versioned copies (v1.18, v1.27, the 1.32 base, a
   "fork"). Before a large patch, remind them to save a copy.
9. **Keep the handoff updated.** At the end of a working stretch the user asks for the next
   handoff version. Write it in this style.

---

## 2. Environment & files

| Item | Where / what |
|---|---|
| Blender | 5.1 on Windows. Add-on path: `C:\Users\Living room desk\AppData\Roaming\Blender Foundation\Blender\5.1\scripts\addons\Track it compiled 1.py` |
| Live access | Blender MCP (`execute_blender_code`, screenshots, API docs), when the user has it running |
| Repo | `brucedell/rail-animator`. Currently holds only `docs/` (this handoff + the concept guide). **The add-on source is not committed yet**; ask the user before adding it. |
| Concept guide | `docs/concept-guide/` (HTML sources in `src/`, PDFs in `pdf/`, rebuild with `node build.mjs && python3 merge.py`) |
| Earlier handoffs | v1–v8 as .docx in the user's claude.ai Project files |
| Noise you can ignore | A different add-on, `bone_weight_splitter`, throws ImportErrors on every depsgraph update. It is not Track It. |

---

## 3. Core mechanism (how it works today)

- **Follow Path in fixed-position mode**: `use_fixed_location = True`, `forward_axis = 'FORWARD_Y'`,
  `up_axis = 'UP_Z'`, `use_curve_follow = True`, `use_curve_radius = False`.
- **`offset_factor` = distance along the curve ÷ curve length** (arc-length based). This was
  confirmed against Blender's own evaluation, so metres ↔ factor is one division. An older note
  that 0.5 ≠ halfway is superseded.
- **Arc table:** `build_arc_table(curve, 5000)` samples `splines[0]` (Bézier formula, or linear for
  poly/NURBS) into `(cumulative_length, world_point)`. `closest_offset_factor()` is a brute-force
  nearest sample → length ÷ total.
- **Attach** computes the factor at the object's current world position, resets the object's
  **local location AND rotation to identity**, reuses an existing constraint for that curve if
  there is one, and sets other Follow Paths to influence 0. (Leftover local transforms were the
  cause of the "jump on attach" and "re-attach sits wrong" bugs.)
- **Detach** runs `visual_transform_apply()` and sets influence to 0. The constraint and its
  keyframes are **kept** for switching.
- **Multiple Follow Paths per object**, one per curve the object has been near, with exactly one
  at influence 1.

---

## 4. Feature state (latest source)

### 4.1 N-panel layout (View3D › Sidebar › Track It)
Track It / Bank It (legacy) → **Vehicle** (pivot list + Pivot Data) → **Consist** (wagon list +
Wagon Data) → **Attach to Track** (target curve, Nearby Curves list, status text, Attach/Detach) →
**Drive** (Live Switching checkbox, Mouse Drag (Deprecated, greyed), Drag Slider, Drag Power,
Keyframe Offset Factor / Remove Switch, Fix Train) → **Switching** (Enter/Exit Range, candidate
buttons) → **Consist Debug** (cumulative distance + history log, Clear Log).

### 4.2 Attach / Nearby Curves  — built
Target curve picker (curves only). Nearby Curves is sorted by nearest point on the curve and
refreshed manually (deliberately no auto handler). Attach/Detach are greyed when they can't apply.

### 4.3 Drive — Drag Slider built, Mouse Drag deprecated
- **Drag Slider** rests at 0.5. Above 0.5 is forward, below is backward, and the distance from
  centre sets speed (× Drag Power, which drags up to 5 and accepts typed values up to 50). It
  springs back to 0.5 after 0.15 s idle. Neither slider is animatable.
- If Live Switching is on, the slider forces `view_layer.update()` and reads the **evaluated**
  position before checking for a switch, because `matrix_world` lags one tick after an offset write.
- **Mouse Drag** (proxy Empty + G, msgbus auto-stop, `window.modal_operators` polling) is still in
  the code but greyed out. **Do not re-enable it.**

### 4.4 Keyframing & switch history — built
- `_track_it_keyframe_all_constraints(obj, frame, kf_type)` keys **offset_factor + influence on
  every held constraint**. kf_type: `EXTREME` = manual switch, `BREAKDOWN` = auto-reconstructed
  switch, none = plain key.
- A switch adds the marker `Switch: {obj.name} -> {curve.name}`. The marker prefix scopes
  cascades per vehicle.
- **Remove Switch** (the button label when the current frame is a switch frame) deletes this
  vehicle's markers and **all** offset/influence keys at and after that frame, hand keys included.
  An `invoke_props_dialog` shows the real counts first.
- **Auto-switch reconstruction:** if Keyframe is pressed on a different curve than the last real
  key recorded, a BREAKDOWN switch is inserted at the midpoint frame. It uses the stashed real
  crossing values in `obj["track_it_last_live_switch"]` (JSON), not the current resting values.
- Fixed bugs: removing several keyframes must be done in **reverse order** (collect first), and
  old code referenced the `mute`/`enabled` paths.
- F-curves live in Blender 5.x **layered actions**: use `_track_it_find_fcurve()`
  (layers → strips → channelbag(slot)). `action.fcurves` does not exist.

### 4.5 Switching — built
- `_track_it_switch_detect_handler` (depsgraph_update_post + frame_change_post, `@persistent`):
  (1) **shadow-syncs** every held non-active constraint's offset to the object's evaluated
  position; (2) scans **all** scene curves (200 samples each) and creates influence-0 constraints
  for curves inside Enter Range; (3) keeps a "ready" set with Enter/Exit hysteresis and shows a
  HUD "N Switches Available" once per approach (only while actively dragging). The HUD is a
  POST_PIXEL draw handler, not a popup, which keeps it crash-safe.
- **Switch button** sets influence, keys everything as EXTREME, adds a marker, and clears
  influence keys **after** the frame so the switch sticks.
- **Live switching** (checkbox, temporary) fires only on (1) crossing a **recorded fork**
  threshold (shared keyed frame where one curve really became active, excluding first keys,
  dead-zone 1e-4), or (2) a **unique continuation** (offset within 0.001 of an end, and exactly one
  held candidate in range). Pure proximity switching was tried and rejected.

### 4.6 Vehicle / pivots — built (same curve only)
- `obj.track_it_vehicle_pivots` (offset in metres, auto-created Empty). The Empty gets its own
  Follow Path on the **root's curve** at `root_offset + offset/length`, clamped to [0,1].
- When the root is not attached, pivots static-snap along the root's local Y every tick.
- The pivot's local transform is reset to identity on every sync (fixes the re-attach jump).
- Pivot Data `rig_object` / `rig_bone` fields are **stored but not wired** to anything.
- **Known gap:** pivots don't cross onto other curves (v8 §3.3). The wagon resolver below can fix
  this (§9).

### 4.7 Consist — prototype (NEW since v8)
- `obj.track_it_consist_wagons`: each wagon is a `root.copy()` (Follow Paths stripped), with
  `offset` = coupling distance to the car ahead. Wagon Data `vehicle_root` is a stub (no library yet).
- The root keeps `track_it_consist_distance` (odometer), `_last_curve/_offset/_delta_sign`, and
  `track_it_consist_history` entries `(distance, from_curve, from_offset, to_curve, to_offset, direction)`.
- `_track_it_find_junction` solves the crossing **geometrically** (endpoints vs curves), so
  spacing doesn't drift across switches. Entries are direction-aware.
  `_track_it_resolve_route_position(obj, d)` walks the partition to find (curve, factor, overflow, exclude).
- A trailing wagon at a curve boundary can **decide a fork itself**
  (`_track_it_find_wagon_continuation`, which excludes the curve it came from) and writes that to
  the shared log.
- `_track_it_prune_stale_history` enforces the invariant "resolving the lead's own distance
  returns the lead's actual curve".
- Timeline-driven passes use `replace_pair` (one entry per junction) so replaying a keyed switch
  is idempotent.
- **Fix Train** / idle-settle runs the sync three times so new entries reach every wagon.

---

## 5. Code review — open issues (line numbers refer to the latest source)

| # | Sev | Issue | Fix direction |
|---|---|---|---|
| 1 | **High** | Both handlers act only on `view_layer.objects.active` (L1171, L2361). Pivots, wagons and shadow sync freeze during playback or renders when something else is selected, or when there are two trains. | Iterate every Track It root; move animation work to `frame_change_pre`. |
| 2 | **High** | The arc cache `_track_it_switch_arc_cache` is keyed by curve **name** and cleared only on unregister (L1036–1046, L3111). Edited curves give stale offsets. | Key by `as_pointer()` + geometry hash (points, handles, tilt, matrix_world, resolution_u, cyclic); invalidate on `depsgraph.updates`. |
| 3 | **High** | Pivots clamp to the root's curve (L1731). | Resolve each pivot via `_track_it_resolve_route_position(root, root_distance + offset)`, as wagons do. |
| 4 | High? | `root.copy()` for wagons (L2554) probably copies Object-level CollectionProperties (pivots, wagons, history) onto the wagon. **Verify in Blender**, then clear them on the clone. | |
| 5 | Med | Every depsgraph tick scans all curves at 200 samples; `closest_offset_factor` is a 5,000-point loop. | Track Network built once + `mathutils.kdtree`. |
| 6 | Med | RNA writes inside `depsgraph_update_post` cause re-trigger passes. | `frame_change_pre` for animation; do the work inside operators/callbacks for UI. |
| 7 | Med | Two history systems (keyframe mining for the root, odometer log for wagons). | Unify (see §7). |
| 8 | Med | Identity by name strings (ready sets, markers, `FollowPath_{curve}`). Renames break links. | UUID custom prop + pointer matching. |
| 9 | Med | `build_arc_table` ignores `use_cyclic_u`; samples per segment rather than by length. | Sample with `mathutils.geometry.interpolate_bezier(..., resolution_u+1)` (the polyline Blender follows), including the closing segment. |
| 10 | Med | Python-only state (ready sets, caches) isn't undo-aware. | Rebuild on `undo_post` / `load_post`. |
| 11 | Low | Drag Slider registers a new timer on every update (L473). | Check `bpy.app.timers.is_registered`. |
| 12 | Low | Leftover mute/enabled writes from the migration. | A one-time "Migrate constraints" operator, then delete. |
| 13 | Low | "Track It"/"Bank It" operators are legacy (they made shrinkwrap planes for the old rig). | Replace with a Track Builder (Geometry Nodes rails/sleepers). |
| 14 | Low | `bl_info` version (1,32), Blender (3,0,0), but the code needs 5.x layered actions. | Bump the version; set the minimum Blender; later use an Extension manifest. |

---

## 6. History of discarded approaches (don't repeat them)

- **Clamp To + shrinkwrap direction/bank planes** (legacy rig): replaced by Follow Path, where
  banking comes from curve tilt.
- **Follow Path "animate path" mode** (frame offset): replaced by fixed position + offset_factor.
- **Moving origins / `origin_set` from script to fix attach jumps**: the fix was zeroing local
  location/rotation instead.
- **Locking the Mouse Drag Empty to an axis**: made horseshoe curves worse, and a crash followed.
  Reverted to v1.18.
- **Making the switch HUD fire during Mouse Drag**: caused three crashes. Abandoned.
- **Live switching triggered only at curve ends (0/1)**: forks can sit mid-curve (≈0.25).
- **Live switching by pure proximity**: switched onto undecided branches and ping-ponged forever
  at thresholds.
- **Pivots written as direct matrices**: replaced by each pivot having its own Follow Path (banking, inspectable).
- **Wagon history sorted by distance value**: wrong while reversing. Replaced by direction-aware
  partition walking.

---

## 7. Proposed direction (from the concept guide — NOT approved yet)

These are recommendations. The user hasn't decided on them. Discuss before building.

1. **Turnout state + occupied path** (guide Part 5). The switch decision lives on a **Junction**
   object (keyframeable THROUGH/DIVERGE). Each train owns a contiguous *occupied path* that is
   extended at the **leading end** (head going forward, tail reversing) through each turnout's state,
   and trimmed at the other end. It is replayed per frame from the start, with a per-frame cache.
   This replaces keyframe mining, shadow sync, the stash and the odometer log, and removes cascade
   deletes. Switchbacks, backing into a siding from the last car, and two trains on one turnout
   work without special cases. Option: "live drag uses current vs next keyed turnout state".
2. **Motion channel = `consist.distance` in metres** (Part 7). One F-curve per train; offsets become
   outputs. Includes a Convert operator for old scenes, and **Bake Train Motion** for farms/exports.
3. **Track Network** (Part 4): built once by Scan Track. It classifies joints / turnouts (with the
   overlap-**span** test, which also fixes the v8 §8.5 yard false positive) / crossings / dead ends.
   Adds Track Doctor validation, Auto Cant (θ ≈ atan(v²/gR), capped about 6°), and Geometry Nodes
   Track Builder plus preset pieces.
4. **Pivot roles** (Part 6): TRACKED (bogie), AXLE_POINT (rigid wheelbase ends), RADIAL (pony
   truck: axle on rail, Damped Track to a pin on the frame), RIGID_MOUNT. The body/frame sits on the
   **chord** between its two defining pivots (chord offset ≈ s²/8R; 0.27 m for an 18 m car on R150).
   **Bind Rig** wires the Pivot Data fields to `TI_`-prefixed constraints. Per-vehicle **facing** ±1
   (`TRACK_NEGATIVE_Y`).
5. **Four layers**, with control flowing down only: Track → Mechanism (add-on) → Control rig
   (artist) → Mesh. Meshes never parent to the mechanism.
6. **Wheels:** AUTO `θ = facing·d/r` via drivers, DIRECT, AUTO+SLIP (`+ slip_angle`),
   AUTO×GRIP (skid). One wheel group per diameter.
7. **Consist:** library vehicles, root at the vehicle centre, coupler distances in the definition
   (`d(k) = d(k−1) − [rear(k−1) + gap + front(k)]`), couple/uncouple as **timeline events**,
   drive from any car, no collisions (clipping is acceptable).
8. **Package/Extension layout** (`core/ mechanism/ rig/ assets/ drive/ ui/ ops/ tests/`) and a
   **headless test suite** (`blender -b -P tests/run.py`).

Worked examples in the guide: **Part 9** (four-wheel mine cart: unrigged model → asset) and
**Part 10** (2-4-2 + two-bogie tender: two vehicles coupled; drivers ±1.05 m set the frame; pony
trucks +/−3.95 m swing about pins at ±2.60 m; crosshead driver `x = r cosθ + √(L² − (r sinθ)²)`;
Walschaerts gear with a `reverser` property; all dimensions illustrative).

---

## 8. Open decisions (the user's call)

| Question | Guide recommends |
|---|---|
| Adopt turnout state + occupied path? | Yes, Phase 3, behind a toggle, with a converter |
| Per-train Route Plan overrides? | Optional, off by default |
| Live drag reads current or next keyed turnout state? | A setting; default current |
| Animate distance instead of offset_factor? | Yes |
| Vehicle root at centre or front coupler? | Centre + coupler distances |
| Turnout toe auto-detected or marker Empty? | Auto + optional override |
| Loco + tender one vehicle or two? | Two, coupled, plus a consist preset |
| Couple/uncouple as timeline events or destructive edits? | Timeline events |
| Remove Mouse Drag once the Drag Pad works? | Yes |
| Joint auto-continue scope? | Per junction now, per vehicle later |

---

## 9. Next actions (in order)

1. **Bump `bl_info`** (version, and minimum Blender 5.x). Ask the user to back up first.
2. **Fix "active object only"** (§5 #1): loop over every object with Track It pivots/wagons in both
   handlers. Test with nothing selected and with two vehicles.
3. **Fix the arc cache** (§5 #2): key by pointer + geometry hash; invalidate on
   `depsgraph.updates` for curve ids. Test by editing a curve after attaching.
4. **Route pivots through `_track_it_resolve_route_position`** (§5 #3). Test with an overlap shorter
   than the pivot offset.
5. **Verify issue #4** (wagon clone inheriting collections) live, and fix if true.
6. **Recover the Drag Pad** prototype from the user's fork (ask them for the file).
7. Start the **headless test harness** (attach_roundtrip, arc_accuracy, render_parity).
8. Then discuss Phase 1 (Track Network) vs Phase 4 (pivot roles / Bind Rig) with the user. See the
   roadmap, guide Part 11.

---

## 10. Quick reference — key functions & properties

| Name | Purpose |
|---|---|
| `build_arc_table`, `closest_offset_factor`, `closest_point_distance_on_curve` | Curve sampling / nearest point |
| `_track_it_get_active_follow_path(obj)` | Active = not muted, enabled, influence > 0.5 |
| `_track_it_get_arc_table_cached` | Arc cache (stale, see #2) |
| `_track_it_ensure_zero_influence_follow_path` | Create a held candidate constraint |
| `_track_it_keyframe_all_constraints(obj, frame, kf_type)` | Key offsets + influence |
| `_track_it_find_fcurve` | Layered-action F-curve lookup |
| `_track_it_find_recorded_switch_point`, `_track_it_find_unique_continuation`, `_track_it_try_live_switch_continue` | Live switching |
| `_track_it_stash_live_switch` / `_get_stashed_live_switch` | `obj["track_it_last_live_switch"]` JSON |
| `_track_it_last_recorded_active_curve` | Auto-switch reconstruction |
| `_track_it_count/delete_switches_from`, `OT_RemoveSwitch_Action` | Cascade removal |
| `_track_it_sync_vehicle_pivots`, `_track_it_snap_pivot_empty` | Pivots |
| `_track_it_update_consist_distance_log`, `_track_it_find_junction`, `_track_it_log_route_change`, `_track_it_resolve_route_position`, `_track_it_prune_stale_history`, `_track_it_find_wagon_continuation`, `_track_it_sync_consist_wagons`, `_track_it_settle_consist` | Consist |
| `_track_it_switch_detect_handler`, `_track_it_vehicle_pivot_handler`, `_track_it_vehicle_pivot_frame_handler` | Handlers (persistent) |
| Scene props | `track_it_target_curve`, `track_it_curve_list(_index)`, `track_it_drag_slider`, `track_it_drag_power`, `track_it_live_switching`, `track_it_switch_enter_distance` (0.15), `track_it_switch_exit_distance` (0.35), `track_it_drag_mode/_empty`, `*_expanded` |
| Object props | `track_it_vehicle_pivots(_index)`, `track_it_consist_wagons(_index)`, `track_it_consist_distance`, `track_it_consist_last_curve/_offset/_delta_sign`, `track_it_consist_history` |

---

## 11. How the user likes to work

- Plain-language explanations with **diagrams**, especially for anything about curves or data flow
  (they asked for a visual explanation of curves; the guide's Part 2 is that).
- Discuss options, recommend one, let them decide. Keep temporary feature toggles until a feature
  has proven itself.
- Small UI requests are common (labels, greying, collapsible boxes, ordering). Do them precisely.
- They test every change live and report back with screenshots or videos. Wait for that before
  calling something done.
- They plan a vehicle **asset library**, **preset track pieces**, and a proxy 2-4-2 with tender as
  the first complex vehicle.
