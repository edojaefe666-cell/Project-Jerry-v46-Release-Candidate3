package com.projectjerry.android.call

import android.telecom.Call
import android.telecom.InCallService

/** Observation-only placeholder. No answer(), reject(), disconnect(), or audio capture calls. */
class JerryInCallService : InCallService() {
    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        // Phase 2.12.1: lifecycle callback only. Do not control the call.
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
    }
}
