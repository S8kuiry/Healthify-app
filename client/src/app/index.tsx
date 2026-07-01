import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useProfile } from '@/context/profileContext';

export default function Index() {
  const { profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#3DDC84" />
      </View>
    );
  }

  if (!profile) {
    return <Redirect href="/onboarding/profile" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}
