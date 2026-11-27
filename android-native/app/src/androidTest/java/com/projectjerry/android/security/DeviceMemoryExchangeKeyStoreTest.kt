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

            val preferencesA = context.getSharedPreferences(prefsA, Context.MODE_PRIVATE)
            preferencesA.edit().putString("public_x", "A".repeat(43)).commit()
            assertThrows(Exception::class.java) {
                first.createOrGetPublicKey()
            }
            preferencesA.edit().putString("public_x", publicA.x).commit()

            preferencesA.edit().putString("private_ciphertext", "AAAAAAAAAAAAAAAAAAAAAA").commit()
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

    @Test
    fun unwrapsContextBoundEnvelopeAndPersistsOnlyProtectedDataKey() {
        val suffix = System.nanoTime().toString()
        val alias = "jerry-test-envelope-$suffix"
        val prefs = "jerry-test-envelope-prefs-$suffix"
        val store = DeviceMemoryExchangeKeyStore(context, alias, prefs)
        val ownerUid = "owner-test-123"
        val deviceId = "device_test_1234567890"
        val keyVersion = 7
        try {
            val recipient = store.createOrGetPublicKey()
            val ephemeralGenerator = KeyPairGenerator.getInstance("EC")
            ephemeralGenerator.initialize(ECGenParameterSpec("secp256r1"))
            val ephemeral = ephemeralGenerator.generateKeyPair()
            val parameters = java.security.AlgorithmParameters.getInstance("EC").apply {
                init(ECGenParameterSpec("secp256r1"))
            }.getParameterSpec(java.security.spec.ECParameterSpec::class.java)
            fun coordinate(value: java.math.BigInteger): ByteArray {
                val bytes = value.toByteArray()
                val unsigned = if (bytes.size == 33 && bytes[0] == 0.toByte()) bytes.copyOfRange(1, 33) else bytes
                return ByteArray(32).also { unsigned.copyInto(it, 32 - unsigned.size) }
            }
            val recipientPublic = java.security.KeyFactory.getInstance("EC").generatePublic(
                java.security.spec.ECPublicKeySpec(
                    java.security.spec.ECPoint(
                        java.math.BigInteger(1, android.util.Base64.decode(recipient.x, android.util.Base64.URL_SAFE)),
                        java.math.BigInteger(1, android.util.Base64.decode(recipient.y, android.util.Base64.URL_SAFE)),
                    ),
                    parameters,
                ),
            )
            val agreement = KeyAgreement.getInstance("ECDH")
            agreement.init(ephemeral.private)
            agreement.doPhase(recipientPublic, true)
            val shared = agreement.generateSecret()
            val salt = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
            val iv = ByteArray(12).also { java.security.SecureRandom().nextBytes(it) }
            val rawKey = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
            val contextJson = "{\"ownerUid\":\"$ownerUid\",\"deviceId\":\"$deviceId\",\"keyVersion\":$keyVersion}"
            val contextBytes = contextJson.toByteArray(Charsets.UTF_8)
            val mac = javax.crypto.Mac.getInstance("HmacSHA256")
            mac.init(javax.crypto.spec.SecretKeySpec(salt, "HmacSHA256"))
            val prk = mac.doFinal(shared)
            val info = ("Jerry memory key envelope v1\u0000" + contextJson).toByteArray(Charsets.UTF_8)
            mac.init(javax.crypto.spec.SecretKeySpec(prk, "HmacSHA256"))
            mac.update(info)
            mac.update(1.toByte())
            val wrappingKey = mac.doFinal()
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                javax.crypto.Cipher.ENCRYPT_MODE,
                javax.crypto.spec.SecretKeySpec(wrappingKey, "AES"),
                javax.crypto.spec.GCMParameterSpec(128, iv),
            )
            cipher.updateAAD(contextBytes)
            val encrypted = cipher.doFinal(rawKey)
            fun b64(value: ByteArray) = android.util.Base64.encodeToString(
                value,
                android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
            )
            val ephemeralPublic = ephemeral.public as java.security.interfaces.ECPublicKey
            val envelope = org.json.JSONObject()
                .put("version", 1)
                .put("algorithm", "ECDH-P256-HKDF-SHA256-AES-256-GCM")
                .put("context", org.json.JSONObject().put("ownerUid", ownerUid).put("deviceId", deviceId).put("keyVersion", keyVersion))
                .put("ephemeralPublicKey", org.json.JSONObject()
                    .put("kty", "EC").put("crv", "P-256")
                    .put("x", b64(coordinate(ephemeralPublic.w.affineX)))
                    .put("y", b64(coordinate(ephemeralPublic.w.affineY))))
                .put("salt", b64(salt))
                .put("iv", b64(iv))
                .put("ciphertext", b64(encrypted))

            assertEquals(true, store.unwrapAndStoreMemoryKey(envelope.toString(), ownerUid, deviceId, keyVersion))
            assertEquals(true, store.hasInstalledMemoryKey(ownerUid, deviceId, keyVersion))

            // Validate native record ciphertext against the exact TypeScript AAD contract.
            val recordId = "memory_record_12345"
            val revision = 1
            val payloadJson = """{"schemaVersion":1,"id":"$recordId","category":"lesson","area":"knowledge_experience","title":"Native crypto test","content":"Cross-runtime authenticated encryption","tags":["test"],"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","deleted":false}"""
            val encryptedRecord = store.encryptMemoryRecordPayload(
                ownerUid, deviceId, keyVersion, recordId, revision, payloadJson
            )
            val recordIv = android.util.Base64.decode(encryptedRecord.iv, android.util.Base64.URL_SAFE)
            val recordCiphertext = android.util.Base64.decode(encryptedRecord.ciphertext, android.util.Base64.URL_SAFE)
            val recordAad = """{"purpose":"jerry-memory-record-v1","ownerUid":"$ownerUid","recordId":"$recordId","keyVersion":$keyVersion,"revision":$revision,"schemaVersion":1}"""
                .toByteArray(Charsets.UTF_8)
            val webCryptoCompatible = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            webCryptoCompatible.init(
                javax.crypto.Cipher.DECRYPT_MODE,
                javax.crypto.spec.SecretKeySpec(rawKey, "AES"),
                javax.crypto.spec.GCMParameterSpec(128, recordIv),
            )
            webCryptoCompatible.updateAAD(recordAad)
            assertEquals(payloadJson, webCryptoCompatible.doFinal(recordCiphertext).toString(Charsets.UTF_8))
            assertEquals(
                payloadJson,
                store.decryptMemoryRecordPayload(
                    ownerUid, deviceId, keyVersion, recordId, revision,
                    encryptedRecord.iv, encryptedRecord.ciphertext,
                ),
            )
            assertThrows(Exception::class.java) {
                store.decryptMemoryRecordPayload(
                    ownerUid, deviceId, keyVersion, recordId, revision + 1,
                    encryptedRecord.iv, encryptedRecord.ciphertext,
                )
            }

            assertThrows(IllegalArgumentException::class.java) {
                store.unwrapAndStoreMemoryKey(envelope.toString(), ownerUid, "device_other_123456789", keyVersion)
            }
            val reopened = DeviceMemoryExchangeKeyStore(context, alias, prefs)
            assertEquals(true, reopened.hasInstalledMemoryKey(ownerUid, deviceId, keyVersion))
            shared.fill(0)
            prk.fill(0)
            wrappingKey.fill(0)
            rawKey.fill(0)
        } finally {
            store.deleteKey()
            context.getSharedPreferences(prefs, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }

    @Test
    fun senderWrapsMemoryKeyForRecipientAndRecipientDecryptsSenderRecord() {
        val suffix = System.nanoTime().toString()
        val senderAlias = "jerry-test-sender-$suffix"
        val recipientAlias = "jerry-test-recipient-$suffix"
        val senderPrefs = "jerry-test-sender-prefs-$suffix"
        val recipientPrefs = "jerry-test-recipient-prefs-$suffix"
        val sender = DeviceMemoryExchangeKeyStore(context, senderAlias, senderPrefs)
        val recipient = DeviceMemoryExchangeKeyStore(context, recipientAlias, recipientPrefs)
        val ownerUid = "owner-test-123"
        val senderDeviceId = "sender_device_123456"
        val recipientDeviceId = "recipient_device_123456"
        val keyVersion = 1
        val recordId = "memory_record_e2e_123"
        val payloadJson = """{"schemaVersion":1,"id":"$recordId","category":"lesson","area":"knowledge_experience","title":"Sender to recipient test","content":"A device-shared encrypted memory record","tags":["e2e"],"createdAt":"2026-11-27T00:00:00.000Z","updatedAt":"2026-11-27T00:00:00.000Z","deleted":false}"""
        try {
            sender.createOrGetPublicKey()
            val recipientPublicKey = recipient.createOrGetPublicKey()
            assertEquals(true, sender.createInitialMemoryDataKey(ownerUid, senderDeviceId, keyVersion))
            assertEquals(true, sender.hasInstalledMemoryKey(ownerUid, senderDeviceId, keyVersion))

            val envelope = sender.wrapInstalledMemoryKeyForDevice(
                ownerUid, senderDeviceId, recipientDeviceId, keyVersion, recipientPublicKey,
            )
            assertEquals(recipientDeviceId, envelope.getJSONObject("context").getString("deviceId"))
            assertEquals(ownerUid, envelope.getJSONObject("context").getString("ownerUid"))
            assertEquals(keyVersion, envelope.getJSONObject("context").getInt("keyVersion"))

            assertEquals(
                true,
                recipient.unwrapAndStoreMemoryKey(envelope.toString(), ownerUid, recipientDeviceId, keyVersion),
            )
            assertEquals(true, recipient.hasInstalledMemoryKey(ownerUid, recipientDeviceId, keyVersion))

            val encrypted = sender.encryptMemoryRecordPayload(
                ownerUid, senderDeviceId, keyVersion, recordId, 1, payloadJson,
            )
            val decryptedByRecipient = recipient.decryptMemoryRecordPayload(
                ownerUid, recipientDeviceId, keyVersion, recordId, 1, encrypted.iv, encrypted.ciphertext,
            )
            assertEquals(payloadJson, decryptedByRecipient)

            assertThrows(Exception::class.java) {
                recipient.decryptMemoryRecordPayload(
                    ownerUid, "other_device_123456789", keyVersion, recordId, 1,
                    encrypted.iv, encrypted.ciphertext,
                )
            }
            assertThrows(Exception::class.java) {
                recipient.unwrapAndStoreMemoryKey(
                    envelope.toString(), ownerUid, "wrong_recipient_12345", keyVersion,
                )
            }
        } finally {
            sender.deleteKey()
            recipient.deleteKey()
            context.getSharedPreferences(senderPrefs, Context.MODE_PRIVATE).edit().clear().commit()
            context.getSharedPreferences(recipientPrefs, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }
    @Test
    fun ownerHeldRecoverySecretRestoresMemoryKeyOnReplacementDevice() {
        val suffix = System.nanoTime().toString()
        val sourceAlias = "jerry-test-recovery-source-$suffix"
        val targetAlias = "jerry-test-recovery-target-$suffix"
        val sourcePrefs = "jerry-test-recovery-source-prefs-$suffix"
        val targetPrefs = "jerry-test-recovery-target-prefs-$suffix"
        val source = DeviceMemoryExchangeKeyStore(context, sourceAlias, sourcePrefs)
        val target = DeviceMemoryExchangeKeyStore(context, targetAlias, targetPrefs)
        val ownerUid = "owner-recovery-test-123"
        val sourceDeviceId = "source_device_recovery_123"
        val targetDeviceId = "target_device_recovery_123"
        val keyVersion = 3
        val recordId = "memory_recovery_record_123"
        val payloadJson = """{"schemaVersion":1,"id":"$recordId","category":"lesson","area":"knowledge_experience","title":"Recovery round trip","content":"Restored only with the owner-held recovery secret","tags":["recovery"],"createdAt":"2026-11-28T00:00:00.000Z","updatedAt":"2026-11-28T00:00:00.000Z","deleted":false}"""
        try {
            source.createOrGetPublicKey()
            assertEquals(true, source.createInitialMemoryDataKey(ownerUid, sourceDeviceId, keyVersion))
            val originalRecord = source.encryptMemoryRecordPayload(
                ownerUid, sourceDeviceId, keyVersion, recordId, 1, payloadJson,
            )

            val recovery = source.createOwnerRecoveryEnvelope(ownerUid, sourceDeviceId, keyVersion)
            val recoveryKey = recovery.getString("recoveryKey")
            val envelope = recovery.getJSONObject("envelope")
            assertEquals(true, recoveryKey.matches(Regex("[A-Za-z0-9_-]{43}")))
            assertEquals(1, envelope.getInt("version"))
            assertEquals("HKDF-SHA256-AES-256-GCM", envelope.getString("algorithm"))
            assertEquals(ownerUid, envelope.getJSONObject("context").getString("ownerUid"))
            assertEquals(keyVersion, envelope.getJSONObject("context").getInt("keyVersion"))
            assertEquals(false, envelope.toString().contains(recoveryKey))

            assertEquals(
                true,
                target.restoreMemoryKeyFromOwnerRecoveryEnvelope(
                    envelope.toString(), recoveryKey, ownerUid, targetDeviceId, keyVersion,
                ),
            )
            assertEquals(true, target.hasInstalledMemoryKey(ownerUid, targetDeviceId, keyVersion))
            assertEquals(
                payloadJson,
                target.decryptMemoryRecordPayload(
                    ownerUid, targetDeviceId, keyVersion, recordId, 1,
                    originalRecord.iv, originalRecord.ciphertext,
                ),
            )

            assertThrows(Exception::class.java) {
                target.restoreMemoryKeyFromOwnerRecoveryEnvelope(
                    envelope.toString(), "A".repeat(43), ownerUid, "another_device_recovery_123", keyVersion,
                )
            }
            assertThrows(Exception::class.java) {
                target.restoreMemoryKeyFromOwnerRecoveryEnvelope(
                    envelope.toString(), recoveryKey, "another-owner", "another_device_recovery_123", keyVersion,
                )
            }
            assertThrows(Exception::class.java) {
                target.restoreMemoryKeyFromOwnerRecoveryEnvelope(
                    envelope.toString(), recoveryKey, ownerUid, "another_device_recovery_123", keyVersion + 1,
                )
            }
            val tampered = JSONObject(envelope.toString())
            val ciphertext = tampered.getString("ciphertext")
            tampered.put("ciphertext", ciphertext.dropLast(1) + if (ciphertext.last() == 'A') "B" else "A")
            assertThrows(Exception::class.java) {
                target.restoreMemoryKeyFromOwnerRecoveryEnvelope(
                    tampered.toString(), recoveryKey, ownerUid, "another_device_recovery_123", keyVersion,
                )
            }
        } finally {
            source.deleteKey()
            target.deleteKey()
            context.getSharedPreferences(sourcePrefs, Context.MODE_PRIVATE).edit().clear().commit()
            context.getSharedPreferences(targetPrefs, Context.MODE_PRIVATE).edit().clear().commit()
        }
    }

}
