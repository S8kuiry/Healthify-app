import ScreenContainer from '@/components/ScreenContainer';
import { useProfile } from '@/context/profileContext';
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView } from 'react-native';


export default function OnboardingProfileScreen() {
  const { saveProfile } = useProfile();
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
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
    await saveProfile({ heightCm: h, weightKg: w, age: a, sex, stepGoal: 0, calorieGoal: 0 });
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1">
    <ScreenContainer>


    <Text className="text-textPrimary text-2xl font-bold mt-6 mb-1">Welcome! Set up your profile</Text>
      <Text className="text-textSecondary text-sm mb-6 leading-5">
        We use this to calculate accurate calorie burn. Step tracking won't start until this is saved.
      </Text>
      <View style={{paddingHorizontal: 6}} className="flex-1">

     

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Height (cm)</Text>
      <TextInput
        placeholder="e.g. 175"
        placeholderTextColor="#5C6470"
        value={heightCm}
        onChangeText={setHeightCm}
        keyboardType="numeric"
        className="bg-surface border border-border rounded-xl text-textPrimary px-4 py-4 text-base mb-2"
      />

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Weight (kg)</Text>
      <TextInput
        placeholder="e.g. 70"
        placeholderTextColor="#5C6470"
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="numeric"
        className="bg-surface border border-border rounded-xl text-textPrimary px-4 py-4 text-base mb-2"
      />

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Age</Text>
      <TextInput
        placeholder="e.g. 21"
        placeholderTextColor="#5C6470"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
        className="bg-surface border border-border rounded-xl text-textPrimary px-4 py-4 text-base mb-2"
      />

      <Text className="text-textSecondary text-xs font-semibold mb-1 mt-3">Sex</Text>
      <View className="flex-row gap-2">
        <Pressable
          className={`flex-1 border rounded-xl py-4 items-center  ${
            sex === 'male' ? 'bg-background border-accent' : 'bg-background border-textSecondary '
          }`}
          onPress={() => setSex('male')}
        >
          <Text className={`${sex === 'male' ? 'text-accent font-semibold' : 'text-textSecondary font-semibold'} `}>
            Male
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 border rounded-xl py-4 items-center ${
            sex === 'female' ? 'bg-background border-accent' : 'bg-background border-textSecondary'
          }`}
          onPress={() => setSex('female')}
        >
          <Text className={sex === 'female' ? 'text-accent font-semibold' : 'text-textSecondary font-semibold'}>
            Female
          </Text>
        </Pressable>
      </View>

      {error ? <Text className="text-danger mt-4 text-sm">{error}</Text> : null}

      

      <Pressable className="bg-textSecondary rounded-xl py-4 items-center mt-6" onPress={handleContinue}>
        <Text className="text-accentLight font-bold text-base">Continue</Text>
      </Pressable>
    </View>
    </ScreenContainer>
    </KeyboardAvoidingView>
  );
}