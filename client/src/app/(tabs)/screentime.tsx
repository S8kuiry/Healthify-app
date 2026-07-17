import { View, Text, ScrollView } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';
import SleepWeeklyGraph from '@/components/sleep/Sleepweeklygraph';
import SleepWindowPicker from '@/components/sleep/Sleepwindowpicker';
import SleepSummaryCard from '@/components/sleep/Sleepsummarycard';

export default function SleepScreen() {
  return (
    <ScreenContainer>
      <ScrollView style={{ paddingBottom: 20, flex: 1 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6 mt-2">
          <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">Sleep</Text>
          <Text className="text-textSecondary text-xs font-medium mt-0.5">
            Track your sleep schedule and habits
          </Text>
        </View>

        <SleepWindowPicker />
        <SleepSummaryCard />
        <SleepWeeklyGraph />
      </ScrollView>
    </ScreenContainer>
  );
}