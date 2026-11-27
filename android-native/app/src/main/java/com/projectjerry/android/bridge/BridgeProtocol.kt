package com.projectjerry.android.bridge

/** Versioned, transport-neutral protocol shared by the Android bridge and Jerry gateway. */
const val BRIDGE_PROTOCOL_VERSION = 1

enum class BridgeMessageType { DEVICE_EVENT, COMMAND, ACKNOWLEDGEMENT, HEARTBEAT, SYNC_REQUEST, SYNC_RESPONSE, ERROR }
enum class BridgeEventType {
    BRIDGE_STARTED, BRIDGE_STOPPED, HEARTBEAT,
    DEVICE_LOCKED, DEVICE_UNLOCKED, LOST_DEVICE_MODE_CHANGED,
    HANDSFREE_ENABLED, HANDSFREE_DISABLED, PERMISSION_CHANGED,
    CALL_SCREENING_ROLE_CHANGED, DEFAULT_DIALER_ROLE_CHANGED,
    INCOMING_CALL_DETECTED, INCOMING_CALL_RINGING, INCOMING_CALL_DISCONNECTED, INCOMING_CALL_MISSED,
    CALL_ANSWER_REQUESTED, CALL_ANSWER_CONFIRMED, CALL_ANSWER_FAILED, CALL_STATE_CHANGED,
    AUDIO_ROUTE_CHANGED, JOSHUA_TAKEOVER_REQUESTED, JERRY_SPEECH_STOPPED, JERRY_LEFT_CALL
}
enum class CommandType {
    UPDATE_POLICY_SNAPSHOT, REQUEST_DEVICE_STATUS, REQUEST_PERMISSION_STATUS,
    SCREEN_INCOMING_CALL, ANSWER_INCOMING_CALL, DECLINE_INCOMING_CALL,
    STOP_JERRY_SPEECH, LEAVE_CALL, CANCEL_COMMAND, SYNC_EVENTS
}
enum class CommandStatus { RECEIVED, VALIDATING, ACCEPTED, EXECUTING, SUCCEEDED, FAILED, REJECTED, EXPIRED, CANCELLED, UNKNOWN }
enum class EventAckStatus { ACCEPTED, DUPLICATE, BUFFERED, REJECTED, RESYNC_REQUIRED }
enum class RejectionReason {
    INVALID_COMMAND, EXPIRED_COMMAND, IDEMPOTENCY_CONFLICT, INVALID_DEVICE_SESSION,
    UNKNOWN_CALL, CALL_NOT_RINGING, CALL_STATE_CHANGED, SECURITY_LOCK_ACTIVE,
    LOST_DEVICE_MODE_ACTIVE, HANDSFREE_DISABLED, CALL_CONTROL_UNAVAILABLE, PERMISSION_MISSING,
    CONTACT_APPROVAL_REVOKED, CONTACT_BLOCKED, CONTACT_SPAM, CALLER_ID_UNAVAILABLE,
    NUMBER_MATCH_AMBIGUOUS, POLICY_VERSION_MISMATCH, REGISTRY_REVISION_MISMATCH,
    AUTHORIZATION_INVALID, AUTHORIZATION_EXPIRED, AUTHORIZATION_ALREADY_USED, INTERNAL_ERROR
}

data class BridgeEnvelope(
    val protocolVersion: Int = BRIDGE_PROTOCOL_VERSION,
    val messageId: String,
    val messageType: BridgeMessageType,
    val bridgeInstanceId: String,
    val deviceSessionId: String,
    val createdAtEpochMs: Long,
    val expiresAtEpochMs: Long? = null,
    val correlationId: String? = null,
    val payloadVersion: Int = 1
)

data class BridgeEvent(
    val envelope: BridgeEnvelope,
    val sequenceNumber: Long,
    val eventType: BridgeEventType,
    val occurredAtEpochMs: Long,
    val callId: String? = null,
    /** Keep payloads non-sensitive: no phone number, audio, transcript, token or message body. */
    val payload: Map<String, String> = emptyMap()
)

data class EventAcknowledgement(
    val eventId: String,
    val sequenceNumber: Long,
    val status: EventAckStatus,
    val highestContiguousSequence: Long,
    val serverReceivedAtEpochMs: Long,
    val errorCode: String? = null
)

data class AndroidBridgeCommand(
    val commandId: String,
    val idempotencyKey: String,
    val commandType: CommandType,
    val issuedAtEpochMs: Long,
    val expiresAtEpochMs: Long,
    val correlationId: String,
    val callId: String? = null,
    val authorizationId: String? = null,
    val expectedCallState: String? = null,
    val expectedPolicyVersion: String? = null,
    val expectedRegistryRevision: Long? = null,
    val payload: Map<String, String> = emptyMap()
)

data class CommandAcknowledgement(
    val commandId: String,
    val idempotencyKey: String,
    val status: CommandStatus,
    val acknowledgedAtEpochMs: Long,
    val completedAtEpochMs: Long? = null,
    val executionAttempt: Int = 1,
    val resultCode: String? = null,
    val errorCode: String? = null,
    val actualCallState: String? = null
)

