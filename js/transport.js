/**
 * Piano Trainer Studio
 * File: transport.js
 * Purpose: Transport controls (start, pause, stop, reset) and the
 *          transient playback state lifecycle that backs them.
 * Scope: Reads/writes AppState, drives Tone.Transport, silences MIDI/audio
 *        outputs, and resets visuals when playback ends. No DOM event wiring
 *        — the play/pause/reset button handlers stay in trainer-core.js.
 * Dependencies (all globals): Tone, osmd, AppState, playPauseButton,
 *   clearVisuals, refreshScoreNoteLabelsFromCursor, renderFeedbackOverlay,
 *   clearScheduledMetronomeEvents, stopWaitModeMetronome,
 *   silencePlaybackOutputsImmediately (defined here), clearTempoVisualPulse,
 *   applyToneLatencyProfileForMode, wipeHardwareLEDs, WLEDController,
 *   GeometryEngine, updateScoreDisplay, ensureLiveAudioReady,
 *   preserveMusicAreaScroll, ensureLedPreviewTimelineBuilt,
 *   doCountInAndStart, handleAutoScroll, startWaitModeMetronome, playbackLoop,
 *   hideToolbarPanels, getMidiOutStatus, pianoSampler, lowLatencyPlaybackSynth.
 */

(function () {
    'use strict';

    window.PTTransport = window.PTTransport || {};

    function updatePlayPauseButton() {
        document.body.classList.toggle('app-playing', !!AppState.isPlaying);
        const button = document.getElementById('btn-play');
        if (button) {
            button.textContent = AppState.isPlaying ? '⏸ Pause' : '▶ Play';
        }
    }

    async function startPlaybackFromToolbar() {
        if (!osmd.cursor || AppState.isPlaying) return;

        if (AppState.fullscreenOnPlay && !window.PTFullscreen.isFullscreenActive()) {
            await window.PTFullscreen.requestAppFullscreen();
        }

        await ensureLiveAudioReady();

        AppState.isPlaying = true;
        updatePlayPauseButton();

        hideToolbarPanels();
        Tone.Transport.stop();
        clearScheduledMetronomeEvents();
        stopWaitModeMetronome();

        AppState.lastLedPreviewEvents = [];
        AppState.ledPreviewTraversalIndex = -1;

        preserveMusicAreaScroll(() => {
            ensureLedPreviewTimelineBuilt();
        });

        applyToneLatencyProfileForMode();

        doCountInAndStart(() => {
            AppState.anchorTime = Tone.now();
            osmd.cursor.show();
            handleAutoScroll();
            Tone.Transport.bpm.value = AppState.baseBpm * AppState.speedPercent;
            Tone.Transport.start();
            if (AppState.mode === 'wait' && document.getElementById('check-metronome')?.checked) {
                startWaitModeMetronome(osmd?.cursor?.Iterator?.CurrentMeasureIndex ?? 0);
            }
            playbackLoop();
        });
    }

    function silencePlaybackOutputsImmediately() {
        try {
            pianoSampler.releaseAll?.();
            lowLatencyPlaybackSynth.releaseAll?.();
        } catch (err) {
            console.warn('Could not release Tone.js playback voices immediately.', err);
        }

        if (midiAccess) {
            const outId = document.getElementById('midi-out')?.value;
            if (outId && outId !== 'none') {
                const output = midiAccess.outputs.get(outId);
                if (output && output.state !== 'disconnected') {
                    const controlStatus = getMidiOutStatus(0xB0);
                    output.send([controlStatus, 64, 0]);
                    output.send([controlStatus, 123, 0]);
                    output.send([controlStatus, 120, 0]);
                }
            }
        }
    }

    function clearTransientPlaybackState({ clearVisualState = false } = {}) {
        AppState.pendingAudio = [];
        AppState.followAdvanceInfo = null;
        AppState.currentExpectedContext = null;
        AppState.earlyGraceReservations.clear();
        AppState.isAudioBusy = false;
        AppState.expectedNotes = [];
        AppState.activeNoteLabels = [];
        AppState.realtimeWrongPressInCurrentContext = false;
        AppState.preExpectedHeldNotes.clear();

        if (clearVisualState) {
            clearVisuals();
        }
        refreshScoreNoteLabelsFromCursor();
        renderFeedbackOverlay();
    }

    function stopPlaybackState({ pauseTransport = true } = {}) {
        AppState.isPlaying = false;
        AppState.countInActive = false;
        AppState.lastLedPreviewEvents = [];
        AppState.ledPreviewTraversalIndex = -1;
        clearTransientPlaybackState();

        if (pauseTransport) {
            Tone.Transport.pause();
        } else {
            Tone.Transport.stop();
        }

        clearScheduledMetronomeEvents();
        stopWaitModeMetronome();
        silencePlaybackOutputsImmediately();
        clearTempoVisualPulse();
        applyToneLatencyProfileForMode();
        updatePlayPauseButton();

        if (AppState.ledOutputMode === 'midi') {
            wipeHardwareLEDs();
        }
        if (AppState.ledOutputMode === 'wled') {
            WLEDController.forceClear().catch(() => {});
        }
    }

    function pausePlaybackFromToolbar() {
        stopPlaybackState({ pauseTransport: true });
    }

    function resetPlaybackForLoadedScore() {
        stopPlaybackState({ pauseTransport: false });

        GeometryEngine.clearSvgFeedback();
        AppState.scoreNoteLabels = [];
        AppState.pendingAudio = [];
        AppState.score.correct = 0;
        AppState.score.wrong = 0;
        updateScoreDisplay();
        clearVisuals();
    }

    window.PTTransport.updatePlayPauseButton = updatePlayPauseButton;
    window.PTTransport.startPlaybackFromToolbar = startPlaybackFromToolbar;
    window.PTTransport.silencePlaybackOutputsImmediately = silencePlaybackOutputsImmediately;
    window.PTTransport.clearTransientPlaybackState = clearTransientPlaybackState;
    window.PTTransport.stopPlaybackState = stopPlaybackState;
    window.PTTransport.pausePlaybackFromToolbar = pausePlaybackFromToolbar;
    window.PTTransport.resetPlaybackForLoadedScore = resetPlaybackForLoadedScore;
})();