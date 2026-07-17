import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { getSleepSettings, updateSleepSettings } from '@/domain/screenActivity/sleepSettingsRepo';
import ClockIntervalPicker, { HALF_DAY_MINUTES } from './Clockintervalpicker';

const MINUTES_IN_DAY = 24 * 60;
const DEBOUNCE_MS = 1000;

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
    };
  }, []);

  const debounceSave = (bed: number | null, wake: number | null) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    if (bed !== null && wake !== null) {
      saveTimeout.current = setTimeout(() => {
        updateSleepSettings({
          windowStart: minutesToTime(bed),
          windowEnd: minutesToTime(wake),
        }).catch((err) => console.error('Failed to save sleep settings:', err));
      }, DEBOUNCE_MS);
    }
  };

  const handleBedChange = (value: number) => {
    setBedTime(value);
    debounceSave(value, wakeTime);
  };

  const handleWakeChange = (value: number) => {
    setWakeTime(value);
    debounceSave(bedTime, value);
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