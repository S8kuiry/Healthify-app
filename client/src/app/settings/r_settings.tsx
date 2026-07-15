import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import ScreenContainer from '@/components/ScreenContainer';
import { useAppColors } from '@/hooks/use-app-colors';
import {
  getAlarmVolume,
  getSelectedAlarmUri,
  getVibrateEnabled,
  setAlarmVolume,
  setSelectedAlarmUri,
  setVibrateEnabled,
} from '@/db/alarmSoundRepo';
import VolumeSlider from '@/components/reminder-ui/VolumeSlider';
import ReminderAlarmModule from '../../../modules/reminder-alarm/src';

type AlarmSound = { title: string; uri: string };

export default function SoundSettingsScreen() {
  const router = useRouter();
  const colors = useAppColors();

  const [sounds, setSounds] = useState<AlarmSound[]>([]);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [vibrate, setVibrate] = useState(true);
  const [volume, setVolume] = useState(100);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the available system tones + the user's previously saved choices, so the
  // list opens with the current tone highlighted and the toggle in its saved state.
  useEffect(() => {
    let active = true;
    async function load() {
      const [systemAlarms, savedUri, savedVibrate, savedVolume] = await Promise.all([
        ReminderAlarmModule.getSystemAlarms(),
        getSelectedAlarmUri(),
        getVibrateEnabled(),
        getAlarmVolume(),
      ]);
      if (!active) return;
      setSounds(systemAlarms);
      setSelectedUri(savedUri);
      setVibrate(savedVibrate);
      setVolume(savedVolume);
      setLoading(false);
    }
    load();

    // 🛑 CLEANUP LIFECYCLE: When the user leaves this screen, kill the preview
    // audio instantly so it doesn't ring forever.
    return () => {
      active = false;
      ReminderAlarmModule.stopAlarmPreview();
    };
  }, []);

  // Tapping a row highlights it and previews the tone — it is NOT saved yet.
  const handleSoundPress = async (uri: string) => {
    if (uri === selectedUri){
      setSelectedUri(null); // deselect if already selected
      ReminderAlarmModule.stopAlarmPreview();
       return;} 
    setSelectedUri(uri);
    await ReminderAlarmModule.playAlarmPreview(uri);
  };

  const handleCancel = () => {
    ReminderAlarmModule.stopAlarmPreview();
    router.back();
  };

  // Persist the highlighted tone + vibration choice so the next reminder uses them.
  const handleSelect = async () => {
    if (!selectedUri) return;
    setSaving(true);
    ReminderAlarmModule.stopAlarmPreview();
    await Promise.all([
      setSelectedAlarmUri(selectedUri),
      setVibrateEnabled(vibrate),
      setAlarmVolume(volume),
    ]);
    setSaving(false);
    router.back();
  };

  return (
    <ScreenContainer>
      <View className="mb-5 mt-2">
        <Text className="text-textPrimary text-2xl font-black tracking-tight">
          Alarm Tone
        </Text>
        <Text className="text-textSecondary text-xs font-medium mt-1">
          Choose the sound your reminders ring with. Tap a tone to preview it.
        </Text>
      </View>

      {/* Alarm volume — single source of truth for how loud the alarm rings. */}
      {!loading && (
        <View className="rounded-2xl px-4 py-4 mb-4 bg-cardBackground/60">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-textPrimary text-base font-semibold">Alarm Volume</Text>
            <Text className="text-accent text-base font-bold">{volume}%</Text>
          </View>
          <VolumeSlider value={volume} onChange={setVolume} />
        </View>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={sounds}
          keyExtractor={(item) => item.uri}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = item.uri === selectedUri;
            return (
              <Pressable
                onPress={() => handleSoundPress(item.uri)}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
                className={`flex-row items-center justify-between rounded-2xl px-4 py-4 mb-3 border ${
                  isSelected
                    ? 'bg-cardBackground border-accent'
                    : 'bg-cardBackground/60 border-transparent'
                }`}
              >
                <Text
                  numberOfLines={1}
                  className={`flex-1 pr-3 text-base ${
                    isSelected
                      ? 'text-accent font-semibold'
                      : 'text-textPrimary font-medium'
                  }`}
                >
                  {item.title}
                </Text>
                <View
                  className={`h-5 w-5 rounded-full border-2 items-center justify-center ${
                    isSelected ? 'border-accent' : 'border-textMuted'
                  }`}
                >
                  {isSelected ? (
                    <View className="h-2.5 w-2.5 rounded-full bg-accent" />
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Vibration toggle */}
      {!loading && (
        <View className="flex-row items-center justify-between rounded-2xl px-4 py-4 mt-1 mb-1 bg-cardBackground/60">
          <View className="flex-1 pr-3">
            <Text className="text-textPrimary text-base font-semibold">Vibration</Text>
            <Text className="text-textSecondary text-xs mt-0.5">
              Vibrate the device while the alarm rings.
            </Text>
          </View>
          <Switch
            value={vibrate}
            onValueChange={setVibrate}
            trackColor={{ false: colors.backgroundElement, true: colors.accent }}
            thumbColor="#ffffff"
          />
        </View>
      )}

      {/* Footer actions */}
      <View className="flex-row gap-3 pt-3 pb-10">
        <Pressable
          onPress={handleCancel}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="flex-1 rounded-2xl py-4 items-center justify-center border border-backgroundElement/90 bg-cardBackground/50"
        >
          <Text className=" text-textPrimary/80 font-semibold">Cancel</Text>
        </Pressable>

        <Pressable
          onPress={handleSelect}
          disabled={!selectedUri || saving}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          className={`flex-1 rounded-2xl py-4 items-center justify-center ${
            !selectedUri || saving ? 'bg-accent/60' : 'bg-accent'
          }`}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white  font-semibold">Select</Text>
          )}
        </Pressable>
      </View>
    </ScreenContainer>
  );
}
