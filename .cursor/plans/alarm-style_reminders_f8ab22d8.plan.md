---
name: Alarm-style reminders
overview: Implement true alarm-style reminders on Android (ring until dismissed/snoozed with full-screen UI + notification actions) and best-effort burst reminders on iOS using existing scheduler.
todos:
  - id: add-reminder-alarm-module
    content: Create `client/modules/reminder-alarm` Expo module with Android AlarmManager + AlarmActivity + AlarmService + notification actions.
    status: pending
  - id: android-manifest-wiring
    content: Add required permissions/components (SCHEDULE_EXACT_ALARM, USE_FULL_SCREEN_INTENT, WAKE_LOCK) in module manifest and verify merge.
    status: pending
  - id: android-scheduling-switch
    content: Update `client/src/services/reminderScheduler.ts` so Android uses native alarm scheduling; keep iOS on expo-notifications burst.
    status: pending
  - id: ios-burst-defaults
    content: Tune iOS burst defaults (fireCount/interval) and optional per-notification sound.
    status: pending
  - id: tap-and-actions
    content: Wire Dismiss/Snooze actions and ensure notification taps open AlarmActivity/app deep link.
    status: pending
isProject: false
---

## Goals
- Android reminders behave like a Clock alarm: **sound loops until user Dismisses/Snoozes**, with a **full-screen alarm screen** and **notification action buttons**.
- iOS uses **burst notifications** (best possible without Critical Alerts entitlement) and opens the app on tap.

## Key constraints (OS behavior)
- **Android**: persistent ringing requires an Activity/foreground service that plays audio; a normal notification sound cannot loop indefinitely.
- **iOS**: cannot “ring until acknowledged” from background local notifications without Apple Critical Alerts entitlement; best effort is repeated notifications + in-app alarm UI.

## Android implementation (true alarm)
### A) Add a new Expo native module: `client/modules/reminder-alarm/`
Create a dedicated module (keeps step-tracker separate) modeled after `client/modules/step-tracker/`.
- **New files**:
  - `client/modules/reminder-alarm/expo-module.config.json`
  - `client/modules/reminder-alarm/src/index.ts` (JS API: schedule/cancel/snooze, permission checks)
  - `client/modules/reminder-alarm/android/src/main/java/expo/modules/reminderalarm/ReminderAlarmModule.kt` (Expo module bridge)
  - `client/modules/reminder-alarm/android/src/main/java/expo/modules/reminderalarm/AlarmScheduler.kt` (AlarmManager setExactAndAllowWhileIdle)
  - `client/modules/reminder-alarm/android/src/main/java/expo/modules/reminderalarm/AlarmReceiver.kt` (BroadcastReceiver fired by AlarmManager)
  - `client/modules/reminder-alarm/android/src/main/java/expo/modules/reminderalarm/AlarmService.kt` (foreground service that plays looping sound)
  - `client/modules/reminder-alarm/android/src/main/java/expo/modules/reminderalarm/AlarmActivity.kt` (full-screen UI; Dismiss/Snooze)
  - `client/modules/reminder-alarm/android/src/main/java/expo/modules/reminderalarm/AlarmNotification.kt` (high-priority notif + actions)
  - `client/modules/reminder-alarm/android/src/main/res/raw/alarm_tone.mp3` (or `.ogg`) (bundled loud tone)

### B) Wire Android manifest entries
Add to module manifest and ensure it merges into app manifest.
- **Update / add** `client/modules/reminder-alarm/android/src/main/AndroidManifest.xml`:
  - `<uses-permission android:name="android.permission.WAKE_LOCK" />`
  - `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`
  - `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` (already present app-wide, ok)
  - `<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />` (since you chose “request exact”) 
  - `<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />` (for full-screen alarm UI)
  - Declare:
    - `<receiver android:name=".AlarmReceiver" android:exported="false" />`
    - `<service android:name=".AlarmService" android:exported="false" android:foregroundServiceType="mediaPlayback" />`
    - `<activity android:name=".AlarmActivity" android:exported="false" android:showWhenLocked="true" android:turnScreenOn="true" android:excludeFromRecents="true" />`

### C) Alarm channel + audio behavior
- Create a **dedicated channel** `reminders_alarm` with IMPORTANCE_HIGH/MAX.
- Use `AudioAttributes.USAGE_ALARM`.
- Start looping audio in `AlarmService` using `RingtoneManager.getDefaultUri(TYPE_ALARM)` fallback to bundled `raw/alarm_tone`.
- Stop audio only on:
  - notification action **Dismiss**
  - notification action **Snooze (5/10/15)**
  - tapping the full-screen UI buttons

### D) Scheduling model (matches your DB)
You currently persist reminder times in SQLite and schedule via `expo-notifications` in:
- `client/src/services/reminderScheduler.ts`
- called from `client/src/db/reminderRepo.ts`

Replace Android scheduling path only:
- **Update** `client/src/services/reminderScheduler.ts`
  - Keep existing iOS scheduling via `expo-notifications`.
  - On Android, call the new module (`reminder-alarm`) to schedule exact alarms per reminder fire.
  - Store returned “alarm ids” (or requestCodes) in `notification_ids` field (rename later if desired; for now keep schema stable).

### E) Tap behavior + deep links
- Full-screen activity will open by itself at alarm time.
- Notification tap should also open `AlarmActivity` (content intent), and `AlarmActivity` can optionally deep-link into the app’s reminders screen using existing schemes in `client/android/app/src/main/AndroidManifest.xml` (schemes `client` and `exp+healthify`).

## iOS plan (best effort burst)
Use existing burst scheduling already supported by:
- `fireCount`, `fireIntervalSeconds`, `repeatBurstDaily` in `client/src/services/reminderScheduler.ts`

Enhancements:
- Ensure `ensureReminderChannel()` remains Android-only; for iOS you can set `sound` per notification content.
- Configure default burst for iOS (e.g., 3–5 fires at 30–60s intervals) if user hasn’t set it.
- Add a tap handler in app root later to navigate to reminders/alarm screen when user taps (optional follow-up).

## Files to change (existing)
- `client/src/services/reminderScheduler.ts` (split scheduling: Android->native alarm module, iOS->expo-notifications)
- `client/src/db/reminderRepo.ts` (no schema change required; continues storing ids)
- `client/src/context/reminderContext.tsx` (keep; it already calls `ensureReminderChannel()` and `rescheduleAllReminders()`)

## Test plan
- Android:
  - Schedule a reminder 1–2 minutes ahead.
  - Verify full-screen alarm shows and **sound loops** until Dismiss/Snooze.
  - Verify snooze schedules + re-rings after 5/10/15.
  - Verify reboot/app kill behavior (AlarmManager + receiver) as needed.
- iOS:
  - Schedule reminder with burst; verify multiple notifications arrive if not acknowledged.
  - Verify tap opens app; (navigation enhancement can be added next).
