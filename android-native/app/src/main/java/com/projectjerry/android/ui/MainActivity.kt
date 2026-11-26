package com.projectjerry.android.ui

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.projectjerry.android.permissions.JerryPermissionManager

/** Minimal foundation screen. It reports capability/role status; it does not enable call control. */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        root.addView(TextView(this).apply {
            text = "Jerry Android Foundation · Phase 2.12.1\n\nCall answering is NOT active."
            textSize = 20f
        })
        root.addView(TextView(this).apply {
            text = JerryPermissionManager(this@MainActivity).statusSummary()
            textSize = 15f
            setPadding(0, 24, 0, 0)
        })
        setContentView(root)
    }
}
