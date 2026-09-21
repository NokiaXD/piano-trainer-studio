/**
 * Piano Trainer Studio
 * File: virtual-keyboard.js
 * Purpose: Renders the on-screen keyboard LEDs and DOM keys from current cursor + playback state.
 * Scope: One function entry — renderVirtualKeyboard(currentEntries, currentMeasureIdx, currentTimestamp).
 *        Reads AppState. Calls DOM and LED hardware. No internal AppState mutation beyond filter on sustainedVisuals.
 */

(function () {
    'use strict';

    window.PTVirtualKeyboard = window.PTVirtualKeyboard || {};

    const KEY_STATE_CLASSES = ['expected-l', 'expected-r', 'pressed-l', 'pressed-r', 'wrong', 'active', 'future1-l', 'future1-r'];

    function getFuturePreviewDepth() {
        if (!AppState.futurePreviewEnabled) return 0;
        return AppState.futurePreviewEnabled ? 1 : 0;
    }

    function applyInlineKeyVisual(el, state) {
        if (!el) return;
        el.style.filter = '';
        el.style.boxShadow = '';
        el.style.transform = '';
    }

    function renderVirtualKeyboard(currentEntries = null, currentMeasureIdx = null, currentTimestamp = null) {
        const desiredStates = new Map();
        const previewStateMap = new Map();

        if (AppState.ledCalibrationMode) {
            if (AppState.ledCalibrationSelectedMidi != null && isMidiInPlayerRange(AppState.ledCalibrationSelectedMidi)) {
                desiredStates.set(AppState.ledCalibrationSelectedMidi, 'calibration');
            }

            LedEngine.renderFromStates(desiredStates);
            LedEngine.renderOutputs();

            for (let i = 21; i <= 108; i++) {
                const desiredClass = AppState.ledCalibrationSelectedMidi === i ? 'active' : null;
                const el = document.querySelector(`.key[data-midi="${i}"]`);
                if (el) {
                    el.classList.toggle('out-of-range', !isMidiInPlayerRange(i));
                    KEY_STATE_CLASSES.forEach(cls => el.classList.remove(cls));
                    if (desiredClass) el.classList.add(desiredClass);
                    applyInlineKeyVisual(el, desiredClass);
                }
            }

            return;
        }

        if ((AppState.mode === 'wait' || AppState.mode === 'follow') && Number.isFinite(currentTimestamp)) {
            AppState.sustainedVisuals = AppState.sustainedVisuals.filter(n => {
                return !Number.isFinite(n.endTimestamp) || currentTimestamp < n.endTimestamp;
            });
        }

        AppState.sustainedVisuals.forEach(n => {
            if (!isMidiInPlayerRange(n.midi)) return;
            const handRole = getAssignedHandRoleForStaff(n.staffId);
            desiredStates.set(n.midi, handRole === 'left' ? 'expected-l' : 'expected-r');
        });
        AppState.visualNotesToStart.forEach(n => {
            if (!isMidiInPlayerRange(n.midi)) return;
            const handRole = getAssignedHandRoleForStaff(n.staffId);
            desiredStates.set(n.midi, handRole === 'left' ? 'expected-l' : 'expected-r');
        });

        const previewDepth = getFuturePreviewDepth();
        let previewEvents = previewDepth > 0 ? (AppState.lastLedPreviewEvents || []) : [];

        if (currentEntries && currentMeasureIdx !== null && currentTimestamp !== null) {
            previewEvents = collectFutureLedPreviewEvents(
                currentEntries,
                currentMeasureIdx,
                currentTimestamp,
                previewDepth
            );
            AppState.lastLedPreviewEvents = previewEvents;
        }

        (previewEvents || []).forEach(event => {
            event.notes.forEach(note => {
                const currentState = previewStateMap.get(note.midi) || null;
                const nextState = window.PTLedPreview.chooseHigherPriorityLedState(currentState, note.state);
                if (nextState && nextState !== currentState) {
                    previewStateMap.set(note.midi, nextState);
                }
            });
        });

        AppState.pressedKeys.forEach(midi => {
            const previewState = previewStateMap.get(midi) || null;
            if (
                AppState.heldCorrectNotes.has(midi) &&
                (previewState === 'future1-l' || previewState === 'future1-r')
            ) {
                AppState.preExpectedHeldNotes.add(midi);
            }

            const currentState = desiredStates.get(midi) || null;
            const isCarryHeldIntoExpected =
                AppState.preExpectedHeldNotes.has(midi) &&
                (currentState === 'expected-l' || currentState === 'expected-r');

            if (isCarryHeldIntoExpected) {
                desiredStates.set(midi, currentState);
            } else if (currentState === 'expected-l' || currentState === 'expected-r') {
                if (AppState.correctHighlightEnabled) {
                    desiredStates.set(midi, currentState === 'expected-l' ? 'pressed-l' : 'pressed-r');
                } else {
                    desiredStates.set(midi, currentState);
                }
            } else if (previewState === 'future1-l' || previewState === 'future1-r') {
                desiredStates.set(midi, previewState);
            } else if (AppState.heldCorrectNotes.has(midi)) {
                const hasActiveSustainForMidi = AppState.sustainedVisuals.some(v => v.midi === midi)
                    || AppState.visualNotesToStart.some(v => v.midi === midi)
                    || AppState.expectedNotes.some(n => n.midi === midi);

                if (hasActiveSustainForMidi) {
                    if (AppState.correctHighlightEnabled) {
                        const staffId = AppState.heldCorrectNotes.get(midi);
                        desiredStates.set(midi, getAssignedHandRoleForStaff(staffId) === 'left' ? 'pressed-l' : 'pressed-r');
                    } else {
                        desiredStates.delete(midi);
                    }
                } else {
                    desiredStates.delete(midi);
                }
            } else {
                desiredStates.set(midi, AppState.isPlaying ? 'wrong' : 'active');
            }
        });

        const displayStates = previewDepth > 0
            ? window.PTLedPreview.applyLedFuturePreviewStates(desiredStates, previewEvents)
            : desiredStates;

        LedEngine.config.futurePreview = previewDepth;
        LedEngine.renderFromStates(displayStates);
        LedEngine.renderOutputs();

        for (let i = 21; i <= 108; i++) {
            const desiredClass = displayStates.get(i) || null;

            const el = document.querySelector(`.key[data-midi="${i}"]`);
            if (el) {
                el.classList.toggle('out-of-range', !isMidiInPlayerRange(i));
                const currentUIClass = [...el.classList].find(c => ['expected-l', 'expected-r', 'pressed-l', 'pressed-r', 'wrong', 'active', 'future1-l', 'future1-r'].includes(c));
                if (currentUIClass !== desiredClass) {
                    if (currentUIClass) el.classList.remove(currentUIClass);
                    if (desiredClass) el.classList.add(desiredClass);
                }
                applyInlineKeyVisual(el, desiredClass);
            }

            const hardwareDesiredClass = desiredStates.get(i) || null;
            const currentHardwareClass = AppState.hardwareLEDState.get(i) || null;
            if (currentHardwareClass !== hardwareDesiredClass) {
                updateLEDHardware(i, hardwareDesiredClass, currentHardwareClass);

                if (hardwareDesiredClass) {
                    AppState.hardwareLEDState.set(i, hardwareDesiredClass);
                } else {
                    AppState.hardwareLEDState.delete(i);
                }
            }
        }
    }

    window.PTVirtualKeyboard.renderVirtualKeyboard = renderVirtualKeyboard;
    window.PTVirtualKeyboard.KEY_STATE_CLASSES = KEY_STATE_CLASSES;
})();