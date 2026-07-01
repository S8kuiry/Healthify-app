import { useProfile } from '@/context/profileContext';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
};

export default function ScreenContainer({ children, className, noPadding }: Props) {
  const { profile } = useProfile();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className={`flex-1 bg-background ${noPadding ? '' : 'px-4 pt-4'} ${className ?? ''}`}>
        {children}
      </View>
    </SafeAreaView>
  );
}