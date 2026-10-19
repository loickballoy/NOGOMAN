import { Pressable, View } from 'react-native';
import { OPERATORS } from '@/lib/catalog';
import { colors, radius } from '@/lib/theme';
import { Operator } from '@/lib/types';
import { T } from './ui';

export function OperatorBadge({ id, size = 36 }: { id: Operator; size?: number }) {
  const o = OPERATORS.find((x) => x.id === id)!;
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: o.bg, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ fontSize: 12, fontWeight: '800' }} color={o.fg}>{o.short}</T>
    </View>
  );
}

/** One list, one radio per mobile money operator. */
export function OperatorPicker({ value, onChange }: { value: Operator | null; onChange: (o: Operator) => void }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' }}>
      {OPERATORS.map((o, i) => {
        const on = value === o.id;
        return (
          <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.id)}
            style={({ pressed }) => [{
              minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line, backgroundColor: on ? colors.canvas : colors.white,
            }, pressed && { opacity: 0.7 }]}>
            <OperatorBadge id={o.id} />
            <T variant="bodyStrong" style={{ flex: 1 }}>{o.name}</T>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.ink : '#C9CDCB', alignItems: 'center', justifyContent: 'center' }}>
              {on && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink }} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
