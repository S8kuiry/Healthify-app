import { useColorScheme } from './use-color-scheme';
import { AppColors } from '@/constants/appColors';

export function useAppColors() {
  const scheme = useColorScheme();
  return AppColors[scheme === 'dark' ? 'dark' : 'light'];
}
