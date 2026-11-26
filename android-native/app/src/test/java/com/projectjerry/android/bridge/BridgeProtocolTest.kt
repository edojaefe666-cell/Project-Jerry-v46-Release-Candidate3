package com.projectjerry.android.bridge

import org.junit.Assert.*
import org.junit.Test

class BridgeProtocolTest {
    private fun event(seq: Long, id: String = "e$seq") = BridgeEvent(
        BridgeEnvelope(messageId = id, messageType = BridgeMessageType.DEVICE_EVENT,
            bridgeInstanceId = "bridge-1", deviceSessionId = "session-1", createdAtEpochMs = 100),
        seq, BridgeEventType.INCOMING_CALL_RINGING, 100, callId = "call-1"
    )

    private fun command(type: CommandType = CommandType.REQUEST_DEVICE_STATUS, key: String = "idem-1") = AndroidBridgeCommand(
        commandId = "cmd-1", idempotencyKey = key, commandType = type,
        issuedAtEpochMs = 100, expiresAtEpochMs = 10_000, correlationId = "corr-1",
        callId = if (type == CommandType.ANSWER_INCOMING_CALL) "call-1" else null,
        authorizationId = if (type == CommandType.ANSWER_INCOMING_CALL) "auth-1" else null,
        expectedPolicyVersion = "p1", expectedRegistryRevision = 4
    )

    @Test fun eventGapBuffersAndDrainsInOrder() {
        val sequencer = EventSequencer(now = { 200 })
        val gap = sequencer.accept(event(2)) as EventIngestResult.Buffered
        assertEquals(EventAckStatus.BUFFERED, gap.acknowledgement.status)
        val first = sequencer.accept(event(1)) as EventIngestResult.Accepted
        assertEquals(EventAckStatus.ACCEPTED, first.acknowledgement.status)
        assertEquals(2L, sequencer.lastContiguousSequence())
    }

    @Test fun duplicateEventIsNotProcessedAgain() {
        val sequencer = EventSequencer(now = { 200 })
        sequencer.accept(event(1))
        val duplicate = sequencer.accept(event(1)) as EventIngestResult.Accepted
        assertEquals(EventAckStatus.DUPLICATE, duplicate.acknowledgement.status)
        assertEquals(1L, sequencer.lastContiguousSequence())
    }

    @Test fun oversizedGapRequiresResync() {
        val sequencer = EventSequencer(maxGap = 2, now = { 200 })
        val result = sequencer.accept(event(5)) as EventIngestResult.Accepted
        assertEquals(EventAckStatus.RESYNC_REQUIRED, result.acknowledgement.status)
    }

    @Test fun duplicateCommandReturnsOriginalState() {
        val ledger = CommandIdempotencyLedger()
        val cmd = command()
        assertEquals(CommandStatus.RECEIVED, ledger.begin(cmd, "session-1", 200).status)
        val executing = ledger.transition(cmd, "session-1", CommandStatus.VALIDATING, 201)
        assertEquals(CommandStatus.VALIDATING, executing.status)
        assertEquals(CommandStatus.VALIDATING, ledger.begin(cmd, "session-1", 202).status)
    }

    @Test fun sameIdempotencyKeyWithDifferentPayloadIsRejected() {
        val ledger = CommandIdempotencyLedger()
        ledger.begin(command(), "session-1", 200)
        val conflict = command(type = CommandType.LEAVE_CALL)
        assertEquals("IDEMPOTENCY_CONFLICT", ledger.begin(conflict, "session-1", 201).errorCode)
    }

    @Test fun invalidCommandStateTransitionIsRejected() {
        val ledger = CommandIdempotencyLedger()
        val cmd = command()
        ledger.begin(cmd, "session-1", 200)
        val result = ledger.transition(cmd, "session-1", CommandStatus.SUCCEEDED, 201)
        assertTrue(result.errorCode!!.startsWith("INVALID_STATE_TRANSITION"))
    }

    @Test fun expiredAnswerIsRejected() {
        val reason = validateAnswerCommand(command(CommandType.ANSWER_INCOMING_CALL), 10_001,
            "call-1", true, true, true, false, false, true, "p1", 4)
        assertEquals(RejectionReason.EXPIRED_COMMAND, reason)
    }

    @Test fun securityLockAndPolicyMismatchFailClosed() {
        val cmd = command(CommandType.ANSWER_INCOMING_CALL)
        assertEquals(RejectionReason.SECURITY_LOCK_ACTIVE,
            validateAnswerCommand(cmd, 200, "call-1", true, true, true, true, false, true, "p1", 4))
        assertEquals(RejectionReason.POLICY_VERSION_MISMATCH,
            validateAnswerCommand(cmd, 200, "call-1", true, true, true, false, false, true, "p2", 4))
    }

    @Test fun timeoutNeverAssumesAnswerSucceeded() {
        assertEquals(CommandStatus.UNKNOWN, timeoutOutcome(CommandType.ANSWER_INCOMING_CALL))
    }
}
