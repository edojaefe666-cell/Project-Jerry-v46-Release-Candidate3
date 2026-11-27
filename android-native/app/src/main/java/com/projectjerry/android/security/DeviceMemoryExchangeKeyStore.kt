package com.projectjerry.android.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.spec.PKCS8EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

/**
 * Android 10-compatible ECDH identity for encrypted-memory key envelopes.
 *
 * API 29 does not provide a portable Android Keystore ECDH agreement purpose.
 * Therefore the P-256 private key is generated in-process, encrypted immediately
 * with a non-exportable Android Keystore AES-256-GCM key, and persisted only as
 * authenticated ciphertext in app-private preferences. The ECDH private key is
 * software-resident briefly during generation/agreement; it is NOT hardware-backed.
 *
 * This class never exposes private-key bytes to JavaScript or network callers.
 */
class DeviceMemoryExchangeKeyStore(
    context: Context,
    private val alias: String = DEFAULT_ALIAS,
    private val preferencesName: String = DEFAULT_PREFERENCES,
) {
    data class PublicJwk(
        val kty: String = "EC",
        val crv: String = "P-256",
        val x: String,
        val y: String,
    )

    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val encryptionAlias = "$alias.aes-gcm-wrap.v1"

    @Synchronized
    fun createOrGetPublicKey(): PublicJwk {
        val storedX = preferences.getString(KEY_PUBLIC_X, null)
        val storedY = preferences.getString(KEY_PUBLIC_Y, null)
        val iv = decodeStored(KEY_PRIVATE_IV)
        val ciphertext = decodeStored(KEY_PRIVATE_CIPHERTEXT)
        if (storedX != null || storedY != null || iv != null || ciphertext != null) {
            require(!storedX.isNullOrBlank() && !storedY.isNullOrBlank() && iv != null && ciphertext != null) {
                "Stored memory exchange key is incomplete."
            }
            require(iv.size == GCM_IV_BYTES && ciphertext.size >= 16) {
                "Stored memory exchange key is malformed."
            }
            // Authenticate the stored private-key ciphertext before returning its public identity.
            val encodedPrivate = decryptPrivateKey(iv, ciphertext)
            try {
                require(encodedPrivate.isNotEmpty()) { "Stored memory exchange private key is empty." }
            } finally {
                encodedPrivate.fill(0)
            }
            return PublicJwk(x = storedX, y = storedY)
        }

        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec(CURVE))
        val pair = generator.generateKeyPair()
        val privateBytes = pair.private.encoded
            ?: throw IllegalStateException("Generated memory exchange key cannot be encoded for protected storage.")
        try {
            val encrypted = encryptPrivateKey(privateBytes)
            val publicKey = pair.public as java.security.interfaces.ECPublicKey
            val x = encodeCoordinate(publicKey.w.affineX)
            val y = encodeCoordinate(publicKey.w.affineY)
            val saved = preferences.edit()
                .putString(KEY_PUBLIC_X, x)
                .putString(KEY_PUBLIC_Y, y)
                .putString(KEY_PRIVATE_IV, encode(encrypted.first))
                .putString(KEY_PRIVATE_CIPHERTEXT, encode(encrypted.second))
                .commit()
            check(saved) { "Unable to persist the protected memory exchange key." }
            return PublicJwk(x = x, y = y)
        } finally {
            privateBytes.fill(0)
        }
    }

    /**
     * Derives an ECDH shared secret for native envelope processing only.
     * Callers must keep the returned bytes inside the native security boundary
     * and zero them after HKDF/envelope decryption.
     */
    @Synchronized
    internal fun deriveSharedSecret(peer: PublicJwk): ByteArray {
        require(peer.kty == "EC" && peer.crv == "P-256") { "Peer memory key must be a P-256 EC JWK." }
        val xBytes = decodeCoordinate(peer.x)
        val yBytes = decodeCoordinate(peer.y)
        val parameters = AlgorithmParameters.getInstance("EC").apply {
            init(ECGenParameterSpec(CURVE))
        }.getParameterSpec(java.security.spec.ECParameterSpec::class.java)
        val peerKey: PublicKey = KeyFactory.getInstance("EC").generatePublic(
            ECPublicKeySpec(
                ECPoint(BigInteger(1, xBytes), BigInteger(1, yBytes)),
                parameters,
            ),
        )
        xBytes.fill(0)
        yBytes.fill(0)

        val iv = decodeStored(KEY_PRIVATE_IV)
            ?: throw IllegalStateException("Memory exchange key has not been enrolled.")
        val ciphertext = decodeStored(KEY_PRIVATE_CIPHERTEXT)
            ?: throw IllegalStateException("Memory exchange key has not been enrolled.")
        val privateBytes = decryptPrivateKey(iv, ciphertext)
        try {
            val privateKey = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(privateBytes))
            val agreement = KeyAgreement.getInstance("ECDH")
            agreement.init(privateKey)
            agreement.doPhase(peerKey, true)
            return agreement.generateSecret()
        } finally {
            privateBytes.fill(0)
        }
    }

    /** Removes this device's wrapped exchange key; existing envelopes then become unreadable here. */
    @Synchronized
    fun deleteKey() {
        preferences.edit()
            .remove(KEY_PUBLIC_X)
            .remove(KEY_PUBLIC_Y)
            .remove(KEY_PRIVATE_IV)
            .remove(KEY_PRIVATE_CIPHERTEXT)
            .commit()
        val store = keyStore()
        if (store.containsAlias(encryptionAlias)) store.deleteEntry(encryptionAlias)
    }

    private fun encryptPrivateKey(plaintext: ByteArray): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
        val ciphertext = cipher.doFinal(plaintext)
        return cipher.iv to ciphertext
    }

    private fun decryptPrivateKey(iv: ByteArray, ciphertext: ByteArray): ByteArray {
        require(iv.size == GCM_IV_BYTES) { "Memory exchange key IV is invalid." }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateWrappingKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        return cipher.doFinal(ciphertext)
    }

    private fun getOrCreateWrappingKey(): java.security.Key {
        val store = keyStore()
        val existing = store.getKey(encryptionAlias, null)
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                encryptionAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return generator.generateKey()
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    private fun decodeStored(key: String): ByteArray? =
        preferences.getString(key, null)?.let { Base64.decode(it, BASE64_FLAGS) }

    private fun decodeCoordinate(value: String): ByteArray {
        val decoded = Base64.decode(value, BASE64_FLAGS)
        require(decoded.size == 32) { "P-256 public-key coordinate must be 32 bytes." }
        return decoded
    }

    private fun encodeCoordinate(value: BigInteger): String {
        val raw = value.toByteArray()
        val unsigned = if (raw.size == 33 && raw[0] == 0.toByte()) raw.copyOfRange(1, 33) else raw
        require(unsigned.size <= 32) { "P-256 coordinate exceeds 32 bytes." }
        val padded = ByteArray(32)
        unsigned.copyInto(padded, 32 - unsigned.size)
        return encode(padded)
    }

    private fun encode(value: ByteArray): String =
        Base64.encodeToString(value, BASE64_FLAGS)

    companion object {
        const val DEFAULT_ALIAS = "com.projectjerry.device.memory.exchange.v1"
        const val DEFAULT_PREFERENCES = "com.projectjerry.device.memory.exchange.private.v1"
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val CURVE = "secp256r1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_IV_BYTES = 12
        private const val GCM_TAG_BITS = 128
        private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        private const val KEY_PUBLIC_X = "public_x"
        private const val KEY_PUBLIC_Y = "public_y"
        private const val KEY_PRIVATE_IV = "private_iv"
        private const val KEY_PRIVATE_CIPHERTEXT = "private_ciphertext"
    }
}
