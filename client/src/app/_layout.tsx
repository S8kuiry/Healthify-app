import '../../global.css';
import React from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider, useProfile } from '@/context/profileContext';

function RootNavigation() {
  const { profile, isLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (isLoading) return;

    const inOnboarding = segments[0] === 'onboarding';

    if (!profile && !inOnboarding) {
      router.replace('/onboarding/profile');
    } else if (profile && inOnboarding) {
      router.replace('/(tabs)/dashboard');
    }
  }, [profile, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#3DDC84" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ProfileProvider>
        <RootNavigation />
      </ProfileProvider>
    </SafeAreaProvider>
  );
}