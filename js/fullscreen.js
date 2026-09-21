/**
 * Piano Trainer Studio
 * File: fullscreen.js
 * Purpose: Fullscreen toggle + UI sync for the score view, plus the
 *          "enter fullscreen on play" preference wiring.
 * Scope: Reads/writes AppState.pseudoFullscreenActive. AppState.fullscreenOnPlay
 *        is read by trainer-core before playback starts; this module does NOT
 *        own that flag's storage — trainer-core handles the storage read on boot.
 */

(function () {
    'use strict';

    window.PTFullscreen = window.PTFullscreen || {};

    function getFullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function getFullscreenTargetElement() {
        return document.documentElement;
    }

    function isFullscreenActive() {
        return !!getFullscreenElement() || !!AppState.pseudoFullscreenActive;
    }

    function syncFullscreenUi() {
        const fullscreenActive = isFullscreenActive();
        const fullscreenLabel = fullscreenActive ? 'Exit full screen' : 'Enter full screen';
        document.body.classList.toggle('app-fullscreen-active', fullscreenActive);
        const button = document.getElementById('btn-score-fullscreen');
        if (button) {
            button.classList.toggle('is-active', fullscreenActive);
            button.textContent = fullscreenActive ? '🗗' : '⛶';
            button.setAttribute('aria-label', fullscreenLabel);
            button.setAttribute('aria-pressed', fullscreenActive ? 'true' : 'false');
            button.title = fullscreenLabel;
            button.dataset.tooltip = fullscreenLabel;
        }
    }

    async function requestAppFullscreen() {
        if (typeof hideToolbarPanels === 'function') {
            hideToolbarPanels();
        }
        const target = getFullscreenTargetElement();
        try {
            if (target?.requestFullscreen) {
                await target.requestFullscreen();
                AppState.pseudoFullscreenActive = false;
            } else if (target?.webkitRequestFullscreen) {
                target.webkitRequestFullscreen();
                AppState.pseudoFullscreenActive = false;
            } else {
                AppState.pseudoFullscreenActive = true;
            }
        } catch (err) {
            console.warn('Fullscreen request failed; using in-app fullscreen fallback.', err);
            AppState.pseudoFullscreenActive = true;
        }
        syncFullscreenUi();
    }

    async function exitAppFullscreen() {
        try {
            if (document.exitFullscreen && document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
                document.webkitExitFullscreen();
            }
        } catch (err) {
            console.warn('Could not exit native fullscreen cleanly.', err);
        }
        AppState.pseudoFullscreenActive = false;
        syncFullscreenUi();
    }

    async function toggleAppFullscreen() {
        if (isFullscreenActive()) {
            await exitAppFullscreen();
            return;
        }
        await requestAppFullscreen();
    }

    async function requestOnPlayIfEnabled() {
        if (AppState.fullscreenOnPlay && !isFullscreenActive()) {
            await requestAppFullscreen();
        }
    }

    syncFullscreenUi();
    document.addEventListener('fullscreenchange', syncFullscreenUi);
    document.addEventListener('webkitfullscreenchange', syncFullscreenUi);
    const scoreFullscreenButton = document.getElementById('btn-score-fullscreen');
    if (scoreFullscreenButton) {
        scoreFullscreenButton.addEventListener('click', () => {
            toggleAppFullscreen();
        });
    }

    window.PTFullscreen.getFullscreenElement = getFullscreenElement;
    window.PTFullscreen.getFullscreenTargetElement = getFullscreenTargetElement;
    window.PTFullscreen.isFullscreenActive = isFullscreenActive;
    window.PTFullscreen.syncFullscreenUi = syncFullscreenUi;
    window.PTFullscreen.requestAppFullscreen = requestAppFullscreen;
    window.PTFullscreen.exitAppFullscreen = exitAppFullscreen;
    window.PTFullscreen.toggleAppFullscreen = toggleAppFullscreen;
    window.PTFullscreen.requestOnPlayIfEnabled = requestOnPlayIfEnabled;
})();