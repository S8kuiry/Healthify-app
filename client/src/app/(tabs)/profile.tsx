import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import { useProfile } from '@/context/profileContext';

export default function ProfileScreen() {
  const { profile, weightHistory } = useProfile();
  const router = useRouter();

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
                <Text className="text-textPrimary text-xl font-black tracking-tight">{profile.weightKg}</Text>
                <Text className="text-accent text-xs font-bold ml-0.5">kg</Text>
              </View>
            </View>

            {/* Vertical Splitter 1 */}
            <View className="h-8 w-[1px] bg-accent" />

            {/* Height Column */}
            <View className="flex-1 items-center">
              <Text className="text-textSecondary text-[10px] font-bold tracking-widest uppercase">Height</Text>
              <View className="flex-row items-baseline mt-1.5">
                <Text className="text-textPrimary text-xl font-black tracking-tight">{profile.heightCm}</Text>
                <Text className="text-accent text-xs font-bold ml-0.5">cm</Text>
              </View>
            </View>

            {/* Vertical Splitter 2 */}
            <View className="h-8 w-[1px] bg-accent" />

            {/* Age Column */}
            <View className="flex-1 items-center">
              <Text className="text-textSecondary text-[10px] font-bold tracking-widest uppercase">Age</Text>
              <View className="flex-row items-baseline mt-1.5">
                <Text className="text-textPrimary text-xl font-black tracking-tight">{profile.age}</Text>
                <Text className="text-accent text-xs font-bold ml-0.5">yrs</Text>
              </View>
            </View>

          </View>

          {/* Weight Trend Graph Section */}
          <View className="mb-6">
            <View className="flex-row justify-between items-baseline mb-3 px-1">
              <Text className="text-textPrimary text-xs font-black tracking-tight uppercase">Weight Trend</Text>
              <Text className="text-textMuted text-[10px] font-bold tracking-wider uppercase">Last 7 Entries</Text>
            </View>
            
            <View className="h-44 rounded-[28px] bg-cardBackground items-center justify-center p-5 shadow-sm">
              <View className="border border-dashed border-textMuted/20 rounded-2xl w-full h-full items-center justify-center p-4">
                <Text className="text-textMuted text-[11px] font-medium text-center leading-relaxed">
                  Chart library wiring goes here next — raw data logs detailed below.
                </Text>
              </View>
            </View>
          </View>

          {/* Historical Entries List */}
          <View className="mb-2">
            <Text className="text-textPrimary text-xs font-black tracking-tight uppercase mb-3 px-1">History Log</Text>
            
            <View className="bg-cardBackground rounded-[28px] px-5 py-1 shadow-sm">
              {latestEntries.length === 0 ? (
                <View className="py-6 items-center">
                  <Text className="text-textMuted text-xs font-medium">No weight entries yet.</Text>
                </View>
              ) : (
                latestEntries
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <View
                      key={entry.id}
                      className={`flex-row justify-between items-center py-3.5 ${
                        index !== latestEntries.length - 1 ? 'border-b border-backgroundElement/30' : ''
                      }`}
                    >
                      <Text className="text-textSecondary text-xs font-semibold">{entry.date}</Text>
                      <View className="flex-row items-baseline">
                        <Text className="text-textPrimary text-sm font-black tracking-tight">
                          {entry.weightKg}
                        </Text>
                        <Text className="text-textMuted text-[10px] font-bold ml-0.5">kg</Text>
                      </View>
                    </View>
                  ))
              )}
            </View>
          </View>

        </View>
      </ScrollView>
    </ScreenContainer>
  );
}