# Architecture

## Current structure
- `/assets/js` = vendored third-party browser libraries (Tone.js, OpenSheetMusicDisplay) — see [DEPENDENCIES.md](DEPENDENCIES.md) for versions and integrity hashes
- `/assets/vendor` = vendored native binaries (WebMscore) for in-browser score conversion
- `/assets/audio` = static audio assets (Salamander piano samples)
- `/helper` = Node.js WLED DDP transport helper (see [../helper/README.md](../helper/README.md))
- `/js` = app modules, each with focused ownership
- `/js/transpose` = key/semitone transpose subsystem
- `/js/app-boot.js` = module loader (resolves version, then loads CSS + scripts in order; no document.write)
- `trainer-core.js` = remaining integration layer: boot, score render lifecycle, settings load/apply, transport event wiring, osmd instance ownership
- `/docs` = architecture, dev notes, and product review

## Module ownership

### Boot + state + helpers
- `js/app-boot.js` — non-blocking bootstrap; loads `version.json`, resolves asset version, then loads CSS + scripts in dependency order
- `js/trainer-state.js` — `AppState` (top-level `const`) + persisted preference helpers + app version manifest
- `js/trainer-helpers.js` — pure OSMD-shaped helpers under `window.PTHelpers` (`getNoteTie`, `getNoteEffectiveLength`, `normalizeZoomValue`, `getMidiOutExpressionValue`, playback seams, etc.)

### Timing + staff + score
- `js/trainer-timing.js` — `measureTimingCache` + `getMeasureTimingInfo` + `rebuildMeasureTimingCache` + jump math. Exposes `window.PTTiming`
- `js/staff-id.js` — `globalStaffIdentityMap` + resolution helpers. Exposes `window.PTStaff`
- `js/mxl-parser.js` — MXL unzip + DOM normalization for OSMD
- `js/score-library.js` — IndexedDB-backed score store + import/export/rename/folders/recent
- `js/scores-ui.js` — scores drawer UI shell
- `js/transpose/transpose-engine.js` — pure key/semitone transpose
- `js/transpose/transpose-ui.js` — transpose menu wiring

### MIDI + input
- `js/midi.js` — WebMIDI setup, selectors, connection state wiring, MIDI Out routing
- `js/midi-routing.js` — pure routing decisions (audio/MIDI out per source). Exposes `window.PTMidiRouting`
- `js/midi-import.js` — wrapper around webmscore for non-MusicXML formats (MIDI / MuseScore / Guitar Pro)
- `js/keyboard-input.js` — `createKeyboardInput(deps)` factory returning `triggerVirtualKey`; 1 pure seam `resolveLiveVelocity`. Exposes `window.PTKeyboardInput` and `window.keyboardInput`

### Practice + playback + transport
- `js/playback.js` — `createPlaybackLoop(deps)` factory + 10 pure seams + `getCombinedTieLength`. Exposes `window.PTPlayback` and `window.playbackLoop`
- `js/trainer-mode.js` — mode settings + hand-role resolution. Exposes `window.PTMode`
- `js/transport.js` — play/pause/reset + transient playback state. Exposes `window.PTTransport`
- `js/looper-state.js` — pure looper bounds math (4 helpers). Exposes `window.PTLooperState`
- `js/looper-ui.js` — looper UI wiring (sliders, +/- steppers, hold-to-repeat, count-in)

### Feedback + LED
- `js/feedback-engine.js` — `buildExpectedNotesFromEntries` + `processMissedNotes` + `enforceLooperBounds`. Uses `PTLooperState`
- `js/feedback-debug.js` — developer-only feedback diagnostics + sticky debug overlays (off by default)
- `js/led.js` — LED simulator + WLED + MIDI LED output + health check + calibration
- `js/led-preview.js` — pure LED preview timeline math. Exposes `window.PTLedPreview`
- `js/virtual-keyboard.js` — `renderVirtualKeyboard` + key state classes + inline key visuals. Exposes `window.PTVirtualKeyboard`

### Shell
- `js/toolbar-ui.js` — top static menu + popup launchers
- `js/fullscreen.js` — fullscreen toggle. Exposes `window.PTFullscreen`

### Core
- `js/trainer-core.js` — boot wiring, `osmd` instance, transport event handlers, `playbackLoop` and `keyboardInput` factory wiring

All modules load via `app-boot.js` in dependency order. No build step, no bundler, no framework.

## Timing module boundary
- `js/trainer-timing.js` is shared infrastructure for all practice modes
- It answers **how long** structural traversal should wait
- It must not directly move the cursor, render feedback, or update UI
- `trainer-core.js` remains the orchestrator that decides **when** each mode advances
- Realtime structural jumps should use current-measure remainder timing instead of first-note fallbacks or raw iterator deltas (see [Repeat marker delays - fixes.txt](Repeat%20marker%20delays%20-%20fixes.txt))

## Why `trainer-core.js` stays together for now
The remaining file still owns the most timing-sensitive systems:
- playback scheduling
- repeat/jump traversal
- metronome behavior and drift fixes
- count-in handoff
- score render lifecycle coordination
- LED preview timeline (cursor IO + state)

LED preview timeline and staff visibility are deliberately deferred — both share too much state with `playbackLoop` and `AppState.visualNotesToStart` to split safely yet. Splitting them will require a `js/osmd-instance.js` extraction first (currently only `PTTiming` and `PTStaff` take `osmd` as a parameter).

## Fragile systems
- Feedback-note anchor positioning and resize stability (anchor to **original rendered** VexFlow coordinates, never recalculated)
- Beam/layout rendering stability (do not re-layout beams on resize)
- Playback repeat/jump timing (use measure-remainder timing, not iterator deltas)
- Metronome sync and drift behavior (hybrid metronome + Tone.Transport)
- LED shared frame pipeline (simulator + WLED + MIDI LED read from one frame buffer)
- MXL handling: **never** send `.mxl` through webmscore normalization; OSMD handles it natively

## Commenting standard
- Minimal HTML comments only when script order is non-obvious
- Short ownership header comments at the top of app JS files
- Targeted warning comments above fragile functions only
- Larger structure notes belong in `/docs`, not in `index.html`

## Debug rule
- `js/feedback-debug.js` is developer-only diagnostic tooling
- It must not own production feedback matching or anchor-placement rules
- Debug is off by default — no console spam, no overlays

## Render-system rules (do not break)
See [Prompt Context.txt](Prompt%20Context.txt). Short version:
1. Beam groups must not drift on resize (anchor to original stave X positions).
2. Feedback notes must use cached layout coordinates — never recalculated positions.
3. MIDI fallback notes must not place sharps/flats on incorrect staff lines.
4. Clef changes must not affect feedback note placement.
5. Debug overlays must not interfere with rendering layers.
6. `.mxl` files must not pass through converter normalization.

## Version + release
- `version.json` is the single source of truth for the app version and update URL
- `app-boot.js` resolves it at startup; `trainer-state.js` reads it via `window.__PT_ASSET_VERSION__`
- Bump `version.json` before each release; the updater compares and prompts

## Renames
- `app.js` was renamed to `trainer-core.js` once the first round of module boundaries was extracted
- The rename is organizational only; playback/rendering logic remains together on purpose

## Notes
- First-run defaults can differ from what the menu shows if `localStorage` has `0` — check the storage helper before assuming a bug
- When stable, plan to drop the Node.js install requirement and ship an included Mac/Win runtime