# Bundled Dependencies

All runtime libraries used by the app are either bundled in this repository or
fetched from npm when running the WLED helper. **No `npm install` is required to
run the web app** — only the optional WLED DDP helper needs Node.js.

## Browser libraries

| Library | Version | License | Path | Integrity |
|---|---|---|---|---|
| Tone.js | 15.5.42 | MIT | `assets/js/Tone.js` | `sha512-3Yzf+4I4avnWsClLvR+r5vxjH47n2nynxA1N/+xy+drJlSjWruU+0D4EKWlKaN/wPs9FnBUb0+gozc+tnHXiRQ==` |
| OpenSheetMusicDisplay | 2.1.3 | BSD-3-Clause | `assets/js/opensheetmusicdisplay.min.js` | `sha256:1bfa2a0a8a7e0bc543435bdec0909cda25db42f8d096dd039ea1cc03ed0c3507` |
| WebMscore | vendored binary | MPL-2.0 | `assets/vendor/webmscore/` | — |

## Server-side helper (optional)

| Component | Version | License | Path | Notes |
|---|---|---|---|---|
| WLED DDP / HTTP-JSON transport helper | 0.1.2 (`helper/server.js`) | AGPL v3 (matches repo) | `helper/` | Node.js 18+. Only required for low-latency WLED (DDP) mode. See [../helper/README.md](../helper/README.md). |

## Audio assets

| Asset | Version | License | Author |
|---|---|---|---|
| Salamander Grand Piano | V2 (Yamaha C5) | CC-BY 3.0 | Alexander Holm |

16 velocity layers, 48 kHz / 24-bit, recorded with two AKG C414 microphones in
an AB position ~12 cm above the strings. Sampled in minor thirds from the
lowest A with hammer noise releases and string resonance.

Path: `assets/audio/salamander/`

## Score conversion (browser-side)

Non-MusicXML formats (MIDI, MuseScore, Guitar Pro) are converted **locally in
the browser** using the vendored WebMscore build in `assets/vendor/webmscore/`.
The wrapper lives at `js/midi-import.js`.

- `.mxl` is **never** sent through the converter — OSMD loads it directly so
  engraving fidelity is preserved (see [Prompt Context.txt](Prompt%20Context.txt)).

## Updating

1. **Tone.js / OSMD**: download the new build from the upstream release,
   replace the file in `assets/js/`, recompute the hash, update the table above.
2. **Salamander / WebMscore**: replace the folder in place; verify the app
   still loads the new files.
3. **WLED helper**: bump `HELPER_VERSION` in `helper/server.js`; no bundled asset to refresh.

## Credits

- Tone.js — https://github.com/Tonejs/Tone.js — MIT
- OpenSheetMusicDisplay — https://github.com/opensheetmusicdisplay/opensheetmusicdisplay — BSD-3-Clause
- WebMscore (LibreScore) — https://github.com/LibreScore/webmscore — MPL-2.0
- Salamander Grand Piano — Alexander Holm — CC-BY 3.0
  http://creativecommons.org/licenses/by/3.0/