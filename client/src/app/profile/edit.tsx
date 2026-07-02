import React, { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import { useProfile } from '@/context/profileContext';

export default function EditProfileScreen() {
  const { profile, updateProfile } = useProfile();
  const router = useRouter();

  const [heightCm, setHeightCm] = useState(profile ? String(profile.heightCm) : '');
  const [weightKg, setWeightKg] = useState(profile ? String(profile.weightKg) : '');
  const [age, setAge] = useState(profile ? String(profile.age) : '');
  const [sex, setSex] = useState<'male' | 'female' | null>(profile?.sex ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    const a = parseInt(age, 10);

    if (!h || !w || !a || !sex) {
      setError('Please fill in every field to continue.');
      return;
    }
    if (h < 100 || h > 250) {
      setError('Enter a realistic height in cm (100–250).');
      return;
    }
    if (w < 20 || w > 300) {
      setError('Enter a realistic weight in kg (20–300).');
      return;
    }
    setError(null);

    // This both updates the profile snapshot AND logs a dated weight
    // entry for today, per the "editing weight = logging weight" decision.
    await updateProfile({
      heightCm: h,
      weightKg: w,
      age: a,
      sex,
      stepGoal: profile?.stepGoal ?? 0,
      calorieGoal: profile?.calorieGoal ?? 0,
    });
    router.back();
  };

  return (
    <ScreenContainer>
      <Text className="text-textPrimary text-2xl font-bold mt-6 mb-1">Edit profile</Text>
      <Text className="text-textSecondary text-sm mb-6 leading-5">
        Updating your weight here also logs a new entry on your trend graph.
      </Text>

      <View style={{paddingHorizontal: 6}} className="flex-1">

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-2">Height (cm)</Text>
      <TextInput
        value={heightCm}
        onChangeText={setHeightCm}
        keyboardType="numeric"
        placeholderTextColor="#5C6470"
        className="bg-surface border border-border rounded-xl text-textPrimary px-4 py-4 text-base"
      />

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Weight (kg)</Text>
      <TextInput
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="numeric"
        placeholderTextColor="#5C6470"
        className="bg-surface border border-border rounded-xl text-textPrimary px-4 py-4 text-base"
      />

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Age</Text>
      <TextInput
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
        placeholderTextColor="#5C6470"
        className="bg-surface border border-border rounded-xl text-textPrimary px-4 py-4 text-base"
      />

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Sex</Text>
      <View className="flex-row gap-2">
        <Pressable
          className={`flex-1 border rounded-xl py-4 items-center ${
            sex === 'male' ? 'bg-background border-accent' : 'bg-background border-textSecondary '
          }`}
          onPress={() => setSex('male')}
        >
          <Text
            className={sex === 'male' ? 'text-accent font-semibold' : 'text-textSecondary font-semibold'}
          >
            Male
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 border rounded-xl py-4 items-center ${
            sex === 'female' ? 'bg-background border-accent' : 'bg-background border-textSecondary'
          }`}
          onPress={() => setSex('female')}
        >
          <Text
            className={sex === 'female' ? 'text-accent font-semibold' : 'text-textSecondary font-semibold'}
          >
            Female
          </Text>
        </Pressable>
      </View>

      {error ? <Text className="text-danger mt-4 text-sm">{error}</Text> : null}

      <Pressable className="bg-textSecondary rounded-xl py-4 items-center mt-6" onPress={handleSave}>
        <Text className="text-accent font-bold text-base">Save Changes</Text>
      </Pressable>

      <Pressable className="py-4 items-center mt-2" onPress={() => router.push('/profile')}>
        <Text className="text-textSecondary text-sm">Cancel</Text>
      </Pressable>

      </View>
    </ScreenContainer>
  );
}