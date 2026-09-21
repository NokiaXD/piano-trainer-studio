// trainer-helpers.js
// Pure helpers extracted from trainer-core.js.
// No DOM, no OSMD, no Tone. State-mutating helpers are NOT here.
// Playback-loop seams live in js/playback.js (they travel with playbackLoop).
// Loaded before score-library.js, scores-ui.js, led.js, feedback-engine.js, and trainer-core.js
// so all downstream modules can call window.PTHelpers.* as plain lookups.

(function () {
    'use strict';

    function parseStaffAssignmentValue(value) {
        if (value === '' || value === '-' || value == null) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function formatStaffAssignmentValue(value) {
        const parsed = parseStaffAssignmentValue(value);
        return parsed == null ? '' : String(parsed);
    }

    function getScoreFileTypeFromName(fileName = '') {
        const lowered = String(fileName || '').toLowerCase();
        if (lowered.endsWith('.mxl')) return 'mxl';
        if (lowered.endsWith('.musicxml')) return 'musicxml';
        return 'xml';
    }

    function getScoreDisplayTitle(fileName = '', fallback = 'Untitled Score') {
        const base = String(fileName || '').trim();
        if (!base) return fallback;
        return base.replace(/\.(musicxml|xml|mxl)$/i, '').trim() || fallback;
    }

    function getMetronomeMidiVelocity(volumePercent, clickVelocity = 100) {
        const volumeScale = Math.max(0, Math.min(100, Number(volumePercent) || 0)) / 100;
        const baseVelocity = Math.max(1, Math.min(127, Math.round(Number(clickVelocity) || 100)));
        return Math.max(1, Math.min(127, Math.round(baseVelocity * volumeScale)));
    }

    function getNoteTie(note) {
        if (!note || !note.tie) return null;
        const notes = note.tie.Notes || note.tie.notes || [];
        if (!notes.length) return null;
        return {
            StartNote: notes[0],
            EndNote: notes[notes.length - 1],
            Notes: notes,
            get NextNote() {
                const idx = notes.indexOf(note);
                return idx >= 0 && idx < notes.length - 1 ? notes[idx + 1] : null;
            }
        };
    }

    function getNoteEffectiveLength(note) {
        const base = Number(note?.Length?.RealValue) || 0;
        const dots = Number(note?.DotsXml) || 0;
        if (dots <= 0 || !Number.isFinite(base)) return base;
        return base * (2 - Math.pow(0.5, dots));
    }

    function cloneScoreRawData(rawData) {
        if (typeof rawData === 'string') return rawData;
        if (rawData instanceof ArrayBuffer) return rawData.slice(0);
        if (ArrayBuffer.isView(rawData)) {
            return rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
        }
        if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
            return rawData.slice(0, rawData.size, rawData.type || '');
        }
        return rawData;
    }

    function normalizeZoomValue(val) {
        const parsed = parseInt(val, 10);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(50, Math.min(150, parsed));
    }

    function getMidiOutExpressionValue(percent) {
        const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
        return Math.max(0, Math.min(127, Math.round((clamped / 100) * 127)));
    }

// ---- Playback-loop seams live in js/playback.js ----
// computeWaitSeconds, advanceAnchorTime, clampTimeToWaitMs, shouldRestartLoopAtBoundary,
// classifyNoteScheduleBranch, shouldDeferFollowScheduling, computeLoopRestartSteps,
// shouldPauseAtEnd, shouldAdoptMeasureTempo, shouldUseCountInForLoopRestart.

window.PTHelpers = {
    parseStaffAssignmentValue,
    formatStaffAssignmentValue,
    getScoreFileTypeFromName,
    getScoreDisplayTitle,
    getMetronomeMidiVelocity,
    getNoteTie,
    getNoteEffectiveLength,
    cloneScoreRawData,
    normalizeZoomValue,
    getMidiOutExpressionValue
};
})();