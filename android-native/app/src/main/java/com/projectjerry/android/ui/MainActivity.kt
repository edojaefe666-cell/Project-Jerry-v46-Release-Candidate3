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
            .addPathHandler("/public/", WebViewAssetLoader.AssetsPathHandler(this))
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
                    if (!isMainFrame || !trustedOrigin || message.data != "signInWithGoogle") return
                    runOnUiThread { beginNativeGoogleSignIn() }
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
