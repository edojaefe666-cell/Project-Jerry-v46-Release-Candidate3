package com.projectjerry.android.permissions

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat

/** Centralizes user-mediated Android permissions and roles. Nothing is silently granted. */
class JerryPermissionManager(private val context: Context) {
    companion object {
        const val REQUEST_SCREENING_ROLE = 7211
        const val REQUEST_DIALER_ROLE = 7212
        val runtimePermissions = buildList {
            add(android.Manifest.permission.RECORD_AUDIO)
            add(android.Manifest.permission.MODIFY_AUDIO_SETTINGS)
            if (Build.VERSION.SDK_INT <= 30) add(android.Manifest.permission.BLUETOOTH)
        }
    }

    fun missingRuntimePermissions(): List<String> = runtimePermissions.filter {
        ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED
    }

    fun screeningRoleHeld(): Boolean = roleHeld(RoleManager.ROLE_CALL_SCREENING)
    fun dialerRoleHeld(): Boolean = roleHeld(RoleManager.ROLE_DIALER)

    private fun roleHeld(role: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val manager = context.getSystemService(RoleManager::class.java) ?: return false
        return manager.isRoleAvailable(role) && manager.isRoleHeld(role)
    }

    fun screeningRoleRequest(): Intent? = roleRequest(RoleManager.ROLE_CALL_SCREENING)
    fun dialerRoleRequest(): Intent? = roleRequest(RoleManager.ROLE_DIALER)

    private fun roleRequest(role: String): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val manager = context.getSystemService(RoleManager::class.java) ?: return null
        if (!manager.isRoleAvailable(role) || manager.isRoleHeld(role)) return null
        return manager.createRequestRoleIntent(role)
    }

    fun statusSummary(): String = buildString {
        append("Android API: ${Build.VERSION.SDK_INT}\n")
        append("Missing runtime permissions: ${missingRuntimePermissions().joinToString().ifBlank { "none" }}\n")
        append("Call-screening role: ${if (screeningRoleHeld()) "granted" else "not granted"}\n")
        append("Default-dialer role: ${if (dialerRoleHeld()) "granted" else "not granted"}\n")
        append("Call-control verification: NOT PERFORMED")
    }
}
