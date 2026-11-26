package com.projectjerry.android.policy

import org.junit.Assert.assertEquals
import org.junit.Test

class PolicySnapshotValidatorTest {
    private val now = 1_800_000_000L
    private fun snapshot(schema: Int = 1, generated: Long = now - 10, expires: Long = now + 100) =
        PolicySnapshot(schema, generated, expires, "r1", true, false, emptyList())

    @Test fun validSignedFreshSnapshotAccepted() {
        val validator = PolicySnapshotValidator(SnapshotSignatureVerifier { _, _ -> true }, nowSeconds = { now })
        assertEquals(SnapshotValidation.Valid, validator.validate(snapshot(), byteArrayOf(1), byteArrayOf(2)))
    }

    @Test fun invalidSignatureRejected() {
        val validator = PolicySnapshotValidator(SnapshotSignatureVerifier { _, _ -> false }, nowSeconds = { now })
        assertEquals(SnapshotValidation.InvalidSignature, validator.validate(snapshot(), byteArrayOf(1), byteArrayOf(2)))
    }

    @Test fun expiredSnapshotRejected() {
        val validator = PolicySnapshotValidator(SnapshotSignatureVerifier { _, _ -> true }, nowSeconds = { now })
        assertEquals(SnapshotValidation.Expired, validator.validate(snapshot(expires = now - 1), byteArrayOf(1), byteArrayOf(2)))
    }

    @Test fun oldSnapshotRejected() {
        val validator = PolicySnapshotValidator(SnapshotSignatureVerifier { _, _ -> true }, maxAgeSeconds = 60, nowSeconds = { now })
        assertEquals(SnapshotValidation.Expired, validator.validate(snapshot(generated = now - 61), byteArrayOf(1), byteArrayOf(2)))
    }

    @Test fun futureDatedSnapshotRejected() {
        val validator = PolicySnapshotValidator(SnapshotSignatureVerifier { _, _ -> true }, nowSeconds = { now })
        assertEquals(SnapshotValidation.FutureDated, validator.validate(snapshot(generated = now + 31), byteArrayOf(1), byteArrayOf(2)))
    }

    @Test fun unknownSchemaRejected() {
        val validator = PolicySnapshotValidator(SnapshotSignatureVerifier { _, _ -> true }, nowSeconds = { now })
        assertEquals(SnapshotValidation.UnsupportedSchema, validator.validate(snapshot(schema = 2), byteArrayOf(1), byteArrayOf(2)))
    }
}