data class BridgeHeartbeat(
    val bridgeInstanceId: String,
    val deviceSessionId: String,
    val timestampEpochMs: Long,
    val lastEventSequence: Long,
    val handsFreeEnabled: Boolean,
    val securityLocked: Boolean,
    val lostDeviceMode: Boolean,
    val callControlAvailable: Boolean,
    val policyVersion: String?,
    val registryRevision: Long
)

data class BridgeSyncState(
    val bridgeInstanceId: String,
    val lastContiguousEventSequence: Long,
    val pendingCommandIds: Set<String>,
    val unresolvedCommandIds: Set<String>
)

data class TimeoutPolicy(
    val eventAckMs: Long = 2_000,
    val commandReceiptMs: Long = 2_000,
    val commandValidationMs: Long = 1_000,
    val statusRequestMs: Long = 5_000,
    val answerAuthorizationMaxMs: Long = 5_000,
    val answerConfirmationMs: Long = 3_000,
    val heartbeatIntervalMs: Long = 30_000,
    val missedHeartbeatsDegraded: Int = 2,
    val missedHeartbeatsOffline: Int = 3
) {
    init {
        require(listOf(eventAckMs, commandReceiptMs, commandValidationMs, statusRequestMs,
            answerAuthorizationMaxMs, answerConfirmationMs, heartbeatIntervalMs).all { it > 0 })
        require(missedHeartbeatsDegraded > 0 && missedHeartbeatsOffline > missedHeartbeatsDegraded)
    }
}

sealed class EventIngestResult {
    data class Accepted(val acknowledgement: EventAcknowledgement) : EventIngestResult()
    data class Buffered(val acknowledgement: EventAcknowledgement) : EventIngestResult()
    data class Rejected(val reason: String) : EventIngestResult()
}

/** In-memory sequencing primitive. Production must persist its state transactionally. */
class EventSequencer(
    private val maxGap: Long = 32,
    private val maxBuffered: Int = 64,
    private val now: () -> Long = System::currentTimeMillis
) {
    private var bridgeInstanceId: String? = null
    private var nextExpected = 1L
    private val seen = mutableSetOf<String>()
    private val buffered = sortedMapOf<Long, BridgeEvent>()

    @Synchronized fun accept(event: BridgeEvent): EventIngestResult {
        val instance = event.envelope.bridgeInstanceId
        if (event.envelope.protocolVersion != BRIDGE_PROTOCOL_VERSION) return EventIngestResult.Rejected("UNSUPPORTED_PROTOCOL")
        if (event.envelope.messageType != BridgeMessageType.DEVICE_EVENT) return EventIngestResult.Rejected("INVALID_MESSAGE_TYPE")
        if (event.sequenceNumber < 1 || event.envelope.messageId.isBlank()) return EventIngestResult.Rejected("INVALID_EVENT_ID_OR_SEQUENCE")
        if (bridgeInstanceId == null) bridgeInstanceId = instance
        if (bridgeInstanceId != instance) return EventIngestResult.Rejected("BRIDGE_INSTANCE_MISMATCH")
        val id = event.envelope.messageId
        if (id in seen || buffered.values.any { it.envelope.messageId == id }) {
            return EventIngestResult.Accepted(ack(event, EventAckStatus.DUPLICATE))
        }
        if (event.sequenceNumber < nextExpected) return EventIngestResult.Rejected("SEQUENCE_REPLAY")
        if (event.sequenceNumber - nextExpected > maxGap || buffered.size >= maxBuffered) {
            return EventIngestResult.Accepted(ack(event, EventAckStatus.RESYNC_REQUIRED, "SEQUENCE_GAP_TOO_LARGE"))
        }
        if (event.sequenceNumber > nextExpected) {
            buffered[event.sequenceNumber] = event
            return EventIngestResult.Buffered(ack(event, EventAckStatus.BUFFERED, "MISSING_SEQUENCE_$nextExpected"))
        }
        seen += id
        nextExpected++
        while (true) {
            val following = buffered.remove(nextExpected) ?: break
            seen += following.envelope.messageId
            nextExpected++
        }
        return EventIngestResult.Accepted(ack(event, EventAckStatus.ACCEPTED))
    }

    @Synchronized fun lastContiguousSequence(): Long = nextExpected - 1

    private fun ack(event: BridgeEvent, status: EventAckStatus, error: String? = null) =
        EventAcknowledgement(event.envelope.messageId, event.sequenceNumber, status, nextExpected - 1, now(), error)
}

/** Idempotency ledger. Persist this ledger (and state transition) in a durable transaction in production. */
class CommandIdempotencyLedger {
    private data class Entry(val fingerprint: String, var acknowledgement: CommandAcknowledgement)
    private val entries = mutableMapOf<String, Entry>()

