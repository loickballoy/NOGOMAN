import { View } from 'react-native';
import { colors } from '@/lib/theme';
import { Icon } from './Icon';
import { T } from './ui';
import type { JobMapProps } from './JobMap';

// react-native-maps has no web version; the web build shows the list only.
export function JobMap({ jobs }: JobMapProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#ECEEEA', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Icon name="map" size={32} color={colors.muted} />
      <T variant="label" color={colors.muted}>{jobs.length} offre(s) autour de vous</T>
    </View>
  );
}
