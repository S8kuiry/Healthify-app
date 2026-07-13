import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
};

export default function ScreenContainer({ children, className, noPadding }: Props) {
  const scheme = useColorScheme();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
      />
      <View className={`flex-1 bg-background ${noPadding ? '' : 'px-4 pt-4'} ${className ?? ''}`}>
        {children}
      </View>
    </SafeAreaView>
  );
}