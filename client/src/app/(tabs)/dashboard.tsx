import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, AppState, Platform, Pressable } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import Svg, { Circle } from 'react-native-svg';

import {
  getTodaySteps,
  getTodayStepsRaw,
  hasStepSensor,
  requestStepPermission,
} from '../../../modules/step-tracker/src';
import { activeCalories } from '@/domain/calorie';
import { useProfile } from '@/context/profileContext';
import ActivityGoalModal from '@/components/ActivityGoalModal';
import { hasAnyGoal, hasStepGoal, primaryProgress } from '@/domain/goal';
import { getWeekActivity, type DailyActivity, upsertDailyActivity } from '@/db/dailyActivityRepo';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import {
  getCurrentWeekRange,
  getWeekDayStrings,
  toLocalDateString,
} from '@/domain/date';
import TelemetryProgressRing from '@/components/TelemetryProgressRing';

const STEP_POLL_MS = 2000;

export default function DashboardScreen() {

  const { profile, updateGoals, clearStepGoal, clearCalorieGoal } = useProfile();
  const [steps, setSteps] = useState<number | null>(null);
  const [sensorMissing, setSensorMissing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [modalMode, setModalMode] = useState<'initial' | 'steps' | 'calories' | null>(null);
  const [weekData, setWeekData] = useState<DailyActivity[]>([]);


  const openGoalModal = useCallback((mode: 'initial' | 'steps' | 'calories') => {
    setModalMode(mode);
  }, []);

  const closeGoalModal = useCallback(() => {
    setModalMode(null);
  }, []);



  // data writer function
  // 1. Clean, isolated data writer function
  const saveTodayToDisk = useCallback(async () => {
    // Read directly from the native module source to avoid stale state closures
    const liveSteps = getTodaySteps();
    if (!profile || liveSteps === null || liveSteps === 0) return;

    const liveCalories = activeCalories(liveSteps, profile) ?? 0;
    const todayStr = toLocalDateString();

    // Commit current tracking values straight into SQLite
    await upsertDailyActivity(
      todayStr,
      liveSteps,
      liveCalories,
      profile.stepGoal,
      profile.calorieGoal
    );

    // Refresh the weekly database state to immediately mirror changes in your chart
    const { start, end } = getCurrentWeekRange();
    const rows = await getWeekActivity(start, end);
    setWeekData(rows);
  }, [profile]);



  // steps activity
  const refreshSteps = useCallback(() => {
    const raw = getTodayStepsRaw();
    setSensorMissing(raw === -1 && !hasStepSensor());
    setSteps(getTodaySteps());
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    async function init() {
      if (Platform.OS === 'android') {
        const granted = await requestStepPermission();
        setPermissionDenied(!granted);
      }
      refreshSteps();
      interval = setInterval(refreshSteps, STEP_POLL_MS);
    }

    init();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (Platform.OS === 'android') {
          requestStepPermission().then((granted) => {
            setPermissionDenied(!granted);
            refreshSteps();
          });
        } else {
          refreshSteps();
        }
      }
    });

    return () => {
      if (interval) clearInterval(interval);
      subscription.remove();
    };
  }, [refreshSteps]);



  const calories = profile && steps !== null
    ? activeCalories(steps, profile)
    : null;


  // useeffect that saves the daily metrics 
  // 2. Separate background and periodic sync lifecycle engine
  useEffect(() => {
    if (!profile) return;

    // Run an initial disk save when the dashboard mounts
    saveTodayToDisk();

    // Automatically sync live numbers to SQLite every 15 seconds
    const diskSyncInterval = setInterval(() => {
      saveTodayToDisk();
    }, 15000);

    // Fallback: Commit to SQLite the exact moment the user minimizes the app
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        saveTodayToDisk();
      }
    });

    return () => {
      clearInterval(diskSyncInterval);
      subscription.remove();
    };
  }, [profile, saveTodayToDisk]);






  // week activity
  const refreshWeekData = useCallback(async () => {
    const { start, end } = getCurrentWeekRange();
    const rows = await getWeekActivity(start, end);
    setWeekData(rows);
  }, []);

  useEffect(() => {
    refreshWeekData();
  }, [refreshWeekData]);

  const weekChartData = (() => {
    const { start } = getCurrentWeekRange();
    const today = toLocalDateString();
    const byDate = new Map(weekData.map((r) => [r.date, r]));

    const days: { date: string; steps: number; calories: number }[] = [];
    for (const dateStr of getWeekDayStrings(start)) {
      const row = byDate.get(dateStr);
      let dSteps = row?.steps ?? 0;
      let dCalories = row?.calories ?? 0;

      if (dateStr === today && steps !== null && profile) {
        dSteps = steps;
        dCalories = calories ?? 0;
      }

      days.push({ date: dateStr, steps: dSteps, calories: dCalories });
    }
    return days;
  })();









  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ paddingHorizontal: 4 }}>

          {permissionDenied && (
            <View className="bg-danger/10 rounded-2xl px-4 py-3 mb-4">
              <Text className="text-danger text-xs font-semibold text-center">
                Physical activity permission is required to count steps. Enable it in app settings.
              </Text>
            </View>
          )}

          {sensorMissing && !permissionDenied && (
            <View className="bg-danger/10 rounded-2xl px-4 py-3 mb-4">
              <Text className="text-danger text-xs font-semibold text-center">
                Step sensor not detected on this device — steps won't be tracked automatically.
              </Text>
            </View>
          )}

          {/* Header Section */}
          <View className="mb-6 mt-2">
            <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">Today</Text>
            <Text className="text-textSecondary text-xs font-medium mt-0.5">
              Your step & calorie activity matrix
            </Text>
          </View>


          {/* Activity Matrix Card */}
          {/* Unified Activity Card */}
          <View className="bg-cardBackground rounded-3xl p-5 mb-5 px-8">

            {/* <View className="flex-row items-center justify-between mb-4">
              <Text className="text-textMuted text-[9px] font-bold tracking-[2px] uppercase">Live Telemetry</Text>
              <View className="flex-row items-center">
                <View className="h-1.5 w-1.5 rounded-full bg-accent mr-1.5" />
                <Text className="text-accent text-[9px] font-bold tracking-widest uppercase">Active</Text>
              </View>
            </View> */}

            <View className="flex-row items-stretch justify-between w-full">

              {/* Steps Column */}
              <View className="flex-1 items-start">
                <View className="flex-row items-center mb-1">
                  <View className="h-2 w-[2px] bg-accent mr-1.5" />
                  <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase">Steps</Text>
                </View>

                <View className="flex-row items-baseline mt-1">
                  <Text
                    className="text-textPrimary text-xl font-black tracking-tight"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {steps !== null ? steps.toLocaleString() : '—'}
                  </Text>
                  <Text className="text-textSecondary text-sm font-bold ml-2 ">steps</Text>
                </View>

                <View className="h-1 w-20 bg-backgroundElement/50 rounded-full mt-2.5 overflow-hidden">
                  <View
                    className="h-1 bg-accent rounded-full"
                    style={{
                      width: profile && profile?.stepGoal > 0 && steps !== null
                        ? `${Math.min(100, (steps / profile.stepGoal) * 100)}%`
                        : '0%',
                    }}
                  />
                </View>

                <Pressable
                  onPress={() => openGoalModal('steps')}
                  className="rounded-full flex-1  py-1 mt-3 items-center justify-center active:opacity-60"
                  style={{
                    minWidth: 92,
                    backgroundColor: profile && profile?.stepGoal > 0 ? 'transparent' : undefined,
                  }}
                >
                  {profile && profile.stepGoal > 0 ? (
                    <View className="border border-dashed border-accent  bg-backgroundElement flex-row items-center justify-center gap-1 rounded-3xl px-3 py-1   items-center" style={{ minWidth: 92 }}>


                      <Text className="text-textPrimary text-xs font-bold tracking-wide" style={{ fontVariant: ['tabular-nums'] }}>
                        GOAL :
                      </Text>
                      <Text className="text-accent text-xs font-bold tracking-wide" style={{ fontVariant: ['tabular-nums'] }}>
                        {profile.stepGoal.toLocaleString()}
                      </Text>
                      <Text className="text-accent text-xs font-bold tracking-wide " style={{ fontVariant: ['tabular-nums'] }}>
                        steps

                      </Text>


                    </View>
                  ) : (
                    <View className="bg-accent rounded-full px-3 py-1 items-center" style={{ minWidth: 92 }}>
                      <Text className="text-background text-[9px] font-black tracking-wide uppercase">Set Steps</Text>
                    </View>
                  )}
                </Pressable>
              </View>


              {/* Divider with technical node */}
              <View className="items-center justify-center px-1">
                <View className="w-[1px] flex-1 bg-accent" />
                <View className="h-1.5 w-1.5 rounded-full bg-accent my-1" />
                <View className="w-[1px] flex-1 bg-accent" />
              </View>


              {/* Calories Column */}
              <View className="flex-1 items-end">
                <View className="flex-row items-center mb-1">
                  <View className="h-2 w-[2px] bg-accent mr-1.5" />
                  <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase">Energy</Text>
                </View>

                <View className="flex-row items-baseline mt-1">
                  <Text
                    className="text-textPrimary text-xl font-black tracking-tight"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {calories !== null ? calories.toLocaleString() : '—'}
                  </Text>
                  <Text className="text-textSecondary text-sm font-bold ml-2 ">kcal</Text>
                </View>

                <View className="h-1 w-20 bg-backgroundElement rounded-full mt-2.5 overflow-hidden">
                  <View
                    className="h-1 bg-accent rounded-full"
                    style={{
                      width: profile && profile?.calorieGoal > 0 && calories !== null
                        ? `${Math.min(100, (calories / profile.calorieGoal) * 100)}%`
                        : '0%',
                    }}
                  />
                </View>

                <Pressable
                  style={{ minWidth: 92 }}
                  onPress={() => openGoalModal('calories')}
                  className="rounded-full flex-1  py-1 mt-3 items-center justify-center active:opacity-60"
                >
                  {profile && profile.calorieGoal > 0 ? (
                    <View className="border border-dashed border-accent  bg-backgroundElement flex-row items-center justify-center gap-1 rounded-3xl px-2 py-1   items-center" style={{ width: 110 }}>


                      <Text className="text-textPrimary text-xs font-bold tracking-wide" style={{ fontVariant: ['tabular-nums'] }}>
                        GOAL :
                      </Text>
                      <Text className="text-accent text-xs font-bold tracking-wide" style={{ fontVariant: ['tabular-nums'] }}>
                        {profile.calorieGoal.toLocaleString()}
                      </Text>
                      <Text className="text-accent text-xs font-bold tracking-wide " style={{ fontVariant: ['tabular-nums'] }}>
                        Kcal

                      </Text>


                    </View>
                  ) : (
                    <View className="bg-accent rounded-full px-3 py-1 items-center" style={{ minWidth: 92 }}>
                      <Text className="text-background text-[9px] font-black tracking-wide uppercase">Set Kcal</Text>
                    </View>
                  )}
                </Pressable>
              </View>

            </View>
          </View>



          {/* Native Module Preview Section */}
          {/* Telemetry Ring Section
          <View className="bg-cardBackground rounded-[28px] p-5 shadow-sm items-center justify-center min-h-[160px] mb-5">
            {profile && hasAnyGoal(profile) && steps !== null ? (
              (() => {
                const progress = primaryProgress(steps, profile);
                const pct = Math.round(progress * 100);
                const size = 96;
                const strokeWidth = 8;
                const radius = (size - strokeWidth) / 2;
                const circumference = 2 * Math.PI * radius;
                const dashOffset = circumference * (1 - progress);

                return (
                  <>
                    <View style={{ width: size, height: size }} className="items-center justify-center mb-3">
                      <Svg width={size} height={size}>
                        <Circle
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          stroke={`${pct > 0 ? 'rgba(166, 189, 167, 0.85)' : 'rgba(191, 194, 191, 0.81)'}`}
                          strokeWidth={strokeWidth}
                          fill="transparent"
                        />
                        <Circle
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          stroke="#7CF26B"
                          strokeWidth={strokeWidth}
                          fill={`${pct > 0 ? 'transparent' : 'rgb(235, 241, 237)'}`}
                          strokeDasharray={`${circumference} ${circumference}`}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"

                        />
                      </Svg>
                      <View className="absolute items-center justify-center">
                        <Text
                          className="text-textPrimary text-lg font-black tracking-tight"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {pct}%
                        </Text>
                      </View>
                    </View>

                    <Text className="text-textPrimary text-xs font-bold tracking-tight mb-1">
                      Daily Goal Progress
                    </Text>
                    <Text className="text-textMuted text-[11px] font-medium text-center px-4 leading-relaxed">
                      {hasStepGoal(profile)
                        ? `${steps?.toLocaleString()} / ${profile.stepGoal.toLocaleString()} steps`
                        : `${calories?.toLocaleString()} / ${profile.calorieGoal.toLocaleString()} kcal`}
                    </Text>
                  </>
                );
              })()
            ) : (
              <>
                <View className="h-16 w-16 rounded-full border-[3px] border-backgroundElement/40 items-center justify-center mb-3">
                  <View className="h-10 w-10 rounded-full border-[3px] border-accent/20 items-center justify-center" />
                </View>

                <Text className="text-textPrimary text-xs font-bold tracking-tight mb-1">
                  Telemetry Ring Engine
                </Text>
                <Text className="text-textMuted text-[11px] font-medium text-center px-4 leading-relaxed">
                  Set a goal to see your daily progress ring here.
                </Text>
              </>
            )}
          </View> */}


          {/* Clean Modular Telemetry Ring Section */}
          <TelemetryProgressRing
            steps={steps}
            calories={calories}
            profile={profile}
          />


          {/** Week Activity Chart */}
          <WeeklyActivityChart
            data={weekChartData}
            stepGoal={profile?.stepGoal}
            calorieGoal={profile?.calorieGoal}
          />

        </View>
      </ScrollView>

      {profile && (
        <ActivityGoalModal
          visible={modalMode !== null}
          onClose={closeGoalModal}
          mode={modalMode ?? 'initial'}
          initialStepGoal={profile.stepGoal}
          initialCalorieGoal={profile.calorieGoal}
          onSave={(goals) => updateGoals(goals)}
          onRemoveStep={() => clearStepGoal()}
          onRemoveCalorie={() => clearCalorieGoal()}
        />
      )}
    </ScreenContainer>
  );
}
