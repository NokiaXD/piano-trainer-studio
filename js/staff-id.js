/**
 * Piano Trainer Studio
 * File: staff-id.js
 * Purpose: Resolve note/entry → global staff assignment id.
 * Scope: Identity resolution only. Does NOT mutate visibility, render, or DOM.
 */

(function () {
    'use strict';

    window.PTStaff = window.PTStaff || {};

    let globalStaffIdentityMap = new Map();

    function rebuildGlobalStaffIdentityMap(osmd) {
        globalStaffIdentityMap = new Map();

        const instruments = osmd?.Sheet?.Instruments || osmd?.Sheet?.instruments || [];
        let nextGlobalStaffId = 1;

        instruments.forEach(instrument => {
            const staves = instrument?.Staves || instrument?.staves || instrument?.Staffs || instrument?.staffs || [];
            staves.forEach(staff => {
                if (staff && !globalStaffIdentityMap.has(staff)) {
                    globalStaffIdentityMap.set(staff, nextGlobalStaffId++);
                }
            });
        });

        return globalStaffIdentityMap;
    }

    function getResolvedStaffAssignmentIdFromNote(note) {
        const staffCandidates = [
            note?.ParentStaff,
            note?.parentStaff,
            note?.ParentVoiceEntry?.ParentSourceStaffEntry?.ParentStaff,
            note?.parentVoiceEntry?.parentSourceStaffEntry?.parentStaff,
            note?.SourceStaff,
            note?.sourceStaff
        ].filter(Boolean);

        for (const staff of staffCandidates) {
            if (globalStaffIdentityMap.has(staff)) {
                return globalStaffIdentityMap.get(staff);
            }
        }

        const fallbackId = Number(staffCandidates[0]?.id ?? note?.ParentStaff?.id ?? note?.parentStaff?.id);
        return Number.isFinite(fallbackId) ? fallbackId : null;
    }

    function getResolvedStaffAssignmentIdFromEntry(entry) {
        const firstNote = entry?.Notes?.[0] || entry?.notes?.[0] || null;
        return getResolvedStaffAssignmentIdFromNote(firstNote);
    }

    window.PTStaff.rebuildGlobalStaffIdentityMap = rebuildGlobalStaffIdentityMap;
    window.PTStaff.getResolvedStaffAssignmentIdFromNote = getResolvedStaffAssignmentIdFromNote;
    window.PTStaff.getResolvedStaffAssignmentIdFromEntry = getResolvedStaffAssignmentIdFromEntry;
    window.PTStaff._getStaffIdentityMap = function () { return globalStaffIdentityMap; };
})();