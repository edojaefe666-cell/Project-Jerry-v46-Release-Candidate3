package com.projectjerry.android.call

import android.telecom.Call
import android.telecom.CallScreeningService

/** Phase 2.12.1 pass-through stub. It deliberately does not screen, silence, reject, or answer. */
class JerryCallScreeningService : CallScreeningService() {
    override fun onScreenCall(callDetails: Call.Details) {
        // Fail open to the user's normal phone handling until a verified policy adapter exists.
        respondToCall(callDetails, CallResponse.Builder()
            .setDisallowCall(false)
            .setRejectCall(false)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build())
    }
}
