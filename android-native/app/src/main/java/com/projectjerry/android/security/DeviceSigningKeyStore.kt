package com.projectjerry.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

/**
 * Owner-device approval identity held by Android Keystore.
 *
 * The private key is generated inside Android Keystore and is never exported.
 * The public key is safe to register with Jerry's owner-scoped device registry.
 */
class DeviceSigningKeyStore(
    private val alias: String = DEFAULT_ALIAS,
) {
    data class PublicJwk(
        val kty: String = "EC",
        val crv: String = "P-256",
        val x: String,
        val y: String,
    )

    fun createOrGetPublicKey(): PublicJwk {
        val store = keyStore()
        if (!store.containsAlias(alias)) {
            val generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                ANDROID_KEY_STORE,
            )
            generator.initialize(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build(),
            )
            generator.generateKeyPair()
        }
        val publicKey = store.getCertificate(alias)?.publicKey as? ECPublicKey
            ?: throw IllegalStateException("Android Keystore signing public key is unavailable.")
        return PublicJwk(
            x = encodeCoordinate(publicKey.w.affineX),
            y = encodeCoordinate(publicKey.w.affineY),
        )
    }

    /** Signs the exact UTF-8 canonical challenge bytes; returns WebCrypto-compatible r||s. */
    fun signCanonicalChallenge(payload: ByteArray): String {
        require(payload.isNotEmpty() && payload.size <= 4096) { "Approval challenge payload is invalid." }
        val store = keyStore()
        val privateKey = store.getKey(alias, null)
            ?: throw IllegalStateException("Device signing key has not been enrolled.")
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey as java.security.PrivateKey)
        signer.update(payload)
        val der = signer.sign()
        return Base64.encodeToString(derToRaw(der), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    fun deleteKey() {
        val store = keyStore()
        if (store.containsAlias(alias)) store.deleteEntry(alias)
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    private fun encodeCoordinate(value: BigInteger): String {
        val raw = value.toByteArray()
        val unsigned = if (raw.size == 33 && raw[0] == 0.toByte()) raw.copyOfRange(1, raw.size) else raw
        require(unsigned.size <= 32) { "P-256 coordinate exceeds 32 bytes." }
        val padded = ByteArray(32)
        unsigned.copyInto(padded, 32 - unsigned.size)
        return Base64.encodeToString(padded, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun derToRaw(der: ByteArray): ByteArray {
        require(der.size in 8..80 && der[0] == 0x30.toByte()) { "ECDSA signature DER sequence is invalid." }
        var offset = 2
        if ((der[1].toInt() and 0xff) == 0x81) offset = 3
        require(der[offset] == 0x02.toByte()) { "ECDSA signature R integer is missing." }
        val rLength = der[offset + 1].toInt() and 0xff
        val rStart = offset + 2
        val sTag = rStart + rLength
        require(sTag + 2 <= der.size && der[sTag] == 0x02.toByte()) { "ECDSA signature S integer is missing." }
        val sLength = der[sTag + 1].toInt() and 0xff
        val sStart = sTag + 2
        require(sStart + sLength <= der.size) { "ECDSA signature is truncated." }
        val r = unsignedInteger(der.copyOfRange(rStart, rStart + rLength))
        val s = unsignedInteger(der.copyOfRange(sStart, sStart + sLength))
        require(r.size <= 32 && s.size <= 32) { "ECDSA signature integer is oversized." }
        return ByteArray(64).also {
            r.copyInto(it, 32 - r.size)
            s.copyInto(it, 64 - s.size)
        }
    }

    private fun unsignedInteger(value: ByteArray): ByteArray {
        var start = 0
        while (start < value.size - 1 && value[start] == 0.toByte()) start++
        return value.copyOfRange(start, value.size)
    }

    companion object {
        const val DEFAULT_ALIAS = "com.projectjerry.device.approval.signing.v1"
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
    }
}
