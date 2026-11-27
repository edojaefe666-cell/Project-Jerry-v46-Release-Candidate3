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
