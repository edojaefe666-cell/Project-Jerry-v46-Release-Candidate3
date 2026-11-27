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
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

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
            val encodedPrivate = decryptPrivateKey(iv, ciphertext, storedX, storedY)
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
        val publicKey = pair.public as java.security.interfaces.ECPublicKey
        val x = encodeCoordinate(publicKey.w.affineX)
        val y = encodeCoordinate(publicKey.w.affineY)
        try {
            val encrypted = encryptPrivateKey(privateBytes, x, y)
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
        val storedX = preferences.getString(KEY_PUBLIC_X, null)
            ?: throw IllegalStateException("Memory exchange public key is missing.")
        val storedY = preferences.getString(KEY_PUBLIC_Y, null)
            ?: throw IllegalStateException("Memory exchange public key is missing.")
        val privateBytes = decryptPrivateKey(iv, ciphertext, storedX, storedY)
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

    /**
     * Decrypts a WebCrypto-compatible v1 envelope entirely inside the native
     * security boundary, then persists the recovered AES-256 data key only as
     * Android-Keystore-authenticated ciphertext. Raw data-key bytes are never
     * returned to JavaScript or written to preferences.
     */
    @Synchronized
    fun unwrapAndStoreMemoryKey(
        envelopeJson: String,
        expectedOwnerUid: String,
        expectedDeviceId: String,
        expectedKeyVersion: Int,
    ): Boolean {
        require(envelopeJson.length in 2..16_384) { "Memory key envelope is invalid." }
        require(expectedOwnerUid.isNotBlank() && expectedOwnerUid.length <= 160) { "Expected owner is invalid." }
        require(expectedDeviceId.matches(Regex("[A-Za-z0-9_-]{16,128}"))) { "Expected device ID is invalid." }
        require(expectedKeyVersion in 1..999_999_999) { "Expected key version is invalid." }

        val envelope = JSONObject(envelopeJson)
        require(envelope.optInt("version", -1) == 1) { "Memory key envelope version is unsupported." }
        require(envelope.optString("algorithm") == "ECDH-P256-HKDF-SHA256-AES-256-GCM") {
            "Memory key envelope algorithm is unsupported."
        }
        val context = envelope.getJSONObject("context")
        val ownerUid = context.getString("ownerUid")
        val deviceId = context.getString("deviceId")
        val keyVersion = context.getInt("keyVersion")
        require(ownerUid == expectedOwnerUid && deviceId == expectedDeviceId && keyVersion == expectedKeyVersion) {
            "Memory key envelope context does not match this owner, device, and key version."
        }
        val contextJson = canonicalContextJson(ownerUid, deviceId, keyVersion)
        val contextBytes = contextJson.toByteArray(Charsets.UTF_8)
        val ephemeral = envelope.getJSONObject("ephemeralPublicKey")
        val peer = PublicJwk(
            kty = ephemeral.getString("kty"),
            crv = ephemeral.getString("crv"),
            x = ephemeral.getString("x"),
            y = ephemeral.getString("y"),
        )
        require(peer.kty == "EC" && peer.crv == "P-256") { "Envelope ephemeral key must be P-256." }
        val salt = decodeBase64Url(envelope.getString("salt"), 32, "salt")
        val iv = decodeBase64Url(envelope.getString("iv"), 12, "IV")
        val ciphertext = decodeBase64Url(envelope.getString("ciphertext"), 48, "ciphertext")

        val sharedSecret = deriveSharedSecret(peer)
        var wrappingKey: ByteArray? = null
        var rawMemoryKey: ByteArray? = null
        try {
            val info = ("Jerry memory key envelope v1\u0000" + contextJson).toByteArray(Charsets.UTF_8)
            wrappingKey = hkdfSha256(sharedSecret, salt, info, 32)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(wrappingKey, "AES"), GCMParameterSpec(GCM_TAG_BITS, iv))
            cipher.updateAAD(contextBytes)
            rawMemoryKey = cipher.doFinal(ciphertext)
            require(rawMemoryKey.size == 32) { "Unwrapped memory data key has an invalid length." }
            persistMemoryDataKey(rawMemoryKey, contextJson)
            return true
        } finally {
            sharedSecret.fill(0)
            wrappingKey?.fill(0)
            rawMemoryKey?.fill(0)
            salt.fill(0)
            iv.fill(0)
            ciphertext.fill(0)
            contextBytes.fill(0)
        }
    }

    /** True only when a locally authenticated key exists for this exact context. */
    @Synchronized
    fun hasInstalledMemoryKey(ownerUid: String, deviceId: String, keyVersion: Int): Boolean {
        val contextJson = canonicalContextJson(ownerUid, deviceId, keyVersion)
        val suffix = contextStorageId(contextJson)
        val iv = preferences.getString(DATA_KEY_IV_PREFIX + suffix, null)?.let { Base64.decode(it, BASE64_FLAGS) }
            ?: return false
        val ciphertext = preferences.getString(DATA_KEY_CIPHERTEXT_PREFIX + suffix, null)
            ?.let { Base64.decode(it, BASE64_FLAGS) } ?: return false
        if (iv.size != GCM_IV_BYTES || ciphertext.size != 48) return false
        val plaintext = decryptPersistedMemoryKey(iv, ciphertext, contextJson)
        return try {
            plaintext.size == 32
        } finally {
            plaintext.fill(0)
        }
    }

    private fun persistMemoryDataKey(rawKey: ByteArray, contextJson: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
        cipher.updateAAD(("Jerry local memory data key v1\u0000" + contextJson).toByteArray(Charsets.UTF_8))
        val encrypted = cipher.doFinal(rawKey)
        val suffix = contextStorageId(contextJson)
        val saved = preferences.edit()
            .putString(DATA_KEY_IV_PREFIX + suffix, encode(cipher.iv))
            .putString(DATA_KEY_CIPHERTEXT_PREFIX + suffix, encode(encrypted))
            .commit()
        check(saved) { "Unable to persist the protected Jerry memory data key." }
        encrypted.fill(0)
    }

    private fun decryptPersistedMemoryKey(iv: ByteArray, ciphertext: ByteArray, contextJson: String): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateWrappingKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        cipher.updateAAD(("Jerry local memory data key v1\u0000" + contextJson).toByteArray(Charsets.UTF_8))
        return cipher.doFinal(ciphertext)
    }

    private fun canonicalContextJson(ownerUid: String, deviceId: String, keyVersion: Int): String {
        require(ownerUid.isNotBlank() && ownerUid.length <= 160) { "Memory key owner is invalid." }
        require(deviceId.matches(Regex("[A-Za-z0-9_-]{16,128}"))) { "Memory key device ID is invalid." }
        require(keyVersion in 1..999_999_999) { "Memory key version is invalid." }
        return "{\"ownerUid\":${JSONObject.quote(ownerUid)},\"deviceId\":${JSONObject.quote(deviceId)},\"keyVersion\":$keyVersion}"
    }

    private fun contextStorageId(contextJson: String): String =
        Base64.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(contextJson.toByteArray(Charsets.UTF_8)),
            BASE64_FLAGS,
        )

    private fun decodeBase64Url(value: String, expectedSize: Int, field: String): ByteArray {
        require(value.matches(Regex("[A-Za-z0-9_-]+"))) { "Memory key envelope $field encoding is invalid." }
        val decoded = Base64.decode(value, BASE64_FLAGS)
        require(decoded.size == expectedSize) { "Memory key envelope $field length is invalid." }
        return decoded
    }

    /** RFC 5869 HKDF-SHA256; output is limited to the SHA-256 255-block bound. */
    private fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        require(length in 1..(255 * 32)) { "HKDF output length is invalid." }
        val mac = Mac.getInstance("HmacSHA256")
        val effectiveSalt = if (salt.isEmpty()) ByteArray(32) else salt
        mac.init(SecretKeySpec(effectiveSalt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)
        try {
            val output = ByteArray(length)
            var previous = ByteArray(0)
            var offset = 0
            var counter = 1
            while (offset < length) {
                mac.init(SecretKeySpec(prk, "HmacSHA256"))
                mac.update(previous)
                mac.update(info)
                mac.update(counter.toByte())
                val block = mac.doFinal()
                previous.fill(0)
                previous = block
                val count = minOf(block.size, length - offset)
                block.copyInto(output, offset, 0, count)
                offset += count
                counter++
            }
            previous.fill(0)
            return output
        } finally {
            prk.fill(0)
        }
    }

    /** Removes this device's wrapped exchange key and locally installed data keys. */
    @Synchronized
    fun deleteKey() {
        val editor = preferences.edit()
            .remove(KEY_PUBLIC_X)
            .remove(KEY_PUBLIC_Y)
            .remove(KEY_PRIVATE_IV)
            .remove(KEY_PRIVATE_CIPHERTEXT)
        preferences.all.keys.filter {
            it.startsWith(DATA_KEY_IV_PREFIX) || it.startsWith(DATA_KEY_CIPHERTEXT_PREFIX)
        }.forEach { editor.remove(it) }
        editor.commit()
        val store = keyStore()
        if (store.containsAlias(encryptionAlias)) store.deleteEntry(encryptionAlias)
    }

    private fun encryptPrivateKey(
        plaintext: ByteArray,
        publicX: String,
        publicY: String,
    ): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
        cipher.updateAAD(publicKeyBinding(publicX, publicY))
        val ciphertext = cipher.doFinal(plaintext)
        return cipher.iv to ciphertext
    }

    private fun decryptPrivateKey(
        iv: ByteArray,
        ciphertext: ByteArray,
        publicX: String,
        publicY: String,
    ): ByteArray {
        require(iv.size == GCM_IV_BYTES) { "Memory exchange key IV is invalid." }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateWrappingKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
        cipher.updateAAD(publicKeyBinding(publicX, publicY))
        return cipher.doFinal(ciphertext)
    }

    /** Authenticates the persisted public identity together with its private key ciphertext. */
    private fun publicKeyBinding(publicX: String, publicY: String): ByteArray =
        "Jerry device memory exchange key v1\u0000$publicX\u0000$publicY".toByteArray(Charsets.UTF_8)

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
        private const val DATA_KEY_IV_PREFIX = "memory_data_key_iv_"
        private const val DATA_KEY_CIPHERTEXT_PREFIX = "memory_data_key_ciphertext_"
    }
}
