package expo.modules.reminderalarm

import android.app.*
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.Vibrator
import android.os.VibratorManager
import android.os.VibrationEffect
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File

private const val NOTIFICATION_ID = 4242
private const val CHANNEL_ID = "reminders_alarm"

class AlarmService : Service() {
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    // Audio-routing state we override while ringing and must restore afterwards,
    // so the alarm is always heard from the phone speaker even when Bluetooth
    // earbuds are connected (like an incoming phone call).
    private var audioManager: AudioManager? = null
    private var previousSpeakerphoneOn: Boolean = false

    // Original STREAM_ALARM level, captured so we can raise the alarm stream to be
    // audible while ringing and then restore the user's setting in onDestroy.
    // -1 means "we never changed it" (nothing to restore).
    private var previousAlarmStreamVolume: Int = -1

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getStringExtra("REMINDER_ID") ?: "0"
        val label = intent?.getStringExtra("REMINDER_LABEL") ?: "Health Reminder"
        val timestamp = intent?.getLongExtra("TIMESTAMP", 0L) ?: 0L
        val repeat = intent?.getBooleanExtra("REPEAT", false) ?: false

        if (intent?.action == "ACTION_DISMISS") {
            // Tear down ringing immediately, then drop the foreground notification
            // and stop. We stop the player here (rather than relying solely on
            // onDestroy) so the sound dies the instant Dismiss is pressed, and we
            // clear the foreground state so the OS can't keep the sticky service
            // alive with a lingering notification.
            stopRinging()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            stopSelf()
            return START_NOT_STICKY
        }

        createNotificationChannel()

        // Setup notification action triggers
        val dismissIntent = Intent(this, AlarmService::class.java).apply { action = "ACTION_DISMISS" }
        val dismissPending = PendingIntent.getService(this, id.hashCode(), dismissIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        // Full-screen intent — the reliable way to pop the alarm UI from the background /
        // lock screen. A direct startActivity() from a background receiver is blocked on
        // Android 10+, so we hand the launch to the OS instead. It honours it because the
        // channel is IMPORTANCE_HIGH and we hold the USE_FULL_SCREEN_INTENT permission.
        val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
            putExtra("REMINDER_ID", id)
            putExtra("REMINDER_LABEL", label)
            putExtra("TIMESTAMP", timestamp)
            putExtra("REPEAT", repeat)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val fullScreenPending = PendingIntent.getActivity(
            this,
            id.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Health Notification")
            .setContentText(label)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPending, true)
            .setContentIntent(fullScreenPending)
            .setOngoing(true)
            .setAutoCancel(false)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", dismissPending)
            .build()

        startForeground(NOTIFICATION_ID, notification)

        // Play Looping Audio Stream.
        // The user's chosen tone + volume live in the app's SQLite DB (written
        // by the JS settings screen). Read them here; fall back to the system
        // default alarm sound / full volume if nothing is set or the read fails.
        val savedUri = readSavedAlarmUri()
        val alarmUri = savedUri
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        val savedVolumePercent = readSavedAlarmVolume().coerceIn(0, 100)

        // Single source of truth for loudness: the user's saved slider value drives
        // the system ALARM stream, and the MediaPlayer plays at full scale *within*
        // that stream (see setVolume(1f, 1f) below). We deliberately do NOT also
        // attenuate the MediaPlayer by the same percent — doing both multiplies the
        // two together (e.g. 70% × 70% ≈ 49%), which made the alarm quieter than the
        // slider promised. STREAM_ALARM is captured and restored in onDestroy so we
        // don't permanently change the user's system alarm volume.
        //
        // An active alarm is never silent: even 0% floors to the lowest audible step
        // (see applyAlarmStreamVolume). Muting a reminder is done by deactivating its
        // card, not by dragging the volume to zero.
        applyAlarmStreamVolume(savedVolumePercent)

        // Force the tone onto the phone speaker (in addition to any connected
        // Bluetooth device) so the alarm is never trapped in idle earbuds.
        forceSpeakerRouting()

        mediaPlayer = MediaPlayer().apply {
            setDataSource(this@AlarmService, alarmUri)
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            // Full scale within STREAM_ALARM — the stream level (set from the user's
            // slider in applyAlarmStreamVolume) is the sole loudness control.
            setVolume(1f, 1f)
            isLooping = true
            // API 31+: pin output to the built-in speaker so the alarm is heard
            // in the room even with Bluetooth earbuds connected/idle.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builtInSpeaker()?.let { setPreferredDevice(it) }
            }
            prepare()
            start()
        }

        // Handle Device Physical Haptics — only if the user has vibration on.
        if (readVibrateEnabled()) {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }

