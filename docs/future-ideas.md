# Future Ideas

Deferred features from brainstorming sessions. Each was considered and intentionally postponed — not forgotten.

---

## Element Gravity (area/weight-based pull)

**Concept:** Larger or more important elements exert stronger "pull" on confidence. Gravity = f(bounding box area) × optional developer-set weight.

**Why deferred:** May be unnecessary — distance factor + trajectory alignment already account for element size implicitly (larger elements are easier to hit with rays and have shorter point-to-AABB distances). Adding explicit gravity risks over-engineering.

**If revisited:** Implement as a pipeline factor: `gravityFactor(ctx) => areaScore * developerWeight`. Easy to add with the factor pipeline architecture.

**Source:** Game dev aim assist — "larger targets have bigger aim cones" (Destiny 2, Resistance 3).

---

## Web Worker Offloading

**Concept:** Move all per-frame math (ray casting, distance, erratic detection) to a Web Worker to keep the main thread free.

**Why deferred:** Current engine runs ~15 elements of math per frame in <0.5ms. Worker overhead (postMessage serialization, context switching) may exceed the computation cost at low element counts. SharedArrayBuffer (the right mechanism for zero-copy) requires COOP/COEP headers many sites don't set.

**If revisited:**
- Use SharedArrayBuffer for the hot path (cursor coords in, scores out).
- Comlink for the setup/teardown control plane.
- Transferable ArrayBuffer double-buffer as fallback when SAB unavailable.
- Only worth it when N > ~50–100 elements AND computation exceeds ~2ms/frame.

**Research:** See librarian research from 2026-03-18 session — full SAB architecture, Atomics.wait patterns, Angular CLI precedent.

---

## Angle-to-Target Gradient Factor

**Concept:** Instead of binary ray-hit (1.0 or 0.0), compute a continuous score based on how well-aligned the velocity vector is with the direction to the element center. Like a game dev "aim cone" — dead-center alignment = 1.0, edge of cone = 0.0.

**Why deferred:** The binary ray-AABB test + soft `rayHitConfidence` (0.85) + tolerance zones provide sufficient gradation. A continuous angle score adds accuracy but duplicates information already captured.

**If revisited:** Implement as a pipeline factor using `acos(dot(velocityDir, targetDir))` normalized by a configurable max cone angle.

**Source:** Aim assist cone model (Destiny 2, Insomniac), CHI 2023 spatiotemporal model (Schneider & Graham).

---

## Template Matching for Endpoint Prediction (Pasqual & Wobbrock)

**Concept:** Store velocity profiles of past pointing movements, use Dynamic Time Warping (DTW) to match the current partial trajectory against templates, predict the most likely destination.

**Why deferred:** Requires training data (either pre-recorded or learned online), O(n²) DTW matching per candidate per frame, and significant implementation complexity. Achieves ~48px accuracy at 75% movement completion.

**If revisited:** Could run as an optional secondary prediction mode alongside the EWMA extrapolation. Best suited for applications with a fixed set of known targets.

**Source:** Pasqual & Wobbrock, CHI 2014. [UW Faculty](https://faculty.washington.edu/wobbrock/pubs/chi-14.02.pdf)
