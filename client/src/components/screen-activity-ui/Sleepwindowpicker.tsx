import { useState, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import { getSleepSettings, updateSleepSettings } from '@/domain/screenActivity/sleepSettingsRepo';
import { useAppColors } from '@/hooks/use-app-colors';

const MINUTES_IN_DAY = 24 * 60;
const DEBOUNCE_MS = 1000;

function minutesToHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatDisplayTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Duration of the window in minutes, correctly handling the overnight-crossing case. */
function windowDurationMinutes(bedMinutes: number, wakeMinutes: number): number {
  const raw = wakeMinutes - bedMinutes;
  return raw > 0 ? raw : raw + MINUTES_IN_DAY;
}

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface TimeRowProps {
  icon: 'moon' | 'sunrise';
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  accent: string;
  track: string;
  thumb: string;
}

function TimeRow({ icon, label, minutes, onChange, accent, track, thumb }: TimeRowProps) {
  return (
    <View className="mb-1">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <View
            className="h-7 w-7 rounded-full items-center justify-center"
            style={{ backgroundColor: `${accent}18` }}
          >
            <Feather name={icon} size={13} color={accent} />
          </View>
          <Text className="text-textSecondary text-xs font-semibold tracking-wide">{label}</Text>
        </View>
        <Text className="text-textPrimary font-bold text-base tabular-nums">
          {formatDisplayTime(minutes)}
        </Text>
      </View>
      <Slider
        minimumValue={0}
        maximumValue={MINUTES_IN_DAY - 1}
        step={5}
        value={minutes}
        onValueChange={onChange}
        minimumTrackTintColor={accent}
        maximumTrackTintColor={track}
        thumbTintColor={thumb}
        style={{ height: 32 }}
      />
    </View>
  );
}

export default function SleepWindowPicker() {
  const colors = useAppColors();
  const [bedMinutes, setBedMinutes] = useState<number | null>(null);
  const [wakeMinutes, setWakeMinutes] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    getSleepSettings().then((settings) => {
      setBedMinutes(hhmmToMinutes(settings.windowStart));
      setWakeMinutes(hhmmToMinutes(settings.windowEnd));
    });
  }, []);

  useEffect(() => {
    if (bedMinutes === null || wakeMinutes === null) return;

    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void updateSleepSettings({
        windowStart: minutesToHHmm(bedMinutes),
        windowEnd: minutesToHHmm(wakeMinutes),
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [bedMinutes, wakeMinutes]);

  if (bedMinutes === null || wakeMinutes === null) {
    return (
      <View
        className="bg-cardBackground rounded-2xl p-4 mb-4"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, height: 176 }}
      />
    );
  }

  const duration = windowDurationMinutes(bedMinutes, wakeMinutes);

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4 shadow-lg shadow-black/10"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2">
          <Feather name="moon" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">Sleep Window</Text>
        </View>
        <View
          className="rounded-full px-2.5 py-1"
          style={{ backgroundColor: colors.accentLight ?? `${colors.accent}18` }}
        >
          <Text className="text-accent font-bold text-[11px]">{formatDuration(duration)}</Text>
        </View>
      </View>

      <TimeRow
        icon="moon"
        label="Bedtime"
        minutes={bedMinutes}
        onChange={setBedMinutes}
        accent={colors.accent}
        track={colors.lightBackground }
        thumb={colors.accent}
      />

      <View
        className="my-3"
        style={{ borderTopWidth: 1, borderColor: `${colors.border}15` }}
      />

      <TimeRow
        icon="sunrise"
        label="Wake time"
        minutes={wakeMinutes}
        onChange={setWakeMinutes}
        accent={colors.accent}
        track={colors.lightBackground }
        thumb={colors.accent}
      />
    </View>
  );
}