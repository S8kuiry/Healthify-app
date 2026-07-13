package expo.modules.reminderalarm

import android.app.Activity
import android.content.Intent
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmActivity : Activity() {

    // =========================================================================
    // 🎨 DESIGN CONFIGURATION PANE: Tweak these parameters to match your taste!
    // =========================================================================
    object ThemeConfig {
        // Color Palette
        val BACKGROUND_COLOR = 0xFF0F172A.toInt()      // Screen background color (Deep Slate)
        val BRAND_TEXT_COLOR = 0xFF10B981.toInt()      // "Healthify" brand heading color (Emerald Accent)
        val HEADER_TEXT_COLOR = 0xFF94A3B8.toInt()     // Upper small tracking text
        val CLOCK_TEXT_COLOR = 0xFFF8FAFC.toInt()      // Digital clock text
        val REMAINDER_TEXT_COLOR = 0xFFF1F5F9.toInt()  // Core message text
        val BUTTON_BACKGROUND = 0xFF10B981.toInt()     // Dismiss button fill accent
        val BUTTON_TEXT_COLOR = 0xFFFFFFFF.toInt()     // Dismiss button label font color

        // Typography Sizes (in Floating-Point SP)
        const val BRAND_FONT_SIZE = 24f
        const val HEADER_FONT_SIZE = 12f
        const val CLOCK_FONT_SIZE = 54f
        const val REMINDER_FONT_SIZE = 22f
        const val BUTTON_FONT_SIZE = 16f

        // Shapes and Spacing (in DP)
        const val BRAND_ICON_SIZE_DP = 28             // Width/Height of the branding icon
        const val BUTTON_CORNER_RADIUS_DP = 28        // Higher = rounder pill shape; 0 = square
        const val SCREEN_PADDING_DP = 32              // Margins around the screen borders
    }
    // =========================================================================

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // System Level Flags: Force display execution over secure locks
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        // Sync system status and navigation bar tinting with canvas theme
        window.statusBarColor = ThemeConfig.BACKGROUND_COLOR
        window.navigationBarColor = ThemeConfig.BACKGROUND_COLOR

        // Extract native bundle intent payload data packages
        val label = intent.getStringExtra("REMINDER_LABEL") ?: "Reminder"
        val id = intent.getStringExtra("REMINDER_ID") ?: ""
        val timestamp = intent.getLongExtra("TIMESTAMP", 0L)
        val repeat = intent.getBooleanExtra("REPEAT", false)

        // Unit Converter Utility: DP to Pixels
        val dp = { value: Int -> (value * resources.displayMetrics.density).toInt() }

        // 1. Root Container View
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(ThemeConfig.BACKGROUND_COLOR)
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(ThemeConfig.SCREEN_PADDING_DP), dp(40), dp(ThemeConfig.SCREEN_PADDING_DP), dp(48))
            weightSum = 10f
        }

        // =========================================================================
        // 🚀 NEW: BRANDING HEADER BAR (Horizontal Row: Icon + Healthify Text)
        // =========================================================================
        val brandHeaderBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.2f
            )
        }

        // Programmatic Branding Icon Vector Component
        val brandIcon = ImageView(this).apply {
            // Uses a built-in fallback system alarm resource safely
            setImageResource(android.R.drawable.ic_lock_idle_alarm)
            // Color-filters the asset to match your signature color theme cleanly
            setColorFilter(ThemeConfig.BRAND_TEXT_COLOR, PorterDuff.Mode.SRC_IN)
            
            layoutParams = LinearLayout.LayoutParams(
                dp(ThemeConfig.BRAND_ICON_SIZE_DP), 
                dp(ThemeConfig.BRAND_ICON_SIZE_DP)
            ).apply {
                rightMargin = dp(10) // Creates clear spacing between the icon and text
            }
        }
        brandHeaderBar.addView(brandIcon)

        // "Healthify" Premium Heading Component
        val brandTitle = TextView(this).apply {
            text = "Healthify"
            setTextColor(ThemeConfig.BRAND_TEXT_COLOR)
            textSize = ThemeConfig.BRAND_FONT_SIZE
            typeface = Typeface.create("sans-serif-black", Typeface.BOLD) // Ultra bold modern appearance
        }
        brandHeaderBar.addView(brandTitle)
        rootLayout.addView(brandHeaderBar)
        // =========================================================================

        // 2. Small Context Sub-Header
        val contextHeader = TextView(this).apply {
            text = "ALARM REMINDER"
            setTextColor(ThemeConfig.HEADER_TEXT_COLOR)
            textSize = ThemeConfig.HEADER_FONT_SIZE
            letterSpacing = 0.2f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 0.6f)
        }
        rootLayout.addView(contextHeader)

        // 3. Digital Clock Interface Window Component
        val clockView = TextView(this).apply {
            val timeFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())
            text = timeFormat.format(Date()).lowercase()
            setTextColor(ThemeConfig.CLOCK_TEXT_COLOR)
            textSize = ThemeConfig.CLOCK_FONT_SIZE
            typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 2.2f)
        }
        rootLayout.addView(clockView)

        // 4. Content Block: Central Reminder Text Display Frame
        val middleContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 4f)
        }

        val textLabel = TextView(this).apply {
            text = label
            setTextColor(ThemeConfig.REMAINDER_TEXT_COLOR)
            textSize = ThemeConfig.REMINDER_FONT_SIZE
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.2f)
        }
        middleContainer.addView(textLabel)
        rootLayout.addView(middleContainer)

        // 5. Action Control Button Block
        val actionContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 2f)
        }

        val dismissBtn = Button(this).apply {
            text = "Dismiss"
            textSize = ThemeConfig.BUTTON_FONT_SIZE
            isAllCaps = false
            setTextColor(ThemeConfig.BUTTON_TEXT_COLOR)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setPadding(0, dp(16), 0, dp(16))

            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(ThemeConfig.BUTTON_CORNER_RADIUS_DP).toFloat()
                setColor(ThemeConfig.BUTTON_BACKGROUND)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                elevation = dp(4).toFloat()
            }

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )

            setOnClickListener {
                // Route the stop through the service's own ACTION_DISMISS handler
                // (which calls stopSelf) rather than stopService(). AlarmService
                // returns START_STICKY, so a bare stopService() can be undone by the
                // OS re-delivering the start intent — resurrecting the service and
                // spinning up a fresh looping MediaPlayer, leaving a "dead ring" that
                // outlives this screen.
                val dismissIntent = Intent(this@AlarmActivity, AlarmService::class.java).apply {
                    action = "ACTION_DISMISS"
                }
                startService(dismissIntent)

                // Only DAILY reminders re-arm for the next day. One-off ("Once")
                // reminders must not resurrect themselves — previously every alarm
                // rescheduled on dismiss, so "Once" alarms (and even deleted ones
                // that fired before deletion) kept coming back.
                if (repeat && timestamp > 0L) {
                    val oneDayMs = 24 * 60 * 60 * 1000L
                    AlarmScheduler.schedule(this@AlarmActivity, id, label, timestamp + oneDayMs, repeat = true)
                }
                finish()
            }
        }
        actionContainer.addView(dismissBtn)
        rootLayout.addView(actionContainer)

        setContentView(rootLayout)
    }
}