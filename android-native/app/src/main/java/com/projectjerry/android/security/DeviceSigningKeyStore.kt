package com.projectjerry.android.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.InvalidKeySpecException
import java.security.KeyFactory
import java.util.Base64

data class DeviceSigningPublicJwk(
    val kty: String = "EC",
    val crv: String = "P-256",
    val x: String,
    val y: String
)

/**
 * Non-exportable P-256 ECDSA signing identity backed by AndroidKeyStore.
 * This identity is deliberately separate from Jerry's ECDH memory-envelope key.
 */
class DeviceSigningKeyStore {
    companion object {
        private const val KEY_ALIAS = "jerry_device_approval_ecdsa_p256_v1"
        private const val CURVE = "secp256r1"
        private const val MAX_SIGNED_MESSAGE_BYTES = 4096
    }

    @Synchronized
    fun getOrCreatePublicJwk(): DeviceSigningPublicJwk {
        val keyStore = loadKeyStore()
        val publicKey = if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.getCertificate(KEY_ALIAS)?.publicKey as? ECPublicKey
                ?: throw IllegalStateException("Stored Jerry device signing certificate is invalid.")
        } else {
            val generator = KeyPairGenerator.getInstance("EC", "AndroidKeyStore")
            generator.initialize(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()
            )
            generator.generateKeyPair().public as ECPublicKey
        }
        return DeviceSigningPublicJwk(
            x = Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey.w.affineX.toFixedCoordinate()),
            y = Base64.getUrlEncoder().withoutPadding().encodeToString(publicKey.w.affineY.toFixedCoordinate())
        )
    }

    @Synchronized
    fun sign(message: ByteArray): ByteArray {
        require(message.isNotEmpty() && message.size <= MAX_SIGNED_MESSAGE_BYTES) {
            "Device approval message must contain 1–4096 bytes."
        }
        val keyStore = loadKeyStore()
        val privateKey = keyStore.getKey(KEY_ALIAS, null) as? PrivateKey
            ?: throw IllegalStateException("Jerry device signing key has not been enrolled.")
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(message)
        return EcdsaSignatureEncoding.derToP1363(signer.sign())
    }

    fun isHardwareBacked(): Boolean {
        val keyStore = loadKeyStore()
        val privateKey = keyStore.getKey(KEY_ALIAS, null) as? PrivateKey
            ?: throw IllegalStateException("Jerry device signing key has not been enrolled.")
        return try {
            val factory = KeyFactory.getInstance(privateKey.algorithm, "AndroidKeyStore")
            val info = factory.getKeySpec(privateKey, KeyInfo::class.java)
            info.isInsideSecureHardware
        } catch (error: InvalidKeySpecException) {
            throw IllegalStateException("Unable to inspect Android Keystore protection level.", error)
        }
    }

    private fun loadKeyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun BigInteger.toFixedCoordinate(): ByteArray {
        val raw = toByteArray()
        val unsigned = if (raw.size == 33 && raw[0] == 0.toByte()) raw.copyOfRange(1, raw.size) else raw
        require(unsigned.size <= 32) { "P-256 public coordinate is too large." }
        return ByteArray(32).also { unsigned.copyInto(it, 32 - unsigned.size) }
    }
}

/** Converts Java's ASN.1 DER ECDSA encoding to WebCrypto's 64-byte P1363 encoding. */
internal object EcdsaSignatureEncoding {
    fun derToP1363(der: ByteArray): ByteArray {
        require(der.size >= 8 && der[0] == 0x30.toByte()) { "ECDSA DER sequence is malformed." }
        val sequenceLength = readLength(der, 1)
        require(sequenceLength.first + sequenceLength.second + 2 == der.size) { "ECDSA DER sequence length is invalid." }
        var offset = 1 + sequenceLength.second
        require(der[offset] == 0x02.toByte()) { "ECDSA DER r integer is missing." }
        val rLength = readLength(der, offset + 1)
        offset += 1 + rLength.second
        val r = der.copyOfRange(offset, offset + rLength.first)
        offset += rLength.first
        require(offset < der.size && der[offset] == 0x02.toByte()) { "ECDSA DER s integer is missing." }
        val sLength = readLength(der, offset + 1)
        offset += 1 + sLength.second
        val s = der.copyOfRange(offset, offset + sLength.first)
        require(offset + sLength.first == der.size) { "ECDSA DER contains trailing data." }
        return fixedInteger(r) + fixedInteger(s)
    }

    fun p1363ToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64) { "P1363 ECDSA signature must be 64 bytes." }
        val r = derInteger(raw.copyOfRange(0, 32))
        val s = derInteger(raw.copyOfRange(32, 64))
        val body = byteArrayOf(0x02) + encodeLength(r.size) + r +
            byteArrayOf(0x02) + encodeLength(s.size) + s
        return byteArrayOf(0x30) + encodeLength(body.size) + body
    }

    private fun fixedInteger(value: ByteArray): ByteArray {
        require(value.isNotEmpty() && value.size <= 33) { "ECDSA DER integer size is invalid." }
        val unsigned = if (value.size == 33 && value[0] == 0.toByte()) value.copyOfRange(1, 33) else value
        require(unsigned.size <= 32) { "ECDSA signature integer exceeds P-256 size." }
        return ByteArray(32).also { unsigned.copyInto(it, 32 - unsigned.size) }
    }

    private fun derInteger(value: ByteArray): ByteArray {
        var first = 0
        while (first < value.lastIndex && value[first] == 0.toByte()) first++
        val unsigned = value.copyOfRange(first, value.size)
        return if (unsigned[0].toInt() and 0x80 != 0) byteArrayOf(0) + unsigned else unsigned
    }

    private fun readLength(bytes: ByteArray, offset: Int): Pair<Int, Int> {
        require(offset < bytes.size) { "ECDSA DER length is truncated." }
        val first = bytes[offset].toInt() and 0xff
        if (first < 0x80) return first to 1
        val count = first and 0x7f
        require(count in 1..2 && offset + count < bytes.size) { "ECDSA DER length encoding is invalid." }
        var length = 0
        for (index in 1..count) length = (length shl 8) or (bytes[offset + index].toInt() and 0xff)
        require(length >= 0x80) { "ECDSA DER length is not minimally encoded." }
        return length to (count + 1)
    }

    private fun encodeLength(length: Int): ByteArray {
        require(length >= 0)
        if (length < 0x80) return byteArrayOf(length.toByte())
        return byteArrayOf(0x81.toByte(), length.toByte())
    }
}
