import { Feather } from '@expo/vector-icons';
import { TextInput, View } from 'react-native';
import { useAppColors } from '@/hooks/use-app-colors';

export default function ReminderSearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useAppColors();

  return (
    <View className="flex-row items-center justify-between bg-cardBackground rounded-xl px-4 py-1 mb-3">
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search reminders..."
        placeholderTextColor={colors.textMuted}
        style={{ flex: 1, fontSize: 12, color: colors.textPrimary, paddingVertical: 10 }}
      />
      <Feather name="search" size={20} color={colors.textMuted} />
    </View>
  );
}
