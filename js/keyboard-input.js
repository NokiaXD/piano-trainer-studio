// js/keyboard-input.js
// Single funnel for all key-press/key-release events entering the trainer.
// Defined as a factory so the function is testable with mocked deps; the
// real instance is wired by trainer-core at boot and exposed as
// window.keyboardInput. midi.js calls it lazily via window.keyboardInput
// (midi.js loads before keyboard-input.js, but the call sites fire at
// runtime — only then must the wiring be in place).
//
// Inputs:
//   midi      (number 0-127)   pitch
//   isPressed (boolean)        true = keydown, false = keyup
//   source    ('midi' | 'ui')  default 'midi'. Drives routing + velocity treatment.
//   velocity  (number 0-127)   default 100. Honored only when source='midi'
//                              AND AppState.inputVelocityEnabled. UI presses
//                              ignore this and always use 100.
//
// Reads AppState: inputVelocityEnabled, ledCalibrationMode, isPlaying, mode,
//                 practice.left/right, realtimeWrongPressInCurrentContext,
//                 expectedNotes, earlyGraceReservations.
// Writes AppState: pressedKeys, heldCorrectNotes, preExpectedHeldNotes,
//                  earlyGraceReservations (release cleanup, allowTapCarry aware),
//                  score.correct/wrong, realtimeWrongPressInCurrentContext.

