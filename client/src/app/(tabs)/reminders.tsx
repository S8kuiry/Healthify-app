import { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import ExactAlarmPermissionModal from '@/components/ExactAlarmPermissionModal';
import ScreenContainer from '@/components/ScreenContainer';
import ReminderSearchBar from '@/components/reminder-ui/ReminderSearchBar';
import ReminderListItem from '@/components/reminder-ui/ReminderListItem';
import { useReminders } from '@/context/reminderContext';
import { useAppColors } from '@/hooks/use-app-colors';
import { Feather } from '@expo/vector-icons';

export default function RemindersScreen() {
  const { reminders, isLoading } = useReminders();
  const colors = useAppColors();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300)
    return () => clearTimeout(timeout);

  }, [search])

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return reminders;
    const q = debouncedSearch.toLowerCase();
    return reminders.filter((r) =>
      (r.label ?? '').toLowerCase().includes(q) ||
      (r.times ?? []).some((t) => t.time?.includes(q))
    );
  }, [reminders, debouncedSearch]);





  return (
    <ScreenContainer>
      <View style={{ paddingBottom: 20, flex: 1 }}>
        {/* Header Section */}
        <View className="flex-row items-center justify-between">

          <View className="mb-6 mt-2">
            <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">Reminders</Text>
            <Text className="text-textSecondary text-xs font-medium mt-0.5">
              Set your reminders to stay on track
            </Text>
          </View>


          <View className="flex flex-row items-center justify-between mb-4 mt-6 gap-4">
            <Pressable
              onPress={() => router.push('/settings/r_settings')}
              className="border-accent  bg-cardBackground/60"
              style={{ padding: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', marginBottom: 12 }}
            >
              <Feather name="settings" size={13} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/reminders/edit')}
              className="border-accent  bg-cardBackground/60"
              style={{ padding: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', marginBottom: 12 }}
            >
              <Text className="text-accent font-bold text-xs" style={{ fontWeight: '600' }}>+ Add reminder</Text>
            </Pressable>

          </View>

        </View>




        <ReminderSearchBar value={search} onChange={setSearch} />
        {/* <ReminderInputBar /> */}

        {/* {!isLoading && filtered.length === 0 && (
          <Text className="text-accent text-center mt-10">
            {search ? 'No reminders match your search' : 'No reminders yet — type one above to get started'}
          </Text>
        )} */}




        <View className="mb-4 mt-6  flex-1">
          <Text className="text-textPrimary text-xs font-black tracking-tight uppercase mb-3 px-1">Your Reminders</Text>

          {filtered.length > 0 ? (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 6, paddingHorizontal: 1, }}
              renderItem={({ item }) => <ReminderListItem reminder={item} />}
            />
          ) : (
            <View className=" items-center justify-center bg-cardBackground rounded-xl px-4 py-4" >
              <View className="h-16 w-16 rounded-full border-[3px] border-backgroundElement/50 items-center justify-center mb-3 mt-4">
                <View className="h-10 w-10 rounded-full border-[3px] border-accent/30 items-center justify-center" />
              </View>

              <Text className="text-textPrimary text-xs font-bold tracking-tight mb-1">
                {debouncedSearch.trim() ? 'No matches' : 'No reminders yet'}
              </Text>




              <View className="flex-row items-center py-4  ">
                <View className="h-2 w-[2px] bg-accent mr-1.5" />
                <Text className="text-textSecondary text-[9px] font-bold tracking-[1px] uppercase">
                  {debouncedSearch.trim() ? 'No reminders match your search' : 'No reminders yet — tap + to add one'}
                </Text>
              </View>
            </View>
          )}


        </View>



      </View>
      <ExactAlarmPermissionModal />
    </ScreenContainer>
  );
}