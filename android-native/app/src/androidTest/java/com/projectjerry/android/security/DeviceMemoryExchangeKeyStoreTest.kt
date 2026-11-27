package com.projectjerry.android.security

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import javax.crypto.KeyAgreement
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeviceMemoryExchangeKeyStoreTest {
    private val context: Context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun persistsPublicIdentityAcrossStoreInstancesAndDerivesMatchingEcdhSecret() {
        val suffix = System.nanoTime().toString()
        val alias = "jerry-test-memory-exchange-$suffix"
        val prefs = "jerry-test-memory-exchange-prefs-$suffix"
        val store = DeviceMemoryExchangeKeyStore(context, alias, prefs)
        try {
            val first = store.createOrGetPublicKey()
            val reopened = DeviceMemoryExchangeKeyStore(context, alias, prefs)
            val second = reopened.createOrGetPublicKey()
            assertEquals(first, second)

            val peerGenerator = KeyPairGenerator.getInstance("EC")
            peerGenerator.initialize(ECGenParameterSpec("secp256r1"))
            val peerPair = peerGenerator.generateKeyPair()
            val peerPublic = peerPair.public as java.security.interfaces.ECPublicKey
            fun coordinate(value: java.math.BigInteger): String {
                val bytes = value.toByteArray()
                val unsigned = if (bytes.size == 33 && bytes[0] == 0.toByte()) bytes.copyOfRange(1, 33) else bytes
                val padded = ByteArray(32)
                unsigned.copyInto(padded, 32 - unsigned.size)
                return android.util.Base64.encodeToString(
                    padded,
                    android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
                )
            }
            val peerJwk = DeviceMemoryExchangeKeyStore.PublicJwk(
                x = coordinate(peerPublic.w.affineX),
                y = coordinate(peerPublic.w.affineY),
            )
            val fromStore = store.deriveSharedSecret(peerJwk)
            val peerAgreement = KeyAgreement.getInstance("ECDH")
            peerAgreement.init(peerPair.private)
            peerAgreement.doPhase(
                java.security.KeyFactory.getInstance("EC").generatePublic(
                    java.security.spec.ECPublicKeySpec(
                        java.security.spec.ECPoint(
                            java.math.BigInteger(1, android.util.Base64.decode(first.x, android.util.Base64.URL_SAFE)),
                            java.math.BigInteger(1, android.util.Base64.decode(first.y, android.util.Base64.URL_SAFE)),
                        ),
                        java.security.AlgorithmParameters.getInstance("EC").apply {
                            init(ECGenParameterSpec("secp256r1"))
                        }.getParameterSpec(java.security.spec.ECParameterSpec::class.java),
                    ),
                ),
                true,
            )
            val fromPeer = peerAgreement.generateSecret()
            assertArrayEquals(fromPeer, fromStore)
            fromStore.fill(0)
            fromPeer.fill(0)
        } finally {
            store.deleteKey()
            context.getSharedPreferences(prefs, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }

    @Test
    fun isolatesDifferentDeviceAliasesAndDetectsTamperedStoredCiphertext() {
        val suffix = System.nanoTime().toString()
        val aliasA = "jerry-test-memory-a-$suffix"
        val aliasB = "jerry-test-memory-b-$suffix"
        val prefsA = "jerry-test-memory-prefs-a-$suffix"
        val prefsB = "jerry-test-memory-prefs-b-$suffix"
        val first = DeviceMemoryExchangeKeyStore(context, aliasA, prefsA)
        val second = DeviceMemoryExchangeKeyStore(context, aliasB, prefsB)
        try {
            val publicA = first.createOrGetPublicKey()
            val publicB = second.createOrGetPublicKey()
            assertNotEquals(publicA, publicB)

            context.getSharedPreferences(prefsA, Context.MODE_PRIVATE)
                .edit().putString("private_ciphertext", "AAAAAAAAAAAAAAAAAAAAAA").commit()
            assertThrows(Exception::class.java) {
                first.createOrGetPublicKey()
            }
        } finally {
            first.deleteKey()
            second.deleteKey()
            context.getSharedPreferences(prefsA, Context.MODE_PRIVATE).edit().clear().commit()
            context.getSharedPreferences(prefsB, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }
}
