import {
  Fraunces_400Regular,
  Fraunces_500Medium,
  useFonts as useFrauncesFonts,
} from '@expo-google-fonts/fraunces';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  useFonts as useHankenFonts,
} from '@expo-google-fonts/hanken-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  useFonts as useMonoFonts,
} from '@expo-google-fonts/ibm-plex-mono';
import { Platform } from 'react-native';

export function useBrandFonts() {
  const [frauncesLoaded] = useFrauncesFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
  });
  const [hankenLoaded] = useHankenFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });
  const [monoLoaded] = useMonoFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  if (Platform.OS === 'web') {
    return true;
  }

  return frauncesLoaded && hankenLoaded && monoLoaded;
}
