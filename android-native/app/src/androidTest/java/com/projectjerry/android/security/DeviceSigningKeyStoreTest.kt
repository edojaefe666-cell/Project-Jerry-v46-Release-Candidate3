package com.projectjerry.android.security

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.math.BigInteger
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.AlgorithmParameters
import java.security.spec.ECParameterSpec

@RunWith(AndroidJUnit4::class)
class DeviceSigningKeyStoreTest {
    @Test
    fun createsNonExportableKeyAndSignsChallengeVerifiableByRegisteredPublicKey() {
        val alias = "jerry-test-device-signing-${System.nanoTime()}"
        val store = DeviceSigningKeyStore(alias)
        try {
            val jwk = store.createOrGetPublicKey()
            assertEquals("EC", jwk.kty)
            assertEquals("P-256", jwk.crv)
            assertEquals(43, jwk.x.length)
            assertEquals(43, jwk.y.length)

            val payload = """{"purpose":"jerry-device-approval-v1","nonce":"test-nonce"}""".toByteArray()
            val rawSignature = Base64.decode(
                store.signCanonicalChallenge(payload),
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
            )
            assertEquals(64, rawSignature.size)

            val parameters = AlgorithmParameters.getInstance("EC").apply {
                init(ECGenParameterSpec("secp256r1"))
            }.getParameterSpec(ECParameterSpec::class.java)
            val x = BigInteger(1, Base64.decode(jwk.x, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            val y = BigInteger(1, Base64.decode(jwk.y, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            val publicKey = KeyFactory.getInstance("EC").generatePublic(
                ECPublicKeySpec(ECPoint(x, y), parameters)
            )
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            verifier.update(payload)
            assertTrue(verifier.verify(rawToDer(rawSignature)))
            assertFalse(store.createOrGetPublicKey().x.isBlank())
        } finally {
            store.deleteKey()
        }
    }

    @Test
    fun signsCanonicalOwnerBoundApprovalChallengeAndRejectsExpiredChallenge() {
        val alias = "jerry-test-approval-${System.nanoTime()}"
        val store = DeviceSigningKeyStore(alias)
        try {
            val expiry = java.time.Instant.now().plusSeconds(180).toString()
            val challenge = org.json.JSONObject()
                .put("challengeId", "challenge_1234567890123456")
                .put("nonce", "n".repeat(48))
                .put("ownerUid", "owner-uid-123")
                .put("approverDeviceId", "approver_device_123456")
                .put("targetRegistrationId", "pending_registration_123")
                .put("expiresAt", expiry)
            val proof = store.signApprovalChallenge(challenge.toString())
            val jwk = proof.getJSONObject("publicKey")
            val raw = Base64.decode(
                proof.getString("signature"),
                Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
            )
            assertEquals(64, raw.size)
            val normalizedExpiry = java.time.format.DateTimeFormatter
                .ofPattern("uuuu-MM-dd'T'HH:mm:ss.SSS'Z'")
                .withZone(java.time.ZoneOffset.UTC)
                .format(java.time.Instant.parse(expiry))
            val canonical = """{"purpose":"jerry-device-approval-v1","challengeId":"challenge_1234567890123456","nonce":"${"n".repeat(48)}","ownerUid":"owner-uid-123","approverDeviceId":"approver_device_123456","targetRegistrationId":"pending_registration_123","expiresAt":"$normalizedExpiry"}"""
            val parameters = AlgorithmParameters.getInstance("EC").apply {
                init(ECGenParameterSpec("secp256r1"))
            }.getParameterSpec(ECParameterSpec::class.java)
            val x = BigInteger(1, Base64.decode(jwk.getString("x"), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            val y = BigInteger(1, Base64.decode(jwk.getString("y"), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            val publicKey = KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), parameters))
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            verifier.update(canonical.toByteArray(Charsets.UTF_8))
            assertTrue(verifier.verify(rawToDer(raw)))

            val expired = org.json.JSONObject(challenge.toString())
                .put("expiresAt", java.time.Instant.now().minusSeconds(10).toString())
            org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
                store.signApprovalChallenge(expired.toString())
            }
        } finally {
            store.deleteKey()
        }
    }

    private fun rawToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64)
        fun integer(part: ByteArray): ByteArray {
            var start = 0
            while (start < part.size - 1 && part[start] == 0.toByte()) start++
            var value = part.copyOfRange(start, part.size)
            if ((value[0].toInt() and 0x80) != 0) value = byteArrayOf(0) + value
            return byteArrayOf(0x02, value.size.toByte()) + value
        }
        val r = integer(raw.copyOfRange(0, 32))
        val s = integer(raw.copyOfRange(32, 64))
        val body = r + s
        return byteArrayOf(0x30, body.size.toByte()) + body
    }
}
