// app-boot.js
// Single-source bootstrap for the Piano Trainer Studio web app.
// Resolves the active asset version, then loads CSS + app scripts in order.
// No document.write. No synchronous XHR. version.json is the only hardcoded version.

(function () {
    'use strict';

    const OVERRIDE_KEY = 'pt_assetVersionOverride';
    const VERSION_JSON_PATH = 'version.json';

    function parseSemverLoose(value) {
        return String(value || '')
            .trim()
            .replace(/^[^\d]*/, '')
            .split(/[\.-]/)
            .map(part => {
                const n = Number(part);
                return Number.isFinite(n) ? n : 0;
            });
    }

    function compareSemverLoose(a, b) {
        const aa = parseSemverLoose(a);
        const bb = parseSemverLoose(b);
        const len = Math.max(aa.length, bb.length, 3);
        for (let i = 0; i < len; i++) {
            const av = aa[i] || 0;
            const bv = bb[i] || 0;
            if (av > bv) return 1;
            if (av < bv) return -1;
        }
        return 0;
    }

    function pickNewestVersion() {
        const candidates = Array.prototype.slice.call(arguments)
            .map(value => String(value || '').trim())
            .filter(Boolean);
        return candidates.reduce((latest, candidate) => {
            if (!latest) return candidate;
            return compareSemverLoose(candidate, latest) > 0 ? candidate : latest;
        }, '');
    }

    function loadScript(src, version) {
        return new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = src + '?v=' + encodeURIComponent(version);
            tag.onload = () => resolve();
            tag.onerror = () => reject(new Error('Failed to load ' + src));
            document.body.appendChild(tag);
        });
    }

    async function bootApp() {
        let assetVersion = '';
        let versionManifest = null;

        try {
            const url = new URL(window.location.href);
            const requestedVersion = String(url.searchParams.get('appv') || '').trim();
            const storedVersion = String(localStorage.getItem(OVERRIDE_KEY) || '').trim();
            assetVersion = pickNewestVersion(requestedVersion, storedVersion);
        } catch (_) {}

        try {
            const resp = await fetch(VERSION_JSON_PATH + '?t=' + Date.now(), { cache: 'no-store' });
            if (resp.ok) {
                versionManifest = await resp.json();
                const jsonVersion = String(versionManifest.version || '').trim();
                assetVersion = pickNewestVersion(assetVersion, jsonVersion) || 'dev';
            }
        } catch (_) {}

        if (!assetVersion) assetVersion = 'dev';

        window.__PT_APP_MANIFEST__ = versionManifest || {};
        window.__PT_ASSET_VERSION__ = assetVersion;

        const cssLink = document.querySelector('link[rel="stylesheet"][data-app-css]');
        if (cssLink) {
            cssLink.href = 'style.css?v=' + encodeURIComponent(assetVersion);
        }

        const appScripts = [
            'assets/js/Tone.js',
            'assets/js/opensheetmusicdisplay.min.js',
            'js/trainer-state.js',
            'js/trainer-helpers.js',
            'js/mxl-parser.js',
            'js/transpose/transpose-engine.js',
            'js/transpose/transpose-ui.js',
            'js/toolbar-ui.js',
            'js/score-library.js',
            'js/scores-ui.js',
            'js/led.js',
            'js/midi.js',
            'js/midi-import.js',
            'js/feedback-engine.js',
            'js/feedback-debug.js',
            'js/trainer-timing.js',
            'js/staff-id.js',
            'js/led-preview.js',
            'js/midi-routing.js',
            'js/virtual-keyboard.js',
            'js/looper-state.js',
            'js/trainer-mode.js',
            'js/fullscreen.js',
            'js/transport.js',
            'js/looper-ui.js',
            'js/playback.js',
            'js/keyboard-input.js',
            'js/trainer-core.js'
        ];

        try {
            for (const src of appScripts) {
                await loadScript(src, assetVersion);
            }
        } catch (err) {
            console.error('Bootstrap failed:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootApp, { once: true });
    } else {
        bootApp();
    }

    window.__PT_COMPARE_SEMVER_LOOSE__ = compareSemverLoose;
    window.__PT_PICK_NEWEST_VERSION__ = pickNewestVersion;
})();