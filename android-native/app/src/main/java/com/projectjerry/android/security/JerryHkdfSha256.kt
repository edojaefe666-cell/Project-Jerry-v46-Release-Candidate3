package com.projectjerry.android.security

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** RFC 5869 HKDF-SHA256 used by Jerry's native key-envelope formats. */
internal object JerryHkdfSha256 {
    fun derive(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
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
            try {
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
                return output
            } finally {
                previous.fill(0)
            }
        } finally {
            prk.fill(0)
            if (salt.isEmpty()) effectiveSalt.fill(0)
        }
    }
}
