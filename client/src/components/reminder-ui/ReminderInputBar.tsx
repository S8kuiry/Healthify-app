import { useState } from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';

export default function ReminderInputBar() {
  const [text, setText] = useState('');
  const router = useRouter();

  function submit() {
    if (!text.trim()) return;
    router.push({ pathname: '/reminders/edit', params: { text: text.trim() } });
    setText('');
  }

  return (
    <View className="flex-row gap-2 mb-4 items-center">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type a reminder..."
        placeholderTextColor="gray"
        onSubmitEditing={submit}
        className="flex-1 bg-cardBackground text-textPrimary  rounded-xl px-4 py-3.5 text-base font-medium tracking-tight"
      />
      
      <Pressable 
        onPress={submit} 
        className="bg-accent rounded-xl px-5 py-4 justify-center items-center active:opacity-80 transition-opacity"
      >
        <Text className="text-cardBackground text-xs font-black tracking-wider uppercase">
          Add
        </Text>
      </Pressable>
    </View>
  );
}