import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { AppColors } from '@/constants/appColors';

export function useAppColors() {
  const scheme = useColorScheme();
  return useMemo(
    () => AppColors[scheme === 'dark' ? 'dark' : 'light'],
    [scheme]
  );
}
