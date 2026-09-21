/**
 * Piano Trainer Studio
 * File: looper-ui.js
 * Purpose: Looper UI wiring — sliders, number inputs, +/- stepper buttons,
 *          pointer-hold repeat, the "loop enabled" checkbox and the
 *          dependent count-in checkbox. Owns AppState.looper.{min,max}
 *          writes; delegates all bounds math to window.PTLooperState.
 * Scope: All DOM mutations for the looper section. Calls into
 *        window.PTLooperState for clamping. Calls renderLooper() and
 *        enforceLooperBounds() (from feedback-engine.js) when state
 *        changes.
 */

(function () {
    'use strict';

    window.PTLooperUI = window.PTLooperUI || {};

    const loopMinSlider = document.getElementById('slider-loop-min');
    const loopMaxSlider = document.getElementById('slider-loop-max');
    const loopMinInput = document.getElementById('val-loop-min');
    const loopMaxInput = document.getElementById('val-loop-max');
    const loopMinDecreaseBtn = document.getElementById('btn-loop-min-decrease');
    const loopMinIncreaseBtn = document.getElementById('btn-loop-min-increase');
    const loopMaxDecreaseBtn = document.getElementById('btn-loop-max-decrease');
    const loopMaxIncreaseBtn = document.getElementById('btn-loop-max-increase');

    function syncLooperDependentUi() {
        const looperCheckbox = document.getElementById('check-looper');
        const loopCountInCheckbox = document.getElementById('check-loop-countin');
        const loopCountInRow = document.getElementById('looper-countin-row');
        const loopEnabled = !!looperCheckbox?.checked;

        if (loopCountInCheckbox) {
            loopCountInCheckbox.disabled = !loopEnabled;
            loopCountInCheckbox.checked = !!AppState.loopCountInEnabled;
        }

        if (loopCountInRow) {
            loopCountInRow.classList.toggle('is-disabled', !loopEnabled);
            loopCountInRow.setAttribute('aria-disabled', String(!loopEnabled));
        }
    }

    function syncLooper(source, changedId) {
        const maxAllowed = parseInt(loopMaxSlider.max, 10) || 100;
        const { min, max } = window.PTLooperState.normalizeLooperBounds({
            minVal: parseInt(loopMinInput.value, 10),
            maxVal: parseInt(loopMaxInput.value, 10),
            maxAllowed,
            changedId
        });

        loopMinSlider.value = min;
        loopMaxSlider.value = max;
        loopMinInput.value = min;
        loopMaxInput.value = max;
        AppState.looper.min = min;
        AppState.looper.max = max;

        renderLooper();
        enforceLooperBounds();
    }

    function syncLooperInputIfReady(changedId) {
        const targetInput = changedId === 'val-loop-min' ? loopMinInput : loopMaxInput;
        if (!targetInput) return;
        if (targetInput.value === '') return;
        syncLooper('input', changedId);
    }

    function stepLooperValue(target, delta) {
        const input = target === 'min' ? loopMinInput : loopMaxInput;
        if (!input) return;
        const fallbackValue = target === 'min' ? AppState.looper.min : AppState.looper.max;
        input.value = window.PTLooperState.getNextLooperStep(input.value, delta, fallbackValue);
        syncLooper('input', target === 'min' ? 'val-loop-min' : 'val-loop-max');
    }

    document.getElementById('check-looper').addEventListener('change', () => {
        renderLooper();
        enforceLooperBounds();
        syncLooperDependentUi();
    });

    if (loopMinSlider) loopMinSlider.addEventListener('input', (e) => syncLooper('slider', e.target.id));
    if (loopMaxSlider) loopMaxSlider.addEventListener('input', (e) => syncLooper('slider', e.target.id));
    if (loopMinInput) loopMinInput.addEventListener('input', (e) => syncLooperInputIfReady(e.target.id));
    if (loopMaxInput) loopMaxInput.addEventListener('input', (e) => syncLooperInputIfReady(e.target.id));
    if (loopMinInput) loopMinInput.addEventListener('change', (e) => syncLooper('input', e.target.id));
    if (loopMaxInput) loopMaxInput.addEventListener('change', (e) => syncLooper('input', e.target.id));
    if (loopMinInput) loopMinInput.addEventListener('blur', (e) => syncLooper('input', e.target.id));
    if (loopMaxInput) loopMaxInput.addEventListener('blur', (e) => syncLooper('input', e.target.id));
    if (loopMinDecreaseBtn) loopMinDecreaseBtn.addEventListener('click', () => stepLooperValue('min', -1));
    if (loopMinIncreaseBtn) loopMinIncreaseBtn.addEventListener('click', () => stepLooperValue('min', 1));
    if (loopMaxDecreaseBtn) loopMaxDecreaseBtn.addEventListener('click', () => stepLooperValue('max', -1));
    if (loopMaxIncreaseBtn) loopMaxIncreaseBtn.addEventListener('click', () => stepLooperValue('max', 1));

    const LOOP_STEPPER_HOLD_DELAY_MS = 320;
    const LOOP_STEPPER_HOLD_REPEAT_MS = 170;
    let activeLooperHold = null;

    function clearLooperHold() {
        if (!activeLooperHold) return;
        if (activeLooperHold.delayTimer) clearTimeout(activeLooperHold.delayTimer);
        if (activeLooperHold.repeatTimer) clearInterval(activeLooperHold.repeatTimer);
        if (activeLooperHold.button && activeLooperHold.button.releasePointerCapture && activeLooperHold.pointerId != null) {
            try {
                if (activeLooperHold.button.hasPointerCapture?.(activeLooperHold.pointerId)) {
                    activeLooperHold.button.releasePointerCapture(activeLooperHold.pointerId);
                }
            } catch (_) {}
        }
        activeLooperHold.button?.classList.remove('is-holding');
        activeLooperHold = null;
    }

    function beginLooperHold(button, target, delta, pointerId) {
        clearLooperHold();
        activeLooperHold = { button, pointerId, delayTimer: null, repeatTimer: null };
        button.classList.add('is-holding');

        if (button.setPointerCapture && pointerId != null) {
            try { button.setPointerCapture(pointerId); } catch (_) {}
        }

        activeLooperHold.delayTimer = setTimeout(() => {
            if (!activeLooperHold || activeLooperHold.button !== button) return;
            activeLooperHold.repeatTimer = setInterval(() => {
                stepLooperValue(target, delta);
            }, LOOP_STEPPER_HOLD_REPEAT_MS);
        }, LOOP_STEPPER_HOLD_DELAY_MS);
    }

    function wireLooperHold(button, target, delta) {
        if (!button) return;
        button.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        button.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
        button.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            beginLooperHold(button, target, delta, e.pointerId);
        });
        button.addEventListener('pointerup', clearLooperHold);
        button.addEventListener('pointercancel', clearLooperHold);
        button.addEventListener('lostpointercapture', clearLooperHold);
        button.addEventListener('pointerleave', (e) => {
            if (activeLooperHold?.button !== button) return;
            if (e.buttons === 0) clearLooperHold();
        });
    }

    wireLooperHold(loopMinDecreaseBtn, 'min', -1);
    wireLooperHold(loopMinIncreaseBtn, 'min', 1);
    wireLooperHold(loopMaxDecreaseBtn, 'max', -1);
    wireLooperHold(loopMaxIncreaseBtn, 'max', 1);

    document.addEventListener('pointerup', clearLooperHold);
    document.addEventListener('pointercancel', clearLooperHold);
    window.addEventListener('blur', clearLooperHold);

    syncLooperDependentUi();

    window.PTLooperUI.syncLooper = syncLooper;
    window.PTLooperUI.syncLooperDependentUi = syncLooperDependentUi;
    window.PTLooperUI.stepLooperValue = stepLooperValue;
    window.PTLooperUI.clearLooperHold = clearLooperHold;
})();