/**
 * Piano Trainer Studio
 * File: trainer-mode.js
 * Purpose: Mode settings + hand-role resolution. Owns reads/writes of
 *          AppState.modeSettings, AppState.practice, AppState.playback,
 *          and the AppState.hands mapping used to determine which staff
 *          belongs to left vs right hand.
 * Scope: No DOM. Reads/writes AppState only. Safe to call from any module
 *        that loads after trainer-state.js.
 */

(function () {
    'use strict';

    window.PTMode = window.PTMode || {};

    function getDefaultStaffAssignment(osmd) {
        const stavesCount = osmd?.GraphicSheet?.MeasureList?.[0]?.length || 2;
        return {
            left: stavesCount > 1 ? 2 : null,
            right: 1
        };
    }

    function getAssignedHandRoleForStaff(staffId) {
        const sid = Number(staffId);
        if (!Number.isFinite(sid)) return null;
        if (sid === Number(AppState.hands.right)) return 'right';
        if (sid === Number(AppState.hands.left)) return 'left';
        return null;
    }

    function normalizeFollowModeSettings() {
        const follow = AppState.modeSettings.follow;
        const left = !!follow.practice.left;
        const right = !!follow.practice.right;
        const useLeft = left && !right;
        const useRight = !useLeft;
        follow.practice.left = useLeft;
        follow.practice.right = useRight;
        follow.playback.left = !useLeft;
        follow.playback.right = useLeft;
    }

    function getCurrentModeSettings() {
        const modeKey = AppState.mode === 'wait' ? 'wait' : (AppState.mode === 'follow' ? 'follow' : 'realtime');
        if (!AppState.modeSettings[modeKey]) {
            AppState.modeSettings[modeKey] = {
                practice: { left: true, right: true },
                playback: { left: true, right: true }
            };
        }
        if (modeKey === 'follow') normalizeFollowModeSettings();
        return AppState.modeSettings[modeKey];
    }

    function syncActiveHandStateFromMode() {
        const settings = getCurrentModeSettings();
        AppState.practice.left = !!settings.practice.left;
        AppState.practice.right = !!settings.practice.right;
        AppState.playback.left = !!settings.playback.left;
        AppState.playback.right = !!settings.playback.right;
    }

    function setFollowPracticeHand(hand) {
        const follow = AppState.modeSettings.follow;
        const useLeft = hand === 'left';
        follow.practice.left = useLeft;
        follow.practice.right = !useLeft;
        follow.playback.left = !useLeft;
        follow.playback.right = useLeft;
        if (AppState.mode === 'follow') syncActiveHandStateFromMode();
    }

    window.PTMode.getDefaultStaffAssignment = getDefaultStaffAssignment;
    window.PTMode.getAssignedHandRoleForStaff = getAssignedHandRoleForStaff;
    window.PTMode.normalizeFollowModeSettings = normalizeFollowModeSettings;
    window.PTMode.getCurrentModeSettings = getCurrentModeSettings;
    window.PTMode.syncActiveHandStateFromMode = syncActiveHandStateFromMode;
    window.PTMode.setFollowPracticeHand = setFollowPracticeHand;
})();