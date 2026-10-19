import { View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { Icon } from './Icon';
import { T } from './ui';
import type { PlaceMapProps } from './PlaceMap';

// No map on web: show the coordinates instead.
export function PlaceMap({ lat, lng }: PlaceMapProps) {
  return (
    <View style={{ height: 120, borderRadius: radius.lg, backgroundColor: '#ECEEEA', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Icon name="pin" color={colors.green} />
      <T variant="tiny" color={colors.muted}>{lat.toFixed(4)}, {lng.toFixed(4)}</T>
    </View>
  );
}
