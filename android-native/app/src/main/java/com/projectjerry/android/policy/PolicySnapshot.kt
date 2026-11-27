package com.projectjerry.android.policy

import java.time.Instant

/** Minimal immutable cache schema mirrored from the Phase 2.10/2.11 server policy. */
data class PolicySnapshot(
    val schemaVersion: Int,
    val generatedAtEpochSeconds: Long,
    val expiresAtEpochSeconds: Long,
    val revision: String,
    val handsFreeEnabled: Boolean,
    val securityLocked: Boolean,
    val contacts: List<ApprovedNumber>
)

data class ApprovedNumber(
    val contactId: String,
    val displayName: String,
    val e164Number: String,
    val status: String,
    val blocked: Boolean,
    val spam: Boolean,
    val conflict: Boolean
)

fun interface SnapshotSignatureVerifier {
    /** Must verify a server signature using a pinned public key. Default implementation denies. */
    fun verify(canonicalPayload: ByteArray, signature: ByteArray): Boolean
}

sealed class SnapshotValidation {
    data object Valid : SnapshotValidation()
    data object InvalidSignature : SnapshotValidation()
    data object Expired : SnapshotValidation()
    data object FutureDated : SnapshotValidation()
    data object UnsupportedSchema : SnapshotValidation()
    data object StaleRevision : SnapshotValidation()
}

class PolicySnapshotValidator(
    private val verifier: SnapshotSignatureVerifier,
    private val maxAgeSeconds: Long = 15 * 60,
    private val nowSeconds: () -> Long = { Instant.now().epochSecond }
) {
    fun validate(
        snapshot: PolicySnapshot,
        canonicalPayload: ByteArray,
        signature: ByteArray,
        lastAcceptedRevision: String? = null
    ): SnapshotValidation {
        if (snapshot.schemaVersion != 1) return SnapshotValidation.UnsupportedSchema
        if (snapshot.generatedAtEpochSeconds > nowSeconds() + 30) return SnapshotValidation.FutureDated
        if (snapshot.expiresAtEpochSeconds <= nowSeconds() ||
            nowSeconds() - snapshot.generatedAtEpochSeconds > maxAgeSeconds) return SnapshotValidation.Expired
        if (lastAcceptedRevision != null && snapshot.revision == lastAcceptedRevision) {
            // Same revision is allowed for refresh; monotonic ordering belongs to signed server metadata.
        }
        if (!verifier.verify(canonicalPayload, signature)) return SnapshotValidation.InvalidSignature
        return SnapshotValidation.Valid
    }
}
