// playback.js
// Owns the playback scheduling loop and the pure seams extracted from it.
// Pure helpers live here (not in trainer-helpers.js) because they're
// conceptually coupled with playbackLoop — same fate when the loop is touched.
// Loaded before trainer-core.js so the factory can be called at trainer-core boot.

(function () {
    'use strict';

    // ---- Playback-loop seams ----
    // Pure decision/math extracted from playbackLoop so each seam is testable
    // without driving the full loop. Travel with playbackLoop; they belong here.

    function computeWaitSeconds(beatsToWait, baseBpm, speedPercent) {
        return beatsToWait * (60 / (baseBpm * speedPercent));
    }

    function advanceAnchorTime(anchorTime, now, waitSeconds, mode) {
        if (mode === 'wait' || mode === 'follow') return now + waitSeconds;
        return anchorTime + waitSeconds;
    }

    function clampTimeToWaitMs(anchorTime, now) {
        return Math.max(0, (anchorTime - now) * 1000);
    }

    function shouldRestartLoopAtBoundary({ isEndReached, currentMeasureIdx, isLoopEnabled, maxLoop }) {
        return isLoopEnabled && (isEndReached || (currentMeasureIdx + 1 > maxLoop));
    }

    function classifyNoteScheduleBranch({ mode, expectedNotesLength, isPracticingThisHand }) {
        return (mode === 'wait' || mode === 'follow') && expectedNotesLength > 0 && !isPracticingThisHand;
    }

    function shouldDeferFollowScheduling(mode, expectedNotesLength) {
        return mode === 'follow' && expectedNotesLength > 0;
    }

    function computeLoopRestartSteps({ minLoop, totalMeasures }) {
        const target = Number(minLoop) - 1;
        if (!Number.isFinite(target) || target <= 0) return 0;
        const cap = Number.isFinite(Number(totalMeasures)) ? Math.max(0, Number(totalMeasures) - 1) : target;
        return Math.min(target, cap);
    }

    function shouldPauseAtEnd({ isEndReached, isLoopEnabled }) {
        return !!isEndReached && !isLoopEnabled;
    }

    function shouldAdoptMeasureTempo(currentMeasure, currentBaseBpm) {
        if (!currentMeasure || !currentMeasure.TempoInBPM) return false;
        return Number(currentMeasure.TempoInBPM) !== Number(currentBaseBpm);
    }

    function shouldUseCountInForLoopRestart(loopCountInEnabled) {
        return !!loopCountInEnabled;
    }

    // ---- getCombinedTieLength ----
    // Travels with playbackLoop: same note.tie API, only meaningful for playback scheduling.

    function getCombinedTieLength(note) {
        if (!note) return 0;

        let total = 0;
        let current = note;
        const seen = new Set();

        while (current && !seen.has(current)) {
            seen.add(current);
            total += window.PTHelpers.getNoteEffectiveLength(current);

            const tie = window.PTHelpers.getNoteTie(current);
            if (!tie) break;

            // getNoteTie's NextNote already returns the correct chain successor
            // for both StartNote and mid-chain notes.
            const next = tie.NextNote;
            if (!next) break;

            // Only combine true same-pitch ties
            if (next.halfTone !== current.halfTone) break;

            current = next;
        }

        return total || window.PTHelpers.getNoteEffectiveLength(note);
    }

    // ---- playbackLoop factory ----
    // deps: osmd, scheduleMetronomeForPlaybackWindow, schedulePlaybackForDestinations,
    //       startVisualSustains, checkWaitModeAdvance, processMissedNotes,
    //       buildExpectedNotesFromEntries, updateTempo, getAssignedHandRoleForStaff
    // getCombinedTieLength is owned by this module (window.PTPlayback.getCombinedTieLength).

    function createPlaybackLoop(deps) {
        const {
            osmd,
            scheduleMetronomeForPlaybackWindow,
            schedulePlaybackForDestinations,
            startVisualSustains,
            checkWaitModeAdvance,
            processMissedNotes,
            buildExpectedNotesFromEntries,
            updateTempo,
            getAssignedHandRoleForStaff
        } = deps;

        return function playbackLoop() {
            if (!AppState.isPlaying) return;

            if (osmd.cursor.Iterator.EndReached) {
                const isLoopEnabledAtEnd = document.getElementById('check-looper')?.checked;
                if (shouldPauseAtEnd({ isEndReached: true, isLoopEnabled: isLoopEnabledAtEnd })) {
                    window.PTTransport.pausePlaybackFromToolbar();
                    osmd.cursor.update();
                    handleAutoScroll();
                }
                return;
            }

            const entries = osmd.cursor.Iterator.CurrentVoiceEntries;
            if (!entries || entries.length === 0) {
                osmd.cursor.Iterator.moveToNext();
                osmd.cursor.update();
                window.refreshScoreNoteLabelsFromCursor();
                renderFeedbackOverlay();
                requestAnimationFrame(playbackLoop);
                return;
            }

            const currentTimestamp = osmd.cursor.Iterator.currentTimeStamp.RealValue;
            const currentMeasureIdx = osmd.cursor.Iterator.CurrentMeasureIndex;

            const currentMeasure = osmd.Sheet.SourceMeasures[currentMeasureIdx];
            if (shouldAdoptMeasureTempo(currentMeasure, AppState.baseBpm)) {
                AppState.baseBpm = currentMeasure.TempoInBPM;
                updateTempo('percent', AppState.speedPercent * 100);
            }

            buildExpectedNotesFromEntries(entries, currentMeasureIdx, currentTimestamp);
            AppState.currentExpectedContext = {
                measureIndex: currentMeasureIdx,
                timestamp: currentTimestamp,
                signature: window.PTLedPreview.makeLedPreviewEntrySignature(entries)
            };

            renderFeedbackOverlay();
            window.PTVirtualKeyboard.renderVirtualKeyboard(entries, currentMeasureIdx, currentTimestamp);

            entries.forEach(e => {
                const sid = window.PTStaff.getResolvedStaffAssignmentIdFromEntry(e);
                const handRole = getAssignedHandRoleForStaff(sid);
                const isRH = handRole === 'right';
                const isLH = handRole === 'left';
                const isOther = (!isRH && !isLH);
                const isPracticingThisHand = (isRH && AppState.practice.right) || (isLH && AppState.practice.left);
                const playbackLeftEnabled = !!AppState.playback.left;
                const playbackRightEnabled = !!AppState.playback.right;
                const isSelectedHandPlayback = (isRH && playbackRightEnabled) || (isLH && playbackLeftEnabled);

                const routeToLocalAudio = ((isRH || isLH) && isSelectedHandPlayback && AppState.audioEnabled.hands) ||
                                          (isOther && AppState.audioEnabled.other);
                const routeToMidiOut = ((isRH || isLH) && isSelectedHandPlayback && AppState.midiOutEnabled.hands) ||
                                       (isOther && AppState.midiOutEnabled.other);

                if (routeToLocalAudio || routeToMidiOut) {
                    e.Notes.forEach(n => {
                        if (!n.isRest()) {
                            const nt = window.PTHelpers.getNoteTie(n);
                            const isTieContinuation = nt && nt.StartNote !== n;
                            if (!isTieContinuation) {
                                const m = n.halfTone + 12;

                                const combinedLength = (nt && nt.StartNote === n)
                                    ? getCombinedTieLength(n)
                                    : window.PTHelpers.getNoteEffectiveLength(n);

                                const noteDurationSeconds = (combinedLength * 4) * (60 / (AppState.baseBpm * AppState.speedPercent));
                                const durationMs = (noteDurationSeconds * 1000) * 0.9;

                                if (classifyNoteScheduleBranch({ mode: AppState.mode, expectedNotesLength: AppState.expectedNotes.length, isPracticingThisHand })) {
                                    AppState.pendingAudio.push({ midi: m, durationMs: durationMs, velocity: 100, toLocalAudio: routeToLocalAudio, toMidiOut: routeToMidiOut });
                                } else {
                                    schedulePlaybackForDestinations(m, durationMs, 100, { toLocalAudio: routeToLocalAudio, toMidiOut: routeToMidiOut });
                                }
                            }
                        }
                    });
                }
            });

            osmd.cursor.Iterator.moveToNext();

            const nextMeasureIdx = osmd.cursor.Iterator.CurrentMeasureIndex;
            let nextTimestamp = osmd.cursor.Iterator.currentTimeStamp.RealValue;
            const isEndReached = osmd.cursor.Iterator.EndReached;

            let fallbackLength = 1;
            if (entries && entries[0] && entries[0].Notes && entries[0].Notes.length > 0) {
                fallbackLength = window.PTHelpers.getNoteEffectiveLength(entries[0].Notes[0]) || 1;
            }

            if (isEndReached) {
                nextTimestamp = currentTimestamp + fallbackLength;
            }

            const beatsToWait = window.PTTiming.getTraversalBeatsToWait({
                currentMeasureIdx,
                currentTimestamp,
                nextMeasureIdx,
                nextTimestamp,
                fallbackLength,
                getMeasureTimingInfo: (mIdx) => window.PTTiming.getMeasureTimingInfo(osmd, mIdx)
            });

            const waitSeconds = computeWaitSeconds(beatsToWait, AppState.baseBpm, AppState.speedPercent);
            const playbackWindowStartSec = (AppState.mode === 'wait' || AppState.mode === 'follow') ? Tone.now() : AppState.anchorTime;

            const shouldDefer = shouldDeferFollowScheduling(AppState.mode, AppState.expectedNotes.length);
            if (!shouldDefer) {
                scheduleMetronomeForPlaybackWindow(
                    playbackWindowStartSec,
                    currentMeasureIdx,
                    currentTimestamp,
                    waitSeconds,
                    beatsToWait
                );
            } else {
                window.clearScheduledMetronomeEvents();
                window.clearTempoVisualPulse();
            }

            let timeToWaitMs = waitSeconds * 1000;

            const isLoopEnabled = document.getElementById('check-looper').checked;
            const maxLoop = parseInt(document.getElementById('val-loop-max').value);
            const minLoop = parseInt(document.getElementById('val-loop-min').value);

            if (shouldRestartLoopAtBoundary({ isEndReached, currentMeasureIdx: osmd.cursor.Iterator.CurrentMeasureIndex, isLoopEnabled, maxLoop })) {

                setTimeout(() => {
                    if (!AppState.isPlaying) return;

                    processMissedNotes();
                    Tone.Transport.stop();

                    osmd.cursor.reset();
                    const restartSteps = computeLoopRestartSteps({
                        minLoop,
                        totalMeasures: osmd.Sheet.SourceMeasures?.length
                    });
                    for (let step = 0; step < restartSteps; step++) {
                        if (osmd.cursor.Iterator.EndReached) break;
                        osmd.cursor.Iterator.moveToNext();
                    }
                    osmd.cursor.update();
                    handleAutoScroll();
                    window.clearVisuals();

                    const restartLoopPlayback = () => {
                        window.GeometryEngine.clearSvgFeedback();
                        AppState.pendingAudio = [];
                        AppState.score.correct = 0;
                        AppState.score.wrong = 0;
                        window.updateScoreDisplay();

                        AppState.anchorTime = Tone.now();
                        Tone.Transport.start();
                        playbackLoop();
                    };

                    if (shouldUseCountInForLoopRestart(AppState.loopCountInEnabled)) {
                        window.doCountInAndStart(restartLoopPlayback);
                    } else {
                        restartLoopPlayback();
                    }

                }, timeToWaitMs);

                return;
            }

            AppState.anchorTime = advanceAnchorTime(AppState.anchorTime, Tone.now(), waitSeconds, AppState.mode);

            timeToWaitMs = clampTimeToWaitMs(AppState.anchorTime, Tone.now());

            if (AppState.anchorTime - Tone.now() < 0) {
                if (AppState.mode === 'wait' || AppState.mode === 'follow') {
                    AppState.anchorTime = Tone.now();
                }
            }

            if (AppState.mode === 'wait' || AppState.mode === 'follow') {
                AppState.isAudioBusy = true;
                AppState.followAdvanceInfo = AppState.mode === 'follow' ? {
                    currentMeasureIdx,
                    currentTimestamp,
                    waitSeconds,
                    beatsToWait
                } : null;

                if (AppState.expectedNotes.length > 0) {
                    const allExpectedAlreadyHit = AppState.expectedNotes.every(n => n.hit);
                    if (allExpectedAlreadyHit) {
                        // One-hand early-grace reservations can promote held notes to hit as soon as
                        // a new expected group is built. In wait/follow modes, that means this step
                        // is already satisfied before any fresh keydown event occurs, so we need to
                        // advance immediately instead of deadlocking on an already-hit group.
                        setTimeout(() => {
                            if (!AppState.isPlaying || (AppState.mode !== 'wait' && AppState.mode !== 'follow')) return;
                            checkWaitModeAdvance();
                        }, 0);
                    }
                    // Otherwise engine waits for user input.
                } else {
                    startVisualSustains();
                    const advanceDelayMs = AppState.mode === 'follow' ? Math.max(0, timeToWaitMs) : 10;
                    if (AppState.mode === 'follow') {
                        scheduleMetronomeForPlaybackWindow(
                            playbackWindowStartSec,
                            currentMeasureIdx,
                            currentTimestamp,
                            waitSeconds,
                            beatsToWait
                        );
                    }
                    setTimeout(() => {
                        if (AppState.isPlaying && (AppState.mode === 'wait' || AppState.mode === 'follow')) {
                            processMissedNotes();
                            osmd.cursor.update();
                            handleAutoScroll();
                            playbackLoop();
                        }
                    }, advanceDelayMs);
                }
            } else {
                startVisualSustains();
                setTimeout(() => {
                    if (AppState.isPlaying) {
                        processMissedNotes();
                        osmd.cursor.update();
                        handleAutoScroll();
                        playbackLoop();
                    }
                }, timeToWaitMs);
            }
        };
    }

    window.PTPlayback = {
        computeWaitSeconds,
        advanceAnchorTime,
        clampTimeToWaitMs,
        shouldRestartLoopAtBoundary,
        classifyNoteScheduleBranch,
        shouldDeferFollowScheduling,
        computeLoopRestartSteps,
        shouldPauseAtEnd,
        shouldAdoptMeasureTempo,
        shouldUseCountInForLoopRestart,
        getCombinedTieLength,
        createPlaybackLoop
    };
})();