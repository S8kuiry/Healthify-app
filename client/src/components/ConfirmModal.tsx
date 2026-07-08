import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-cardBackground rounded-2xl p-6 w-full max-w-sm">
          <Text className="text-textPrimary text-lg font-black tracking-tight mb-1">
            {title}
          </Text>
          <Text className="text-textSecondary text-xs font-medium mb-5">
            {message}
          </Text>

          <View className="flex-row mt-2" style={{ gap: 8 }}>
            <Pressable
              onPress={onClose}
              className="flex flex-1 rounded-3xl border border-textSecondary border-dashed py-2 items-center justify-center bg-backgroundElement active:opacity-85"
            >
              <Text className="text-textPrimary text-xs font-black tracking-wide uppercase">Cancel</Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              className="flex flex-1 rounded-full py-2 items-center justify-center bg-danger/10 border border-danger border-dashed active:opacity-85"
            >
              <Text className="text-danger text-xs font-black tracking-wide uppercase">{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