    @Synchronized fun begin(command: AndroidBridgeCommand, deviceSessionId: String, nowMs: Long): CommandAcknowledgement {
        val key = "$deviceSessionId:${command.idempotencyKey}"
        val fingerprint = listOf(command.commandType.name, command.callId.orEmpty(), command.authorizationId.orEmpty(),
            command.expectedCallState.orEmpty(), command.expectedPolicyVersion.orEmpty(),
            command.expectedRegistryRevision?.toString().orEmpty(), command.payload.toSortedMap().toString()).joinToString("|")
        val existing = entries[key]
        if (existing != null) {
            if (existing.fingerprint != fingerprint) return ack(command, CommandStatus.REJECTED, nowMs, error = "IDEMPOTENCY_CONFLICT")
            return existing.acknowledgement
        }
        val initial = when {
            command.commandId.isBlank() || command.idempotencyKey.isBlank() -> ack(command, CommandStatus.REJECTED, nowMs, error = "INVALID_COMMAND")
            command.expiresAtEpochMs <= nowMs || command.issuedAtEpochMs > nowMs + 30_000 -> ack(command, CommandStatus.EXPIRED, nowMs, error = "EXPIRED_OR_FUTURE_COMMAND")
            else -> ack(command, CommandStatus.RECEIVED, nowMs)
        }
        entries[key] = Entry(fingerprint, initial)
        return initial
    }

    @Synchronized fun transition(command: AndroidBridgeCommand, deviceSessionId: String, next: CommandStatus, nowMs: Long, error: String? = null, result: String? = null): CommandAcknowledgement {
        val key = "$deviceSessionId:${command.idempotencyKey}"
        val entry = entries[key] ?: return ack(command, CommandStatus.REJECTED, nowMs, error = "COMMAND_NOT_REGISTERED")
        val current = entry.acknowledgement.status
        if (current == next) return entry.acknowledgement
        val allowed = when (current) {
            CommandStatus.RECEIVED -> setOf(CommandStatus.VALIDATING, CommandStatus.REJECTED, CommandStatus.EXPIRED, CommandStatus.CANCELLED)
            CommandStatus.VALIDATING -> setOf(CommandStatus.ACCEPTED, CommandStatus.REJECTED, CommandStatus.EXPIRED, CommandStatus.CANCELLED)
            CommandStatus.ACCEPTED -> setOf(CommandStatus.EXECUTING, CommandStatus.CANCELLED, CommandStatus.EXPIRED)
            CommandStatus.EXECUTING -> setOf(CommandStatus.SUCCEEDED, CommandStatus.FAILED, CommandStatus.UNKNOWN)
            else -> emptySet()
        }
        if (next !in allowed) return ack(command, CommandStatus.REJECTED, nowMs, error = "INVALID_STATE_TRANSITION_${current}_TO_$next")
        val completed = if (next in setOf(CommandStatus.SUCCEEDED, CommandStatus.FAILED, CommandStatus.REJECTED, CommandStatus.EXPIRED, CommandStatus.CANCELLED, CommandStatus.UNKNOWN)) nowMs else null
        return ack(command, next, nowMs, completed, error, result).also { entry.acknowledgement = it }
    }

    private fun ack(command: AndroidBridgeCommand, status: CommandStatus, now: Long, completed: Long? = null,
                    error: String? = null, result: String? = null) =
        CommandAcknowledgement(command.commandId, command.idempotencyKey, status, now, completed,
            resultCode = result, errorCode = error)
}

/** A timeout never authorizes a retry of a non-repeatable action. */
fun timeoutOutcome(commandType: CommandType): CommandStatus = when (commandType) {
    CommandType.ANSWER_INCOMING_CALL, CommandType.DECLINE_INCOMING_CALL -> CommandStatus.UNKNOWN
    CommandType.STOP_JERRY_SPEECH, CommandType.LEAVE_CALL -> CommandStatus.UNKNOWN
    else -> CommandStatus.UNKNOWN
}

fun validateAnswerCommand(command: AndroidBridgeCommand, nowMs: Long, currentCallId: String?, callIsRinging: Boolean,
                          authorizationValid: Boolean, handsFreeEnabled: Boolean, securityLocked: Boolean,
                          lostDeviceMode: Boolean, callControlAvailable: Boolean, policyVersion: String?,
                          registryRevision: Long?): RejectionReason? {
    if (command.commandType != CommandType.ANSWER_INCOMING_CALL || command.callId.isNullOrBlank()) return RejectionReason.INVALID_COMMAND
    if (command.expiresAtEpochMs <= nowMs) return RejectionReason.EXPIRED_COMMAND
    if (command.callId != currentCallId) return RejectionReason.UNKNOWN_CALL
    if (!callIsRinging) return RejectionReason.CALL_NOT_RINGING
    if (!handsFreeEnabled) return RejectionReason.HANDSFREE_DISABLED
    if (securityLocked) return RejectionReason.SECURITY_LOCK_ACTIVE
    if (lostDeviceMode) return RejectionReason.LOST_DEVICE_MODE_ACTIVE
    if (!callControlAvailable) return RejectionReason.CALL_CONTROL_UNAVAILABLE
    if (!authorizationValid || command.authorizationId.isNullOrBlank()) return RejectionReason.AUTHORIZATION_INVALID
    if (command.expectedPolicyVersion != policyVersion) return RejectionReason.POLICY_VERSION_MISMATCH
    if (command.expectedRegistryRevision != registryRevision) return RejectionReason.REGISTRY_REVISION_MISMATCH
    return null
}
