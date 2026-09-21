/**
 * Piano Trainer Studio
 * File: midi-routing.js
 * Purpose: Pure routing decisions for live input sources (MIDI vs UI).
 * Scope: No DOM, no audio/MIDI side effects. Reads AppState buckets only.
 */

(function () {
    'use strict';

    window.PTMidiRouting = window.PTMidiRouting || {};

    function getRoutingEnabledForRole(bucket, roleKey) {
        return !!(bucket && bucket[roleKey]);
    }

    function getSourceRoleKey(source) {
        if (source === 'midi') return 'instrument';
        if (source === 'ui') return 'virtual';
        return null;
    }

    function shouldRouteLiveSourceToLocalAudio(source) {
        const roleKey = getSourceRoleKey(source);
        return roleKey ? getRoutingEnabledForRole(AppState.audioEnabled, roleKey) : false;
    }

    function shouldRouteLiveSourceToMidiOut(source) {
        const roleKey = getSourceRoleKey(source);
        return roleKey ? getRoutingEnabledForRole(AppState.midiOutEnabled, roleKey) : false;
    }

    window.PTMidiRouting.getRoutingEnabledForRole = getRoutingEnabledForRole;
    window.PTMidiRouting.getSourceRoleKey = getSourceRoleKey;
    window.PTMidiRouting.shouldRouteLiveSourceToLocalAudio = shouldRouteLiveSourceToLocalAudio;
    window.PTMidiRouting.shouldRouteLiveSourceToMidiOut = shouldRouteLiveSourceToMidiOut;
})();