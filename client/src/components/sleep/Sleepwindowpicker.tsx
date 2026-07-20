import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { getSleepSettings, updateSleepSettings } from '@/domain/screenActivity/sleepSettingsRepo';
import ClockIntervalPicker, { HALF_DAY_MINUTES } from './Clockintervalpicker';

const MINUTES_IN_DAY = 24 * 60;
// Short buffer only to coalesce rapid drags into one write - NOT something the
// user ever waits on. The on-screen value updates instantly (local state), and
// any pending write is flushed immediately if the user leaves the screen (see
// the unmount cleanup), so leaving early can never lose an edit.
const DEBOUNCE_MS = 400;

function formatTime12h(minutesOfDay: number): string {
  // No AM/PM suffix here - the toggle button next to it makes that explicit
  // and unambiguous instead.
  const h24 = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function windowDuration(bed: number, wake: number): number {
  const raw = wake - bed;
  return raw > 0 ? raw : raw + MINUTES_IN_DAY;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface PeriodToggleProps {
  minutesOfDay: number;
  onChange: (minutesOfDay: number) => void;
  accent: string;
  track: string;
  cardBackground: string;
}

/** Simple AM/PM segmented toggle - flips the value between the two 12h
 *  halves while keeping the same position within that half. */
function PeriodToggle({ minutesOfDay, onChange, accent, track, cardBackground }: PeriodToggleProps) {
  const isPM = minutesOfDay >= HALF_DAY_MINUTES;
  const withinHalfDay = minutesOfDay % HALF_DAY_MINUTES;

  const setPeriod = (pm: boolean) => {
    onChange(pm ? withinHalfDay + HALF_DAY_MINUTES : withinHalfDay);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: 999,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: `${track}60`,
      }}
    >
      <Pressable
        onPress={() => setPeriod(false)}
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          backgroundColor: !isPM ? accent : 'transparent',
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: '700', color: !isPM ? cardBackground : track }}>
          AM
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setPeriod(true)}
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          backgroundColor: isPM ? accent : 'transparent',
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: '700', color: isPM ? cardBackground : track }}>
          PM
        </Text>
      </Pressable>
    </View>
  );
}