(function () {
    'use strict';

    // Pure seam: live-velocity resolution. Extracted so the rule
    // (source='midi' AND inputVelocityEnabled → honor velocity, else 100)
    // is testable without dragging in the full press pipeline.
    function resolveLiveVelocity(source, velocity, inputVelocityEnabled) {
        return (source === 'midi' && inputVelocityEnabled) ? velocity : 100;
    }

    function createKeyboardInput(deps) {
        const {
            playLocalPianoNote,
            pianoSampler,
            getSamplerNoteName,
            getLiveAudioTime,
            sendMidiOutNoteOn,
            sendMidiOutNoteOff,
            normalizeLiveVelocity,
            getLiveMonitoringVelocity,
            selectLedCalibrationMidi,
            findExpectedMatchForMidi,
            findSatisfiedOrSustainedMatchForMidi,
            tryReserveSingleHandEarlyGrace,
            tryReserveRealtimeUpcomingHeldNote,
            drawFeedbackNote,
            updateScoreDisplay,
            registerHeldIncorrectFeedback,
            releaseHeldIncorrectFeedback,
            checkWaitModeAdvance,
            debugLogEvent,
            ensureLiveAudioReady,
            isAudioContextReady
        } = deps;

        function triggerVirtualKey(midi, isPressed, source = 'midi', velocity = 100) {
            if (isPressed) {
                AppState.pressedKeys.add(midi);

                const liveVelocity = resolveLiveVelocity(source, velocity, AppState.inputVelocityEnabled);
                const localAudioVelocity = getLiveMonitoringVelocity(source, liveVelocity);

                if (window.PTMidiRouting.shouldRouteLiveSourceToLocalAudio(source)) {
                    const ctxReady = isAudioContextReady();
                    if (ctxReady) {
                        playLocalPianoNote(midi, localAudioVelocity, null, {
                            lowLatencyLive: source === 'ui' ? true : !!AppState.liveLowLatencyMonitoringEnabled,
                            retrigger: true
                        });
                    } else {
                        ensureLiveAudioReady().then(() => playLocalPianoNote(midi, localAudioVelocity, null, {
                            lowLatencyLive: source === 'ui' ? true : !!AppState.liveLowLatencyMonitoringEnabled,
                            retrigger: true
                        }));
                    }
                }

                if (window.PTMidiRouting.shouldRouteLiveSourceToMidiOut(source)) {
                    sendMidiOutNoteOn(midi, normalizeLiveVelocity(liveVelocity).midi, { scaleVolume: source === 'ui' });
                }

                if (AppState.ledCalibrationMode) {
                    selectLedCalibrationMidi(midi);
                    window.PTVirtualKeyboard.renderVirtualKeyboard();
                    return;
                }

                if (AppState.isPlaying) {
                    const expectedMatch = findExpectedMatchForMidi(midi);
                    const sustainMatch = !expectedMatch ? findSatisfiedOrSustainedMatchForMidi(midi) : null;
                    const repeatCarryReservation = (!expectedMatch && sustainMatch?.source === 'already-hit')
                        ? tryReserveSingleHandEarlyGrace(midi)
                        : null;
                    const realtimeUpcomingReservation = (!expectedMatch && !sustainMatch && !repeatCarryReservation)
                        ? tryReserveRealtimeUpcomingHeldNote(midi)
                        : null;
                    const earlyGraceReservation = (!expectedMatch && !sustainMatch && !realtimeUpcomingReservation)
                        ? tryReserveSingleHandEarlyGrace(midi)
                        : (realtimeUpcomingReservation || repeatCarryReservation);
                    const isCorrect = !!expectedMatch;
                    const isAcceptedRepeat = !expectedMatch && !!sustainMatch;
                    const isEarlyGraceReserved = !!earlyGraceReservation;
                    const targetStaffId = expectedMatch ? expectedMatch.staffId : (sustainMatch ? sustainMatch.staffId : (earlyGraceReservation ? earlyGraceReservation.staffId : null));

                    if (AppState.practice.left || AppState.practice.right) {
                        const forceMIdx = expectedMatch ? expectedMatch.mIdx : null;
                        const anchor = expectedMatch ? expectedMatch.anchor : null;

                        debugLogEvent('KEY_PRESS_MATCH_RESULT', {
                            midi,
                            isCorrect,
                            isAcceptedRepeat,
                            isEarlyGraceReserved,
                            targetStaffId,
                            forceMIdx,
                            sustainMatch: sustainMatch ? {
                                midi: sustainMatch.midi,
                                staffId: sustainMatch.staffId,
                                mIdx: sustainMatch.mIdx,
                                source: sustainMatch.source
                            } : null,
                            anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
                            expectedMatch: expectedMatch ? {
                                midi: expectedMatch.midi,
                                staffId: expectedMatch.staffId,
                                mIdx: expectedMatch.mIdx,
                                hit: expectedMatch.hit
                            } : null
                        });

                        if (isCorrect) {
                            drawFeedbackNote(midi, true, targetStaffId, forceMIdx, anchor);
                            AppState.score.correct++;
                            AppState.heldCorrectNotes.set(midi, targetStaffId);
                            updateScoreDisplay();
                        } else if (isAcceptedRepeat || isEarlyGraceReserved) {
                            AppState.heldCorrectNotes.set(midi, targetStaffId);
                        } else {
                            if (AppState.mode === 'realtime') {
                                AppState.realtimeWrongPressInCurrentContext = true;
                            }
                            registerHeldIncorrectFeedback(midi, targetStaffId, forceMIdx, anchor);
                            AppState.score.wrong++;
                            updateScoreDisplay();
                        }
                    }

                    if (isCorrect) {
                        expectedMatch.hit = true;
                        if (AppState.mode === 'wait' || AppState.mode === 'follow') {
                            checkWaitModeAdvance();
                        }
                    }
                }
            } else {
                AppState.pressedKeys.delete(midi);
                AppState.heldCorrectNotes.delete(midi);
                AppState.preExpectedHeldNotes.delete(midi);
                const earlyReservation = AppState.earlyGraceReservations.get(midi);
                if (!earlyReservation || !earlyReservation.allowTapCarry) {
                    AppState.earlyGraceReservations.delete(midi);
                }
                releaseHeldIncorrectFeedback(midi);

                if (window.PTMidiRouting.shouldRouteLiveSourceToLocalAudio(source)) {
                    const noteName = getSamplerNoteName(midi);
                    if (noteName) pianoSampler.triggerRelease(noteName, getLiveAudioTime());
                }

                if (window.PTMidiRouting.shouldRouteLiveSourceToMidiOut(source)) {
                    sendMidiOutNoteOff(midi);
                }
            }

            window.PTVirtualKeyboard.renderVirtualKeyboard();
        }

        return triggerVirtualKey;
    }

    window.PTKeyboardInput = {
        resolveLiveVelocity,
        createKeyboardInput
    };
})();
