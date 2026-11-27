package com.projectjerry.android.ui

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivitySmokeTest {
    @Test
    fun bundledJerryUiRendersOnAndroidApi29() {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        val rendered = StringBuilder()
        val completed = CountDownLatch(1)
        val handler = Handler(Looper.getMainLooper())
        var probe: Runnable? = null

        try {
            scenario.onActivity { activity ->
                val content = activity.findViewById<ViewGroup>(android.R.id.content)
                val webView = content.getChildAt(0) as? WebView
                assertNotNull("Jerry must host its bundled UI in a WebView", webView)

                val deadline = SystemClock.uptimeMillis() + 15_000
                probe = object : Runnable {
                    override fun run() {
                        webView?.evaluateJavascript(
                            "document.body ? document.body.innerText : ''"
                        ) { value ->
                            if (value != null && value.contains("JERRY")) {
                                rendered.append(value)
                                completed.countDown()
                            } else if (SystemClock.uptimeMillis() < deadline) {
                                handler.postDelayed(this, 200)
                            } else {
                                completed.countDown()
                            }
                        }
                    }
                }
                handler.post(probe!!)
            }

            assertTrue(
                "Jerry's bundled React UI did not render within 15 seconds",
                completed.await(20, TimeUnit.SECONDS),
            )
            assertTrue(
                "The owner sign-in shell was not rendered: $rendered",
                rendered.contains("JERRY"),
            )
        } finally {
            probe?.let { handler.removeCallbacks(it) }
            scenario.close()
        }
    }
}
