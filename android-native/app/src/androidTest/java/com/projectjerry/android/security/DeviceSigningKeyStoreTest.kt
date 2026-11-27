package com.projectjerry.android.security

import androidx.test.ext.junit.runners.AndroidJUnit4
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyStore as JavaKeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceSigningKeyStoreTest {
    @Test
    fun signingKeyIsPersistentNonExportableAndProducesWebCryptoCompatibleProofs() {
        val store = DeviceSigningKeyStore()
        val firstJwk = store.getOrCreatePublicJwk()
        assertEquals("EC", firstJwk.kty)
        assertEquals("P-256", firstJwk.crv)
        assertEquals(43, firstJwk.x.length)
        assertEquals(43, firstJwk.y.length)

        val message = """{"purpose":"jerry-device-approval-v1","nonce":"test-nonce"}""".toByteArray()
        val rawSignature = store.sign(message)
        assertEquals(64, rawSignature.size)

        val params = AlgorithmParameters.getInstance("EC").apply {
            init(ECGenParameterSpec("secp256r1"))
        }.getParameterSpec(java.security.spec.ECParameterSpec::class.java)
        val publicKey = KeyFactory.getInstance("EC").generatePublic(
            ECPublicKeySpec(
                java.security.spec.ECPoint(
                    BigInteger(1, Base64.getUrlDecoder().decode(firstJwk.x)),
                    BigInteger(1, Base64.getUrlDecoder().decode(firstJwk.y))
                ),
                params
            )
        ) as ECPublicKey
        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(publicKey)
        verifier.update(message)
        assertEquals(true, verifier.verify(EcdsaSignatureEncoding.p1363ToDer(rawSignature)))

        val keyStore = JavaKeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val privateKey = keyStore.getKey("jerry_device_approval_ecdsa_p256_v1", null)
        assertNotNull(privateKey)
        assertNull("Android Keystore private key must not be exportable.", privateKey.encoded)

        val secondJwk = DeviceSigningKeyStore().getOrCreatePublicJwk()
        assertEquals(firstJwk, secondJwk)
        assertFalse(firstJwk.x.isBlank())
    }
}
