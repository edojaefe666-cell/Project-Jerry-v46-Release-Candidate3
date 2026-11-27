package com.projectjerry.android.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.net.Uri
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialException
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.WebMessageCompat
import androidx.webkit.JavaScriptReplyProxy
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.projectjerry.android.security.DeviceSigningKeyStore
import com.projectjerry.android.security.DeviceMemoryExchangeKeyStore
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Hosts the bundled Jerry React application. Cloud API calls use the HTTPS
 * VITE_API_BASE_URL compiled into the web bundle; no API secret is stored here.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val credentialManager by lazy { CredentialManager.create(this) }
    private val authRequestInProgress = AtomicBoolean(false)
    private val deviceSigningKeyStore by lazy { DeviceSigningKeyStore() }
    private val deviceMemoryExchangeKeyStore by lazy { DeviceMemoryExchangeKeyStore(applicationContext) }
    private var pendingAudioPermission: PermissionRequest? = null

    // Ask for microphone access only when Jerry's trusted local UI requests audio.
    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val request = pendingAudioPermission
        pendingAudioPermission = null
        if (request != null) {
            if (granted) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            else request.deny()
        }
    }

    private fun beginNativeGoogleSignIn() {
        if (isFinishing || isDestroyed || !authRequestInProgress.compareAndSet(false, true)) return

        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(getString(com.projectjerry.android.R.string.default_web_client_id))
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        try {
            credentialManager.getCredentialAsync(
                this,
                request,
                null,
                ContextCompat.getMainExecutor(this),
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) {
                        authRequestInProgress.set(false)
                        val credential = result.credential
                        if (credential is CustomCredential &&
                            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                        ) {
                            try {
                                val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
                                dispatchNativeAuthResult(idToken)
                            } catch (_: Exception) {
                                dispatchNativeAuthError()
                            }
                        } else {
                            dispatchNativeAuthError()
                        }
                    }

                    override fun onError(e: GetCredentialException) {
                        authRequestInProgress.set(false)
                        dispatchNativeAuthError()
                    }
                }
            )
        } catch (_: Exception) {
            authRequestInProgress.set(false)
            dispatchNativeAuthError()
        }
    }

    /**
     * Device-key commands are accepted only through the trusted main-frame
     * WebMessageListener registered for https://localhost.
     */
    private fun handleNativeDeviceSigningMessage(
        messageData: String,
        replyProxy: JavaScriptReplyProxy
    ): Boolean {
        var requestId = ""
        return try {
            val message = JSONObject(messageData)
            requestId = message.optString("requestId")
            require(requestId.matches(Regex("[A-Za-z0-9_-]{8,128}"))) { "Native request ID is invalid." }
            when (message.optString("type")) {
                "getDeviceSigningPublicKey" -> {
                    val key = deviceSigningKeyStore.createOrGetPublicKey()
                    replyProxy.postMessage(
                        JSONObject().put("ok", true).put("requestId", requestId).put(
                            "publicKey",
                            JSONObject().put("kty", key.kty).put("crv", key.crv).put("x", key.x).put("y", key.y)
                        ).toString()
                    )
                    true
                }
                "getDeviceMemoryExchangePublicKey" -> {
                    val key = deviceMemoryExchangeKeyStore.createOrGetPublicKey()
                    replyProxy.postMessage(
                        JSONObject().put("ok", true).put("requestId", requestId).put(
                            "publicKey",
                            JSONObject().put("kty", key.kty).put("crv", key.crv).put("x", key.x).put("y", key.y)
                        ).toString()
                    )
                    true
                }
                "unwrapDeviceMemoryKeyEnvelope" -> {
                    val envelope = message.optJSONObject("envelope")
                        ?: throw IllegalArgumentException("Memory key envelope is required.")
                    val ownerUid = message.optString("ownerUid")
                    val deviceId = message.optString("deviceId")
                    val keyVersion = message.optInt("keyVersion", -1)
                    val installed = deviceMemoryExchangeKeyStore.unwrapAndStoreMemoryKey(
                        envelope.toString(), ownerUid, deviceId, keyVersion
                    )
                    replyProxy.postMessage(
                        JSONObject().put("ok", true).put("requestId", requestId)
                            .put("installed", installed).toString()
                    )
                    true
                }
                "encryptMemoryRecordPayload" -> {
                    val result = deviceMemoryExchangeKeyStore.encryptMemoryRecordPayload(
                        message.optString("ownerUid"),
                        message.optString("deviceId"),
                        message.optInt("keyVersion", -1),
                        message.optString("recordId"),
                        message.optInt("revision", -1),
                        message.optString("plaintextJson"),
                    )
                    replyProxy.postMessage(
                        JSONObject().put("ok", true).put("requestId", requestId)
                            .put("iv", result.iv).put("ciphertext", result.ciphertext).toString()
                    )
                    true
                }
                "decryptMemoryRecordPayload" -> {
                    val plaintext = deviceMemoryExchangeKeyStore.decryptMemoryRecordPayload(
                        message.optString("ownerUid"),
                        message.optString("deviceId"),
                        message.optInt("keyVersion", -1),
                        message.optString("recordId"),
                        message.optInt("revision", -1),
                        message.optString("iv"),
                        message.optString("ciphertext"),
                    )
                    replyProxy.postMessage(
                        JSONObject().put("ok", true).put("requestId", requestId)
                            .put("plaintextJson", plaintext).toString()
                    )
                    true
                }
                "deleteDeviceMemoryExchangeKey" -> {
                    AlertDialog.Builder(this)
                        .setTitle("Delete this device's memory key?")
                        .setMessage(
                            "This permanently removes this device's protected memory exchange key. " +
                                "Existing Jerry memory-key envelopes for this device may become unreadable. " +
                                "Continue only if you understand that this device may lose access to encrypted memory."
                        )
                        .setNegativeButton("Cancel") { dialog, _ ->
                            dialog.dismiss()
                            replyProxy.postMessage(
                                JSONObject().put("ok", false).put("requestId", requestId)
                                    .put("error", "Memory exchange key deletion was cancelled by the owner.").toString()
                            )
                        }
                        .setPositiveButton("Delete key") { dialog, _ ->
                            dialog.dismiss()
                            try {
                                deviceMemoryExchangeKeyStore.deleteKey()
                                replyProxy.postMessage(
                                    JSONObject().put("ok", true).put("requestId", requestId).toString()
                                )
                            } catch (error: Exception) {
                                replyProxy.postMessage(
                                    JSONObject().put("ok", false).put("requestId", requestId)
                                        .put("error", error.message ?: "Memory exchange key deletion failed.").toString()
                                )
                            }
                        }
                        .setOnCancelListener {
                            replyProxy.postMessage(
                                JSONObject().put("ok", false).put("requestId", requestId)
                                    .put("error", "Memory exchange key deletion was cancelled by the owner.").toString()
                            )
                        }
                        .show()
                    true
                }
                "signDeviceApprovalChallenge" -> {
                    val challenge = message.optJSONObject("challenge")
                        ?: throw IllegalArgumentException("Approval challenge is required.")
                    val targetRegistrationId = challenge.optString("targetRegistrationId")
                    require(targetRegistrationId.matches(Regex("[A-Za-z0-9_-]{16,128}"))) {
                        "Target device registration is invalid."
                    }
                    AlertDialog.Builder(this)
                        .setTitle("Approve another Jerry device?")
                        .setMessage(
                            "A new device is requesting access to your Jerry account. " +
                                "Approve registration " + targetRegistrationId + "? " +
                                "Only continue if you initiated this enrollment."
                        )
                        .setNegativeButton("Cancel") { dialog, _ ->
                            dialog.dismiss()
                            replyProxy.postMessage(
                                JSONObject().put("ok", false).put("requestId", requestId)
                                    .put("error", "Device approval was cancelled by the owner.").toString()
                            )
                        }
                        .setPositiveButton("Approve device") { dialog, _ ->
                            dialog.dismiss()
                            try {
                                val result = deviceSigningKeyStore.signApprovalChallenge(challenge.toString())
                                replyProxy.postMessage(
                                    JSONObject().put("ok", true).put("requestId", requestId)
                                        .put("proof", result).toString()
                                )
                            } catch (error: Exception) {
                                replyProxy.postMessage(
                                    JSONObject().put("ok", false).put("requestId", requestId)
                                        .put("error", error.message ?: "Device approval signing failed.").toString()
                                )
                            }
                        }
                        .setOnCancelListener {
                            replyProxy.postMessage(
                                JSONObject().put("ok", false).put("requestId", requestId)
                                    .put("error", "Device approval was cancelled by the owner.").toString()
                            )
                        }
                        .show()
                    true
                }
                "signDeviceMemoryRequestChallenge" -> {
                    val challenge = message.optJSONObject("challenge")
                        ?: throw IllegalArgumentException("Memory request challenge is required.")
                    val method = challenge.optString("method")
                    val targetPath = challenge.optString("path")
                    val collectionRead = method == "GET" && targetPath == "/api/memory/encrypted"
                    val recordRead = method == "GET" &&
                        targetPath.matches(Regex("/api/memory/encrypted/[A-Za-z0-9_-]{16,128}"))
                    val keyEnvelopeRead = method == "GET" &&
                        targetPath.matches(Regex("/api/memory/key-envelopes/[1-9][0-9]{0,8}"))
                    val isWrite = method == "POST" || method == "PUT"
                    val allowedWrite = (method == "POST" &&
                        (targetPath == "/api/memory/encrypted" || targetPath == "/api/memory/key-envelopes")) ||
                        (method == "PUT" &&
                            targetPath.matches(Regex("/api/memory/encrypted/[A-Za-z0-9_-]{16,128}")))
                    require(collectionRead || recordRead || keyEnvelopeRead || allowedWrite) {
                        "Only encrypted-memory and device key-envelope requests can be signed."
                    }
                    val signAndReply = {
                        try {
                            val proof = deviceSigningKeyStore.signMemoryRequestChallenge(challenge.toString())
                            replyProxy.postMessage(
                                JSONObject().put("ok", true).put("requestId", requestId)
                                    .put("proof", proof).toString()
                            )
                        } catch (error: Exception) {
                            replyProxy.postMessage(
                                JSONObject().put("ok", false).put("requestId", requestId)
                                    .put("error", error.message ?: "Memory request signing failed.").toString()
                            )
                        }
                    }
                    if (isWrite) {
                        AlertDialog.Builder(this)
                            .setTitle("Authorize Jerry memory change?")
                            .setMessage(
                                "Jerry is requesting to " + method + " encrypted memory.\\n\\n" +
                                    "Target: " + targetPath + "\\n\\n" +
                                    "Only approve if you initiated this memory change."
                            )
                            .setNegativeButton("Cancel") { dialog, _ ->
                                dialog.dismiss()
                                replyProxy.postMessage(
                                    JSONObject().put("ok", false).put("requestId", requestId)
                                        .put("error", "Memory request signing was cancelled by the owner.").toString()
                                )
                            }
                            .setPositiveButton("Authorize") { dialog, _ ->
                                dialog.dismiss()
                                signAndReply()
                            }
                            .setOnCancelListener {
                                replyProxy.postMessage(
                                    JSONObject().put("ok", false).put("requestId", requestId)
                                        .put("error", "Memory request signing was cancelled by the owner.").toString()
                                )
                            }
                            .show()
                    } else {
                        signAndReply()
                    }
                    true
                }
                "deleteDeviceSigningKey" -> {
                    deviceSigningKeyStore.deleteKey()
                    replyProxy.postMessage(JSONObject().put("ok", true).put("requestId", requestId).toString())
                    true
                }
                else -> false
            }
        } catch (error: Exception) {
            replyProxy.postMessage(
                JSONObject().put("ok", false).put("requestId", requestId).put(
                    "error",
                    error.message ?: "Native device signing operation failed."
                ).toString()
            )
            true
        }
    }

    private fun dispatchNativeAuthResult(idToken: String) {
        if (!::webView.isInitialized || isFinishing || isDestroyed) return
        val quotedToken = JSONObject.quote(idToken)
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('jerry-native-auth-result',{detail:{idToken:$quotedToken}}))",
                null
            )
        }
    }

    private fun dispatchNativeAuthError() {
        if (!::webView.isInitialized || isFinishing || isDestroyed) return
        webView.post {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('jerry-native-auth-error',{detail:{message:'Google sign-in was cancelled or unavailable.'}}))",
                null
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("localhost")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            // The app loads bundled assets through WebViewAssetLoader; content:// access is unnecessary.
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.safeBrowsingEnabled = true
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    val origin = request.origin
                    val trustedLocalOrigin = origin.scheme == "https" &&
                        origin.host == "localhost" && (origin.port == -1 || origin.port == 443)
                    val audioOnly = request.resources.isNotEmpty() &&
                        request.resources.all { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }

                    if (!trustedLocalOrigin || !audioOnly) {
                        request.deny()
                        return
                    }

                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                        return
                    }

                    pendingAudioPermission?.deny()
                    pendingAudioPermission = request
                    audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }

                override fun onPermissionRequestCanceled(request: PermissionRequest) {
                    if (pendingAudioPermission === request) pendingAudioPermission = null
                }
            }
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: android.webkit.WebResourceRequest
                ) = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: android.webkit.WebResourceRequest
                ): Boolean {
                    val uri = request.url
                    val trustedLocalOrigin = uri.scheme == "https" &&
                        uri.host == "localhost" && (uri.port == -1 || uri.port == 443)
                    if (trustedLocalOrigin) return false
                    if (uri.scheme == "https") {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    }
                    return true
                }
            }
        }

        // WebMessageListener enforces both the trusted origin and main-frame caller.
        // Unlike addJavascriptInterface, it does not expose a callable object to every frame.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
            webView,
            "JerryNativeAuth",
            setOf("https://localhost"),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy
                ) {
                    val trustedOrigin = sourceOrigin.scheme == "https" &&
                        sourceOrigin.host == "localhost" &&
                        (sourceOrigin.port == -1 || sourceOrigin.port == 443)
                    if (!isMainFrame || !trustedOrigin) return
                    val data = message.data ?: return
                    if (data.length > 16 * 1024) {
                        replyProxy.postMessage(
                            JSONObject().put("ok", false).put("error", "Native request is too large.").toString()
                        )
                        return
                    }
                    if (data == "signInWithGoogle") {
                        runOnUiThread { beginNativeGoogleSignIn() }
                    } else {
                        handleNativeDeviceSigningMessage(data, replyProxy)
                    }
                }
            }
            )
        }

        setContentView(webView)
        webView.loadUrl("https://localhost/public/index.html")
    }

    override fun onDestroy() {
        pendingAudioPermission?.deny()
        pendingAudioPermission = null
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
