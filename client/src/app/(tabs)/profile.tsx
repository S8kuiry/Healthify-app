import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import { useProfile } from '@/context/profileContext';
import { useActivity } from '@/context/activityContext';
import { Feather } from '@expo/vector-icons';
import AddWeightModal from '@/components/AddWeightModal';
import ConfirmModal from '@/components/ConfirmModal';
import type { WeightEntry } from '@/context/profileContext';
import WeightTrendGraph from '@/components/WeightTrendGraph';
import { DailyActivity, getYearActivity } from '@/db/dailyActivityRepo';
import { activeCalories } from '@/domain/calorie';
import { toLocalDateString } from '@/domain/date';

export default function ProfileScreen() {
  const { profile, weightHistory, updateWeight, deleteWeight, showNewYearBanner, dismissNewYearBanner } = useProfile();
  const { steps, calories } = useActivity();
  const [yearActivity, setYearActivity] = useState<DailyActivity[]>([]);
  const [showAddWeightModal, setShowAddWeightModal] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<WeightEntry | null>(null);
  const router = useRouter();

  const refreshYear = useCallback(() => {
    const year = toLocalDateString().slice(0, 4);
    getYearActivity(year).then(setYearActivity);
  }, []);

  useEffect(() => {
    refreshYear();
  }, [refreshYear]);

  useFocusEffect(
    useCallback(() => {
      refreshYear();
    }, [refreshYear])
  );

  const yearActivityWithLive = useMemo(() => {
    if (!profile) return yearActivity;

    const today = toLocalDateString();
    if (steps === null) return yearActivity;

    const liveRow: DailyActivity = {
      date: today,
      steps,
      calories: calories ?? activeCalories(steps, profile),
      stepGoal: profile.stepGoal ?? 0,
      calorieGoal: profile.calorieGoal ?? 0,
    };

    const hasToday = yearActivity.some((r) => r.date === today);
    if (!hasToday) {
      return [...yearActivity, liveRow].sort((a, b) => a.date.localeCompare(b.date));
    }
    return yearActivity.map((r) => (r.date === today ? liveRow : r));
  }, [yearActivity, steps, calories, profile]);

  if (!profile) {
    return (
      <ScreenContainer>
        <Text className="text-textMuted text-center mt-10">Loading profile…</Text>
      </ScreenContainer>
    );
  }

  const sortedHistory = [...weightHistory].sort((a, b) => a.date.localeCompare(b.date));
  const latestEntries = sortedHistory.slice(-7);

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 4 }} className="flex-1">

          {/* Header Row */}
          <View className="flex-row justify-between items-start mb-6 mt-2">
            <View className="flex-1">
              {/* Profile Title + Gender Pill Inline Row */}
              <View className="flex-row items-center gap-2">
                <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">Profile</Text>
                <View className="border border-accent rounded-3xl px-2.5 py-0.5 mt-0.5 mx-1.5">
                  <Text className="text-accent text-[9px] font-black uppercase tracking-wider">
                    {profile.sex}
                  </Text>
                </View>
              </View>
              <Text className="text-textSecondary text-xs font-medium mt-1">
                Your physical metrics & history
              </Text>
            </View>

            <Pressable
              className="bg-accent rounded-full px-4 py-2 active:opacity-85"
              onPress={() => router.push('/profile/edit')}
            >
              <Text className="text-background font-bold text-[11px] tracking-wide uppercase">Edit</Text>
            </Pressable>
          </View>

          {/* Balanced Vitals Matrix Card */}
          <View className="bg-cardBackground rounded-xl py-5 px-2 mb-6 shadow-sm flex-row items-center justify-center gap-6">

            {/* Weight Column */}
            <View className="flex-1 items-center">
              <Text className="text-textSecondary text-[10px] font-bold tracking-widest uppercase">Weight</Text>
              <View className="flex-row items-baseline mt-1.5">
                <Text className="text-textPrimary text-[15px] font-black tracking-tight">{profile.weightKg}</Text>
                <Text className="text-accent text-xs font-bold ml-1">kg</Text>
              </View>
            </View>

            {/* Vertical Splitter 1 */}
            <View className="h-8 w-[1px] bg-accent" />

            {/* Height Column */}
            <View className="flex-1 items-center">
              <Text className="text-textSecondary text-[10px] font-bold tracking-widest uppercase">Height</Text>
              <View className="flex-row items-baseline mt-1.5">
                <Text className="text-textPrimary text-[15px] font-black tracking-tight">{profile.heightCm}</Text>
                <Text className="text-accent text-xs font-bold ml-1">cm</Text>
              </View>
            </View>

            {/* Vertical Splitter 2 */}
            <View className="h-8 w-[1px] bg-accent" />

            {/* Age Column */}
            <View className="flex-1 items-center">
              <Text className="text-textSecondary text-[10px] font-bold tracking-widest uppercase">Age</Text>
              <View className="flex-row items-baseline mt-1.5">
                <Text className="text-textPrimary text-[15px] font-black tracking-tight">{profile.age}</Text>
                <Text className="text-accent text-xs font-bold ml-1">years</Text>
              </View>
            </View>

          </View>

          {/* Weight Trend Graph Section */}
          <View className="mb-6">

          <WeightTrendGraph weightHistory={weightHistory} activity={yearActivityWithLive} />

          </View>

          {/* New-year fresh-start banner (shown once per rollover, dismissible) */}
          {showNewYearBanner && (
            <View className="mb-4 flex-row items-center rounded-3xl bg-accent/10 border border-accent/20 px-4 py-3">
              <Text className="text-2xl mr-3">🎉</Text>
              <View className="flex-1 pr-2">
                <Text className="text-textPrimary text-sm font-black tracking-tight">New Year, New Start</Text>
                <Text className="text-textSecondary text-[11px] font-medium mt-0.5">
                  A fresh slate for the new year — your latest weight is kept. Let’s start afresh!
                </Text>
              </View>
              <Pressable onPress={dismissNewYearBanner} hitSlop={10} className="p-1 active:opacity-70">
                <Feather name="x" size={16} color="#8a8a8a" />
              </Pressable>
            </View>
          )}

          {/* Historical Entries List */}
          <View className="mb-2">
            <Text className="text-textPrimary text-xs font-black tracking-tight uppercase mb-3 px-1">History Log</Text>

            <View className="bg-cardBackground rounded-3xl px-5 py-1 shadow-sm max-h-[250px]">

              <View className="flex-row justify-between items-center py-3.5">
                <Text className="text-textSecondary text-sm font-semibold flex-1">Weight Entry</Text>

                <Pressable className="active:opacity-85" onPress={() => setShowAddWeightModal(!showAddWeightModal)}>
                  <Text className="text-textSecondary text-xs font-semibold bg-accent rounded-2xl px-3 py-1 text-white  flex-row items-center justify-center">Add <Feather name="plus" size={12} color="white" /></Text>

                </Pressable>
              </View>

              {latestEntries.length === 0 ? (
                <View className="py-6 items-center">
                  <Text className="text-textMuted text-xs font-medium">No weight entries yet.</Text>
                </View>

              ) : (
                <ScrollView  showsVerticalScrollIndicator={false}>
                {latestEntries
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <View
                      key={entry.id}
                      className={`flex-row justify-between items-center py-3.5 ${index !== latestEntries.length - 1 ? '' : ''
                        }`}
                    >

                      <View className="text-textSecondary text-xs font-semibold flex-1 flex-row items-center gap-2 ">
                        <View className="bg-accent w-1 h-4 "/>
                        <Text className="text-textSecondary text-xs font-semibold">{entry.date}</Text>
                        </View>
                      <View className="flex-row items-center gap-3">
                        <View className="flex-row items-baseline">
                          <Text className="text-textPrimary text-sm font-black tracking-tight">
                            {entry.weightKg}
                          </Text>
                          <Text className="text-accent text-[10px] font-bold ml-0.5">kg</Text>
                        </View>
                        <Pressable
                          className="active:opacity-85 p-1"
                          onPress={() => setEntryToDelete(entry)}
                          hitSlop={8}
                        >
                          <Feather name="trash-2" size={14} color="#8a8a8a" />
                        </Pressable>
                      </View>
                    </View>

                  ))
                  }
                  </ScrollView>
              )}
            </View>
          </View>
          {showAddWeightModal && <AddWeightModal visible={showAddWeightModal} onClose={() => setShowAddWeightModal(false)} initialWeight={profile.weightKg} onSave={(data) => updateWeight({ id: data.date, date: data.date, weightKg: data.weightKg })} />}

          <ConfirmModal
            visible={entryToDelete !== null}
            title="Delete weight log?"
            message={
              entryToDelete
                ? `Remove the entry for ${entryToDelete.date} (${entryToDelete.weightKg} kg)? This cannot be undone.`
                : ''
            }
            confirmLabel="Delete"
            onClose={() => setEntryToDelete(null)}
            onConfirm={() => {
              if (entryToDelete) {
                deleteWeight(entryToDelete.id);
                setEntryToDelete(null);
              }
            }}
          />



        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