export default function SleepWindowPicker() {
  const colors = useAppColors();
  const [bedTime, setBedTime] = useState<number | null>(null);
  const [wakeTime, setWakeTime] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values, kept in refs so the debounced save always persists the
  // current on-screen pair rather than whatever either handler captured in its
  // render closure. Without this, dragging one handle would save the OTHER
  // handle's stale value, silently corrupting the stored window.
  const bedTimeRef = useRef<number | null>(null);
  const wakeTimeRef = useRef<number | null>(null);
  bedTimeRef.current = bedTime;
  wakeTimeRef.current = wakeTime;

  // Guards the debounced write so it only ever fires from a real user edit.
  // The initial DB load calls setBedTime/setWakeTime too; without this flag a
  // load could schedule a save and write the window straight back (a no-op at
  // best, a race that clobbers a concurrent edit at worst). It flips to true
  // only inside the change handlers below.
  const hasUserEditedRef = useRef(false);

  // True while an edit has been made but not yet written to the DB. Lets the
  // unmount cleanup know it must flush the pending write instead of dropping it.
  const pendingSaveRef = useRef(false);

  // Persists the current on-screen pair immediately. Reads the LATEST values
  // from refs (not a render closure), so the write is always internally
  // consistent no matter which handle moved last. Clears any queued timer and
  // the pending flag so a subsequent flush can't double-write the same values.
  const flushSave = () => {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = null;
    }
    if (!pendingSaveRef.current) return;
    pendingSaveRef.current = false;

    const bed = bedTimeRef.current;
    const wake = wakeTimeRef.current;
    if (bed === null || wake === null) return;

    updateSleepSettings({
      windowStart: minutesToTime(bed),
      windowEnd: minutesToTime(wake),
    }).catch((err) => console.error('Failed to save sleep settings:', err));
  };

  useEffect(() => {
    let cancelled = false;

    getSleepSettings()
      .then((settings) => {
        if (cancelled) return;
        setBedTime(timeToMinutes(settings.windowStart));
        setWakeTime(timeToMinutes(settings.windowEnd));
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load sleep settings:', err);
        setError('Failed to load sleep settings');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      // Flush (don't discard) any edit the user made right before leaving. The
      // on-screen value already updated instantly; this guarantees it actually
      // reaches the DB even if they navigate away in well under a second. The
      // update runs against the module-level DB singleton, so it completes even
      // after this component has unmounted.
      flushSave();
    };
  }, []);

  // Marks an edit pending and schedules a short-buffered write. Coalesces rapid
  // drags into a single DB write; the buffer is never something the user waits
  // on (UI is already updated, and unmount flushes anything still pending).
  const scheduleSave = () => {
    if (!hasUserEditedRef.current) return;
    pendingSaveRef.current = true;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(flushSave, DEBOUNCE_MS);
  };

  const handleBedChange = (value: number) => {
    hasUserEditedRef.current = true;
    bedTimeRef.current = value;
    setBedTime(value);
    scheduleSave();
  };

  const handleWakeChange = (value: number) => {
    hasUserEditedRef.current = true;
    wakeTimeRef.current = value;
    setWakeTime(value);
    scheduleSave();
  };

  if (isLoading) {
    return (
      <View
        className="bg-cardBackground rounded-2xl p-4 mb-4"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, height: 340 }}
      />
    );
  }

  if (error) {
    return (
      <View
        className="bg-cardBackground rounded-3xl p-6 mb-4 items-center justify-center"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, minHeight: 160 }}
      >
        <View
          className="h-12 w-12 rounded-full items-center justify-center mb-3"
          style={{ backgroundColor: `${colors.accent}18` }}
        >
          <Feather name="alert-circle" size={20} color={colors.accent} />
        </View>
        <Text className="text-textPrimary font-bold text-sm text-center">{error}</Text>
        <Text className="text-textSecondary text-xs text-center mt-2">
          Please try again or contact support if the problem persists.
        </Text>
      </View>
    );
  }

  if (bedTime === null || wakeTime === null) {
    return (
      <View
        className="bg-cardBackground rounded-2xl p-4 mb-4"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, height: 340 }}
      />
    );
  }

  const duration = windowDuration(bedTime, wakeTime);

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2">
          <Feather name="moon" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">Sleep Window</Text>
        </View>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${colors.accent}18` }}>
          <Text className="text-accent font-bold text-[10px]">{formatDuration(duration)}</Text>
        </View>
      </View>

      <ClockIntervalPicker
        bedMinutes={bedTime}
        wakeMinutes={wakeTime}
        onChangeBed={handleBedChange}
        onChangeWake={handleWakeChange}
        accent={colors.accent}
        track={colors.lightBackground}
        cardBackground={'#fffffff9'}
        centerLabel={formatDuration(duration)}
        centerSubLabel="asleep"
      />

      <View className="mt-4 gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: colors.accent }} />
            <Text className="text-textSecondary text-xs font-semibold">
              Bedtime · {formatTime12h(bedTime)}
            </Text>
          </View>
          <PeriodToggle
            minutesOfDay={bedTime}
            onChange={handleBedChange}
            accent={colors.accent}
            track={colors.lightBackground}
            cardBackground={'#fffffff5'}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: 'rgb(253, 249, 249)', borderWidth: 2, borderColor: colors.accent }}
            />
            <Text className="text-textSecondary text-xs font-semibold">
              Wake · {formatTime12h(wakeTime)}
            </Text>
          </View>
          <PeriodToggle
            minutesOfDay={wakeTime}
            onChange={handleWakeChange}
            accent={colors.accent}
            track={colors.lightBackground}
            cardBackground={'#fffffff5'}
          />
        </View>
      </View>
    </View>
  );
}