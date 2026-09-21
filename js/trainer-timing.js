/**
 * Piano Trainer Studio
 * File: trainer-timing.js
 * Purpose: Centralized timing math for score traversal and playback scheduling.
 * Scope: Time calculations only. Does NOT control cursor rendering, feedback anchors, or UI.
 */

(function () {
    'use strict';

    window.PTTiming = window.PTTiming || {};

    let measureTimingCache = [];

    window.PTTiming.getMeasureTimingInfo = function getMeasureTimingInfo(osmd, measureIndex) {
        const measure = osmd?.Sheet?.SourceMeasures?.[measureIndex] || null;
        const cached = measureTimingCache[measureIndex] || null;
        const activeTimeSignature = measure?.ActiveTimeSignature || osmd?.Sheet?.SourceMeasures?.[0]?.ActiveTimeSignature || null;
        const numerator = Math.max(1, Number(activeTimeSignature?.Numerator) || 4);
        const denominator = Math.max(1, Number(activeTimeSignature?.Denominator) || 4);
        const beatLengthWhole = 1 / denominator;
        const nominalMeasureLengthWhole = numerator * beatLengthWhole;
        const startTimestamp = Number.isFinite(cached?.startTimestamp) ? cached.startTimestamp : 0;

        return {
            numerator,
            denominator,
            beatLengthWhole,
            nominalMeasureLengthWhole,
            actualLengthWhole: Number.isFinite(cached?.actualLengthWhole) ? cached.actualLengthWhole : nominalMeasureLengthWhole,
            startTimestamp
        };
    };

    window.PTTiming.rebuildMeasureTimingCache = function rebuildMeasureTimingCache(osmd, restoreCursorFn) {
        const cursor = osmd?.cursor;
        if (!cursor?.Iterator) {
            measureTimingCache.length = 0;
            return measureTimingCache;
        }

        const savedMeasureIndex = cursor.Iterator.CurrentMeasureIndex;
        const savedTimestamp = cursor.Iterator.currentTimeStamp?.RealValue ?? null;
        const totalMeasures = osmd?.Sheet?.SourceMeasures?.length || 0;
        const nextStarts = new Array(totalMeasures).fill(null);
        const firstEvents = new Array(totalMeasures).fill(null);

        cursor.reset();
        const safetyMax = 100000;
        let safety = 0;
        let previousMeasureIndex = null;

        while (!cursor.Iterator.EndReached && safety < safetyMax) {
            const measureIndex = cursor.Iterator.CurrentMeasureIndex;
            const timestamp = cursor.Iterator.currentTimeStamp?.RealValue ?? null;

            if (firstEvents[measureIndex] == null && Number.isFinite(timestamp)) {
                firstEvents[measureIndex] = timestamp;
            }

            if (previousMeasureIndex != null && measureIndex !== previousMeasureIndex && nextStarts[previousMeasureIndex] == null && Number.isFinite(timestamp)) {
                nextStarts[previousMeasureIndex] = timestamp;
            }

            previousMeasureIndex = measureIndex;
            cursor.Iterator.moveToNext();
            safety += 1;
        }

        measureTimingCache.length = 0;
        let runningStart = 0;
        for (let i = 0; i < totalMeasures; i++) {
            const measure = osmd?.Sheet?.SourceMeasures?.[i] || null;
            const activeTimeSignature = measure?.ActiveTimeSignature || osmd?.Sheet?.SourceMeasures?.[0]?.ActiveTimeSignature || null;
            const numerator = Math.max(1, Number(activeTimeSignature?.Numerator) || 4);
            const denominator = Math.max(1, Number(activeTimeSignature?.Denominator) || 4);
            const nominalMeasureLengthWhole = numerator / denominator;
            const firstTimestamp = Number.isFinite(firstEvents[i]) ? firstEvents[i] : null;
            const explicitStart = firstTimestamp != null ? firstTimestamp : runningStart;
            const nextStart = Number.isFinite(nextStarts[i]) ? nextStarts[i] : null;
            const actualLengthWhole = (nextStart != null && Number.isFinite(explicitStart))
                ? Math.max(0, nextStart - explicitStart)
                : nominalMeasureLengthWhole;

            measureTimingCache[i] = {
                startTimestamp: explicitStart,
                actualLengthWhole,
                nominalMeasureLengthWhole,
                numerator,
                denominator
            };

            runningStart = explicitStart + actualLengthWhole;
        }

        restoreCursorFn(savedMeasureIndex, savedTimestamp);
        return measureTimingCache;
    };

    window.PTTiming._getMeasureTimingCache = function () { return measureTimingCache; };

    // ⚠️ CRITICAL: Structural jump timing (repeats / endings)
    // Do NOT replace these rules with first-note fallback lengths or raw iterator timestamp deltas.
    // Realtime structural traversal must use the playable remainder of the current measure to avoid
    // delay bugs on backward repeats and second-pass ending skips.
    window.PTTiming.getRemainingMeasureWaitWhole = function getRemainingMeasureWaitWhole(options = {}) {
        const {
            currentMeasureIdx,
            currentTimestamp,
            fallbackLength = 1,
            getMeasureTimingInfo
        } = options;

        const fallbackWhole = Number.isFinite(fallbackLength) && fallbackLength > 0 ? fallbackLength : 0.25;
        const timing = typeof getMeasureTimingInfo === 'function' ? getMeasureTimingInfo(currentMeasureIdx) : null;
        const measureStart = Number.isFinite(timing?.startTimestamp) ? timing.startTimestamp : null;
        const measureLength = Number.isFinite(timing?.actualLengthWhole) && timing.actualLengthWhole > 0
            ? timing.actualLengthWhole
            : (Number.isFinite(timing?.nominalMeasureLengthWhole) && timing.nominalMeasureLengthWhole > 0 ? timing.nominalMeasureLengthWhole : null);

        if (!Number.isFinite(currentTimestamp) || measureStart == null || measureLength == null) {
            return fallbackWhole;
        }

        const measureEnd = measureStart + measureLength;
        const remainingWhole = measureEnd - currentTimestamp;
        if (!Number.isFinite(remainingWhole) || remainingWhole <= 1e-6) {
            return fallbackWhole;
        }

        return Math.max(1e-6, remainingWhole);
    };

    window.PTTiming.getTraversalBeatsToWait = function getTraversalBeatsToWait(options = {}) {
        const {
            currentMeasureIdx,
            currentTimestamp,
            nextMeasureIdx,
            nextTimestamp,
            fallbackLength = 1,
            getMeasureTimingInfo
        } = options;

        const remainingMeasureWhole = window.PTTiming.getRemainingMeasureWaitWhole({
            currentMeasureIdx,
            currentTimestamp,
            fallbackLength,
            getMeasureTimingInfo
        });

        if (nextTimestamp < currentTimestamp) {
            return remainingMeasureWhole * 4;
        }

        if (nextMeasureIdx > currentMeasureIdx + 1) {
            return remainingMeasureWhole * 4;
        }

        return (nextTimestamp - currentTimestamp) * 4;
    };
})();
