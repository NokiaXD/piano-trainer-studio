/**
 * Piano Trainer Studio
 * File: led-preview.js
 * Purpose: Pure LED preview timeline math — entry signatures, state priorities, future-state merging.
 * Scope: No DOM, no AppState mutation, no cursor IO. All inputs are passed in.
 */

(function () {
    'use strict';

    window.PTLedPreview = window.PTLedPreview || {};

    function makeLedPreviewEntrySignature(entries) {
        const parts = [];

        (entries || []).forEach(entry => {
            (entry?.Notes || []).forEach(note => {
                const staffId = Number(note?.ParentStaff?.id) || 0;
                const midi = note?.halfTone != null ? note.halfTone + 12 : 'rest';
                const length = window.PTHelpers.getNoteEffectiveLength(note) || 'na';
                const nt = window.PTHelpers.getNoteTie(note);
                const tieState = (nt && nt.StartNote && nt.StartNote !== note) ? 'tiecont' : 'attack';
                const restFlag = (note?.isRest && note.isRest()) ? 'rest' : 'note';
                parts.push(`${staffId}:${midi}:${length}:${tieState}:${restFlag}`);
            });
        });

        parts.sort();
        return parts.join('|');
    }

    function findMatchingLedPreviewTimelineIndex(timeline, measureIndex, timestamp, signature, startIndex = 0) {
        if (!Array.isArray(timeline) || timeline.length === 0) return -1;

        for (let i = Math.max(0, startIndex); i < timeline.length; i++) {
            const event = timeline[i];
            if (event.measureIndex === measureIndex && event.timestamp === timestamp && event.signature === signature) {
                return i;
            }
        }

        return -1;
    }

    function getLedStatePriority(stateClass) {
        if (!stateClass) return 0;
        if (stateClass === 'expected-l' || stateClass === 'expected-r') return 5;
        if (stateClass === 'future1-l' || stateClass === 'future1-r' || stateClass === 'future2-l' || stateClass === 'future2-r') return 4;
        if (stateClass === 'pressed-l' || stateClass === 'pressed-r') return 2;
        if (stateClass === 'wrong' || stateClass === 'active') return 1;
        return 0;
    }

    function chooseHigherPriorityLedState(currentState, candidateState) {
        return getLedStatePriority(candidateState) > getLedStatePriority(currentState)
            ? candidateState
            : currentState;
    }

    function applyLedFuturePreviewStates(baseStates, previewEvents) {
        const ledStates = new Map(baseStates);

        (previewEvents || []).forEach(event => {
            event.notes.forEach(note => {
                const currentState = ledStates.get(note.midi) || null;
                const nextState = chooseHigherPriorityLedState(currentState, note.state);
                if (nextState && nextState !== currentState) {
                    ledStates.set(note.midi, nextState);
                }
            });
        });

        return ledStates;
    }

    window.PTLedPreview.makeLedPreviewEntrySignature = makeLedPreviewEntrySignature;
    window.PTLedPreview.findMatchingLedPreviewTimelineIndex = findMatchingLedPreviewTimelineIndex;
    window.PTLedPreview.getLedStatePriority = getLedStatePriority;
    window.PTLedPreview.chooseHigherPriorityLedState = chooseHigherPriorityLedState;
    window.PTLedPreview.applyLedFuturePreviewStates = applyLedFuturePreviewStates;
})();