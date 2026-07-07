import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import Svg, { Circle } from 'react-native-svg';

import { useActivity } from '@/context/activityContext';
import { useProfile } from '@/context/profileContext';
import ActivityGoalModal from '@/components/ActivityGoalModal';
import { hasAnyGoal, hasStepGoal, primaryProgress } from '@/domain/goal';
import WeeklyActivityChart from '@/components/WeeklyActivityChart';
import {
  getCurrentWeekRange,
  getWeekDayStrings,
  toLocalDateString,
} from '@/domain/date';
import TelemetryProgressRing from '@/components/TelemetryProgressRing';

export default function DashboardScreen() {

  const { profile, updateGoals, clearStepGoal, clearCalorieGoal } = useProfile();
  const { steps, calories, weekData, permissionDenied, sensorMissing } = useActivity();
  const [modalMode, setModalMode] = useState<'initial' | 'steps' | 'calories' | null>(null);


  const openGoalModal = useCallback((mode: 'initial' | 'steps' | 'calories') => {
    setModalMode(mode);
  }, []);

  const closeGoalModal = useCallback(() => {
    setModalMode(null);
  }, []);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
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
                    <View className="border border-dashed border-accent  bg-lightBackground flex-row items-center justify-center gap-1 rounded-3xl px-3 py-1   items-center" style={{ minWidth: 92 }}>


                      <Text
                      style={{ lineHeight: 16 , fontVariant: ['tabular-nums'] }}
                       className="text-textPrimary text-xs font-bold tracking-wide">
                        GOAL :
                      </Text>
                      <Text 
                        style={{ lineHeight: 16, fontVariant: ['tabular-nums'] }}
                      className="text-accent text-xs font-bold tracking-wide">
                        {profile.stepGoal.toLocaleString()}
                      </Text>
                      <Text 
                      style={{ lineHeight: 16 , fontVariant: ['tabular-nums'] }}
                      className="text-accent text-xs font-bold tracking-wide ">
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
                    <View className="border border-dashed border-accent  bg-lightBackground flex-row items-center justify-center gap-1 rounded-3xl px-2 py-1   items-center" style={{ width: 110 }}>


                      <Text 
                        style={{ lineHeight: 16 , fontVariant: ['tabular-nums'] }}

                       className="text-textPrimary text-xs font-bold tracking-wide">
                        GOAL :
                      </Text>
                      <Text 
                        style={{ lineHeight: 16 , fontVariant: ['tabular-nums'] }}

                      className="text-accent text-xs font-bold tracking-wide">
                        {profile.calorieGoal.toLocaleString()}
                      </Text>
                      <Text
                        style={{ lineHeight: 16 , fontVariant: ['tabular-nums'] }}
                       className="text-accent text-xs font-bold tracking-wide ">
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
