package com.projectjerry.android.security

import org.junit.Assert.assertEquals
import org.junit.Test

class JerryHkdfSha256Test {
    @Test
    fun matchesRfc5869Sha256TestCaseOne() {
        val ikm = ByteArray(22) { 0x0b }
        val salt = hex("000102030405060708090a0b0c")
        val info = hex("f0f1f2f3f4f5f6f7f8f9")
        val expected = "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
        val actual = JerryHkdfSha256.derive(ikm, salt, info, 42)
        assertEquals(expected, actual.joinToString("") { "%02x".format(it) })
        ikm.fill(0)
        salt.fill(0)
        info.fill(0)
        actual.fill(0)
    }

    @Test
    fun rejectsInvalidOutputLengths() {
        val ikm = byteArrayOf(1)
        val salt = byteArrayOf(2)
        val info = byteArrayOf(3)
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            JerryHkdfSha256.derive(ikm, salt, info, 0)
        }
        org.junit.Assert.assertThrows(IllegalArgumentException::class.java) {
            JerryHkdfSha256.derive(ikm, salt, info, 8161)
        }
    }

    private fun hex(value: String): ByteArray =
        value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
