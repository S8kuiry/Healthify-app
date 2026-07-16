import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import { Feather } from '@expo/vector-icons';
import ScreenContainer from '@/components/ScreenContainer';
import { useAppColors } from '@/hooks/use-app-colors';
import { getSleepSettings, updateSleepSettings } from '@/domain/screenActivity/sleepSettingsRepo';
import { getSleepForNight, getWeeklySleep, type NightlySleep } from '@/domain/screenActivity/sleepCalculator';
import { getDb } from '@/db/client';

const MINUTES_IN_DAY = 24 * 60;
const DEBOUNCE_MS = 1000;
const DATA_RETENTION_DAYS = 8;

function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
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

async function cleanupOldData(): Promise<void> {
  try {
    const db = await getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DATA_RETENTION_DAYS);
    const cutoffIso = cutoffDate.toISOString();
    await db.runAsync(`DELETE FROM screen_sessions WHERE end_time < ?`, [cutoffIso]);
  } catch (err) {
    console.error('Failed to cleanup old sleep data:', err);
  }
}

export default function SleepScreen() {
  const colors = useAppColors();
  const [bedTime, setBedTime] = useState<number | null>(null);
  const [wakeTime, setWakeTime] = useState<number | null>(null);
  const [lastNightMinutes, setLastNightMinutes] = useState<number | null>(null);
  const [weeklyData, setWeeklyData] = useState<NightlySleep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasTrackedData, setHasTrackedData] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        await cleanupOldData();

        const settings = await getSleepSettings();
        setBedTime(timeToMinutes(settings.windowStart));
        setWakeTime(timeToMinutes(settings.windowEnd));

        const lastNight = await getSleepForNight(yesterdayDate());
        const weekly = await getWeeklySleep();

        if (lastNight.durationMinutes !== null) {
          setLastNightMinutes(lastNight.durationMinutes);
          setHasTrackedData(true);
        }

        const hasWeeklyData = weekly.some(w => w.durationMinutes !== null);
        if (hasWeeklyData) {
          setWeeklyData(weekly);
          setHasTrackedData(true);
        }
      } catch (err) {
        console.error('Failed to load sleep data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleBedTimeChange = (value: number) => {
    setBedTime(value);
    debounceSave(value, wakeTime);
  };

  const handleWakeTimeChange = (value: number) => {
    setWakeTime(value);
    debounceSave(bedTime, value);
  };

  const debounceSave = (bed: number | null, wake: number | null) => {
    if (saveTimeout) clearTimeout(saveTimeout);
    if (bed !== null && wake !== null) {
      const timeout = setTimeout(() => {
        updateSleepSettings({
          windowStart: minutesToTime(bed),
          windowEnd: minutesToTime(wake),
        }).catch(err => console.error('Failed to save sleep settings:', err));
      }, DEBOUNCE_MS);
      setSaveTimeout(timeout);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </ScreenContainer>
    );
  }

  const duration = bedTime !== null && wakeTime !== null ? windowDuration(bedTime, wakeTime) : 0;
  const weeklyWithData = weeklyData.filter(w => w.durationMinutes !== null);
  const maxWeekly = weeklyWithData.length > 0
    ? Math.max(...weeklyWithData.map(d => d.durationMinutes!), 60)
    : 480;

  return (
    <ScreenContainer>
      <ScrollView style={{ paddingBottom: 20, flex: 1 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 mt-2">
          <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">Sleep</Text>
          <Text className="text-textSecondary text-xs font-medium mt-0.5">
            Track your sleep schedule and habits
          </Text>
        </View>

        {bedTime !== null && wakeTime !== null && (
          <>
            <View
              className="bg-cardBackground rounded-2xl p-4 mb-4"
              style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
            >
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center gap-2">
                  <Feather name="moon" size={15} color={colors.accent} />
                  <Text className="text-textPrimary font-bold text-sm tracking-tight">Sleep Window</Text>
                </View>
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{ backgroundColor: `${colors.accent}18` }}
                >
                  <Text className="text-accent font-bold text-[10px]">{formatDuration(duration)}</Text>
                </View>
              </View>

              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-7 w-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: `${colors.accent}18` }}
                    >
                      <Feather name="moon" size={13} color={colors.accent} />
                    </View>
                    <Text className="text-textSecondary text-xs font-semibold">Bedtime</Text>
                  </View>
                  <Text className="text-textPrimary font-bold text-base tabular-nums">
                    {formatTime(bedTime)}
                  </Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={MINUTES_IN_DAY - 1}
                  step={5}
                  value={bedTime}
                  onValueChange={handleBedTimeChange}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.lightBackground}
                  thumbTintColor={colors.accent}
                  style={{ height: 32 }}
                />
              </View>

              <View style={{ borderTopWidth: 1, borderColor: `${colors.border}15`, marginVertical: 12 }} />

              <View>
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="h-7 w-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: `${colors.accent}18` }}
                    >
                      <Feather name="sunrise" size={13} color={colors.accent} />
                    </View>
                    <Text className="text-textSecondary text-xs font-semibold">Wake Time</Text>
                  </View>
                  <Text className="text-textPrimary font-bold text-base tabular-nums">
                    {formatTime(wakeTime)}
                  </Text>
                </View>
                <Slider
                  minimumValue={0}
                  maximumValue={MINUTES_IN_DAY - 1}
                  step={5}
                  value={wakeTime}
                  onValueChange={handleWakeTimeChange}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.lightBackground}
                  thumbTintColor={colors.accent}
                  style={{ height: 32 }}
                />
              </View>
            </View>

            {!hasTrackedData && (
              <View
                className="bg-cardBackground rounded-3xl p-6 mb-4 items-center justify-center"
                style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, minHeight: 160 }}
              >
                <View
                  className="h-12 w-12 rounded-full items-center justify-center mb-3"
                  style={{ backgroundColor: `${colors.accent}18` }}
                >
                  <Feather name="moon" size={20} color={colors.accent} />
                </View>
                <Text className="text-textPrimary font-bold text-sm text-center">
                  No sleep data yet
                </Text>
                <Text className="text-textSecondary text-xs text-center mt-2">
                  Sleep tracking starts automatically. Check back tomorrow for your first data point.
                </Text>
              </View>
            )}

            {lastNightMinutes !== null && (
              <View
                className="bg-cardBackground rounded-2xl p-4 mb-4"
                style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2">
                    <Feather name="moon" size={15} color={colors.accent} />
                    <Text className="text-textPrimary font-bold text-sm tracking-tight">Last Night</Text>
                  </View>
                  <Text className="text-textMuted text-[11px] font-semibold">{yesterdayLabel()}</Text>
                </View>
                <View className="items-center py-4">
                  <Text className="text-textPrimary font-bold text-2xl tabular-nums">
                    {formatDuration(lastNightMinutes)}
                  </Text>
                  <Text className="text-textSecondary text-xs font-semibold mt-1">of sleep detected</Text>
                </View>
              </View>
            )}

            {weeklyWithData.length > 0 && (
              <View
                className="bg-cardBackground rounded-2xl p-4 mb-4 h-[254px] "
                style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
              >
                <View className="flex-row items-center justify-between mb-6">
                  <View className="flex-row items-center gap-2">
                    <Feather name="bar-chart-2" size={15} color={colors.accent} />
                    <Text className="text-textPrimary font-bold text-sm tracking-tight">This Week</Text>
                  </View>
                </View>
                <View className="flex-row items-end justify-between" style={{ height: 150 }}>
                  {weeklyData.map((night, idx) => (
                    <View key={idx} className="items-center flex-1">
                      <View style={{ height: 96, justifyContent: 'flex-end' }}>
                        <View
                          style={{
                            width: 17,
                            height: night.durationMinutes
                              ? Math.max(6, Math.round((night.durationMinutes / maxWeekly) * 96))
                              : 6,
                            borderRadius: 6,
                            backgroundColor: night.durationMinutes ? colors.accent : 'transparent',
                            borderWidth: night.durationMinutes ? 0 : 1.5,
                            borderStyle: 'dashed',
                            borderColor: night.durationMinutes ? undefined : `${colors.border}60`,
                          }}
                        />
                      </View>
                      <Text className="text-textMuted text-[9px] font-semibold mt-2">
                        {dayLabel(night.nightDate)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
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

function yesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function yesterdayLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'narrow' });
}