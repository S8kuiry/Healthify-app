import '../../global.css';
import React from 'react';
import * as Notifications from 'expo-notifications';
import { Slot, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider, useProfile } from '@/context/profileContext';
import { ActivityProvider } from '@/context/activityContext';
import { ReminderProvider } from '@/context/reminderContext';
import { initScreenActivityTracking } from '@/domain/screenActivity/screenActivityListener';

/**
 * Set the notification handler for the app.
 * This is used to handle the notifications for the app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Initialize screen activity tracking (sleep detection).
 * Must run once on startup before profile is loaded.
 */
initScreenActivityTracking().catch((err) => {
  console.error('[ScreenActivityListener] Initialization failed:', err);
});


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
        <ActivityProvider>
          <ReminderProvider>
            <RootNavigation />
          </ReminderProvider>
        </ActivityProvider>
      </ProfileProvider>
    </SafeAreaProvider>
  );
}