            val pattern = longArrayOf(0, 500, 500)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        }

        return START_STICKY
    }

    /**
     * Opens the app's expo-sqlite database read-only and returns the saved
     * alarm tone URI, or null if none is set. expo-sqlite stores the DB at
     * `filesDir/SQLite/healthapp.db` and runs in WAL mode; opening it with the
     * platform SQLiteDatabase sees committed writes (including those still in
     * the -wal file). Any failure returns null so the caller uses the default.
     */
    private fun readSavedAlarmUri(): Uri? {
        var db: SQLiteDatabase? = null
        return try {
            val dbFile = File(filesDir, "SQLite/healthapp.db")
            if (!dbFile.exists()) return null
            db = SQLiteDatabase.openDatabase(
                dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY
            )
            db.rawQuery("SELECT sound_uri FROM reminder_sound WHERE id = 1;", null).use { c ->
                if (c.moveToFirst() && !c.isNull(0)) {
                    val uriString = c.getString(0)
                    if (!uriString.isNullOrBlank()) Uri.parse(uriString) else null
                } else null
            }
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not read saved alarm URI, using default", e)
            null
        } finally {
            db?.close()
        }
    }

    /**
     * Make the alarm audible from the built-in speaker even when Bluetooth
     * earbuds are connected. By default an ALARM stream routes ONLY to a
     * connected BT device, so if the buds are idle/in the case the user only
     * feels the vibration. We pin the alarm's preferred output to the built-in
     * speaker so it always plays in the room, like a phone-call ring.
     *
     * NOTE: On API 31+ this is set per-MediaPlayer via setPreferredDevice()
     * (see below); this pre-31 fallback flips speakerphone globally and is
     * restored in onDestroy.
     */
    private fun forceSpeakerRouting() {
        // API 31+ uses setPreferredDevice() on the MediaPlayer instead — nothing
        // global to change here, so this only handles the legacy path.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
        try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager = am
            @Suppress("DEPRECATION")
            previousSpeakerphoneOn = am.isSpeakerphoneOn
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = true
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not force speaker routing", e)
        }
    }

    /**
     * Set STREAM_ALARM to the user's chosen 0–100 level — the single source of truth
     * for how loud the alarm plays (the MediaPlayer itself runs at full scale within
     * this stream). Captures the previous level first so restoreAlarmStreamVolume()
     * can put it back in onDestroy.
     *
     * An active alarm is never silent: even 0% floors to the lowest audible step (1),
     * so the tone is always heard. Muting a reminder is done by deactivating its card,
     * not by dragging the slider to zero.
     */
    private fun applyAlarmStreamVolume(volumePercent: Int) {
        try {
            val am = audioManager ?: (getSystemService(Context.AUDIO_SERVICE) as AudioManager).also {
                audioManager = it
            }
            val maxVolume = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            // Floor to 1 so even 0% stays audible — an active alarm is never silent.
            val target = Math.max(1, Math.round(maxVolume * (volumePercent / 100f)))

            previousAlarmStreamVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
            if (target != previousAlarmStreamVolume) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0)
            }
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not set alarm stream volume", e)
        }
    }

    /** Restore STREAM_ALARM to the level captured in applyAlarmStreamVolume(). */
    private fun restoreAlarmStreamVolume() {
        val am = audioManager ?: return
        if (previousAlarmStreamVolume < 0) return
        try {
            am.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmStreamVolume, 0)
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not restore alarm stream volume", e)
        } finally {
            previousAlarmStreamVolume = -1
        }
    }

    /** Built-in speaker device, or null — used to pin MediaPlayer output on API 31+. */
    private fun builtInSpeaker(): android.media.AudioDeviceInfo? {
        return try {
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull {
                it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
            }
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not find built-in speaker", e)
            null
        }
    }

    /** Undo the routing overrides applied by forceSpeakerRouting() (pre-31 only). */
    private fun restoreAudioRouting() {
        val am = audioManager ?: return
        try {
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = previousSpeakerphoneOn
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not restore audio routing", e)
        } finally {
            audioManager = null
        }
    }

    /** Whether the user has vibration enabled; defaults to true on any failure. */
    private fun readVibrateEnabled(): Boolean {
        var db: SQLiteDatabase? = null
        return try {
            val dbFile = File(filesDir, "SQLite/healthapp.db")
            if (!dbFile.exists()) return true
            db = SQLiteDatabase.openDatabase(
                dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY
            )
            db.rawQuery("SELECT vibrate FROM reminder_sound WHERE id = 1;", null).use { c ->
                // Default ON: only an explicitly-stored 0 disables vibration.
                if (c.moveToFirst() && !c.isNull(0)) c.getInt(0) != 0 else true
            }
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not read vibrate flag, defaulting on", e)
            true
        } finally {
            db?.close()
        }
    }

    /** Saved alarm volume (0–100); defaults to full (100) on any failure. */
    private fun readSavedAlarmVolume(): Int {
        var db: SQLiteDatabase? = null
        return try {
            val dbFile = File(filesDir, "SQLite/healthapp.db")
            if (!dbFile.exists()) return 100
            db = SQLiteDatabase.openDatabase(
                dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY
            )
            db.rawQuery("SELECT volume FROM reminder_volume WHERE id = 1;", null).use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getInt(0) else 100
            }
        } catch (e: Exception) {
            Log.w("AlarmService", "Could not read saved alarm volume, using full", e)
            100
        } finally {
            db?.close()
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Critical Reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Rings indefinitely until addressed."
                setSound(null, null) // Bypassed manually through core player loop
                enableVibration(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    /**
     * Stop the tone + vibration and restore audio routing. Idempotent — safe to
     * call from both the ACTION_DISMISS path and onDestroy without double-stopping,
     * because the player/vibrator refs are nulled out once torn down.
     */
    private fun stopRinging() {
        mediaPlayer?.let {
            try {
                if (it.isPlaying) it.stop()
            } catch (e: Exception) {
                Log.w("AlarmService", "Error stopping media player", e)
            }
            it.release()
        }
        mediaPlayer = null

        vibrator?.cancel()
        vibrator = null

        // Restore the alarm stream BEFORE restoreAudioRouting(), which clears the
        // cached AudioManager reference.
        restoreAlarmStreamVolume()
        restoreAudioRouting()
    }

    override fun onDestroy() {
        stopRinging()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}