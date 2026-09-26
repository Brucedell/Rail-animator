# Rail Animator · Track It Framework — Concept Guide

A concept and completion plan for the **Track It** Blender add-on (`Track it compiled 1.py`, bl_info 1.32),
built from handoff v8, the latest add-on source and the design-session transcripts.

## Read it

| File | Contents |
|---|---|
| `pdf/Rail-Animator-Track-It-Concept-Guide.pdf` | Full volume, all Parts, bookmarked |
| `pdf/part00-cover.pdf` | Part 0 · Introduction, reading guide, glossary |
| `pdf/part01-status.pdf` | Part 1 · Where the project stands (history, feature status, code audit) |
| `pdf/part02-curves.pdf` | Part 2 · **Curves explained (visual)**: how Blender curves and Follow Path work, and what Track It adds |
| `pdf/part03-architecture.pdf` | Part 3 · Framework architecture (layers, data model, pipeline, package layout) |
| `pdf/part04-track.pdf` | Part 4 · Track system (arc tables, Track Network, turnouts, cant, Track Doctor) |
| `pdf/part05-switching.pdf` | Part 5 · Switching and route history (turnout state + occupied path proposal) |
| `pdf/part06-vehicles.pdf` | Part 6 · Vehicles and pivots (roles, chord effect, rig binding, Vehicle Definition) |
| `pdf/part07-motion.pdf` | Part 7 · Motion, drive and wheels (distance channel, wheel modes, render-safe evaluation) |
| `pdf/part08-consist.pdf` | Part 8 · Consist system |
| `pdf/part09-asset-workflow.pdf` | Part 9 · Workflow: unrigged model → Track It asset |
| `pdf/part10-242-locomotive.pdf` | Part 10 · Concept study: 2-4-2 steam locomotive + two-bogie tender |
| `pdf/part11-roadmap.pdf` | Part 11 · Roadmap, backlog, test plan, open decisions |

## Rebuild

Sources are plain HTML with inline SVG diagrams in `src/`. Rendering uses Chromium through Playwright,
and merging uses PyMuPDF:

```sh
node build.mjs      # src/partNN-*.html -> pdf/partNN-*.pdf
python3 merge.py    # -> pdf/Rail-Animator-Track-It-Concept-Guide.pdf (with bookmarks)
```
