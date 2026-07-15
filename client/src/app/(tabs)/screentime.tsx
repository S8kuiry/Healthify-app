
import SleepSummaryCard from '@/components/screen-activity-ui/SleepSummaryCard';
import SleepWeeklyGraph from '@/components/screen-activity-ui/SleepWeeklyGraph';
import SleepWindowPicker from '@/components/screen-activity-ui/Sleepwindowpicker';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenContainer from 'react-native-screens/lib/typescript/components/ScreenContainer';

export default function SleepScreen() {
  return (
    <ScreenContainer>
       <Text className="text-textPrimary text-3xl font-bold mb-1">Sleep Time</Text>
      <Text className="text-textSecondary text-sm mb-6">Daily sleep + sleep mode toggle</Text>


      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4">
          <Text className="text-textPrimary font-bold text-2xl tracking-tight">Sleep</Text>
        </View>

        <SleepWindowPicker />
        <SleepSummaryCard />
        <SleepWeeklyGraph />
      </ScrollView>
     </ScreenContainer>
  );
}