/**
 * Piano Trainer Studio
 * File: looper-state.js
 * Purpose: Pure looper bounds math — clamping, initial bounds, range checks.
 *          No DOM. Caller passes the raw input values and (optionally) the
 *          "last changed" id so the clamp logic can decide which side to
 *          snap when min > max.
 * Scope: AppState reads/writes are NOT performed here. The UI layer (see
 *        looper-ui.js) is responsible for reading inputs, calling these
 *        helpers, and writing AppState + DOM.
 */

(function () {
    'use strict';

    window.PTLooperState = window.PTLooperState || {};

    function getInitialLooperBounds(totalMeasures) {
        const n = Math.max(1, Number(totalMeasures) || 1);
        return { min: 1, max: n };
    }

    function normalizeLooperBounds({ minVal, maxVal, maxAllowed, changedId = null } = {}) {
        const cap = Math.max(1, Number(maxAllowed) || 1);

        let min = parseInt(minVal, 10);
        let max = parseInt(maxVal, 10);
        if (!Number.isFinite(min) || min < 1) min = 1;
        if (!Number.isFinite(max) || max < 1) max = 1;
        if (min > cap) min = cap;
        if (max > cap) max = cap;

        if (min > max) {
            if (changedId === 'slider-loop-min' || changedId === 'val-loop-min') {
                max = min;
            } else if (changedId === 'slider-loop-max' || changedId === 'val-loop-max') {
                min = max;
            } else {
                max = min;
            }
        }

        return { min, max };
    }

    function isMeasureInLooperBounds(measureIdx0Indexed, looperMin, looperMax) {
        if (measureIdx0Indexed == null || looperMin == null || looperMax == null) return false;
        const idx = Number(measureIdx0Indexed);
        const lo = Number(looperMin);
        const hi = Number(looperMax);
        if (!Number.isFinite(idx) || !Number.isFinite(lo) || !Number.isFinite(hi)) return false;
        if (lo > hi) return false;
        return idx >= lo - 1 && idx <= hi - 1;
    }

    function getNextLooperStep(currentValue, delta, fallback) {
        const base = Number.isFinite(parseInt(currentValue, 10))
            ? parseInt(currentValue, 10)
            : (Number.isFinite(parseInt(fallback, 10)) ? parseInt(fallback, 10) : 1);
        return base + delta;
    }

    window.PTLooperState.getInitialLooperBounds = getInitialLooperBounds;
    window.PTLooperState.normalizeLooperBounds = normalizeLooperBounds;
    window.PTLooperState.isMeasureInLooperBounds = isMeasureInLooperBounds;
    window.PTLooperState.getNextLooperStep = getNextLooperStep;
})();