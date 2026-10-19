import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { Icon } from './Icon';
import { T } from './ui';

/** Big on-screen number pad: no system keyboard to hunt through. */
export function Keypad({ value, onChange, maxLength }: { value: string; onChange: (v: string) => void; maxLength: number }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={styles.grid}>
      {keys.map((k, i) => {
        if (k === '') return <View key={i} style={styles.key} />;
        const isDel = k === 'del';
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={isDel ? 'Effacer' : k}
            onPress={() => onChange(isDel ? value.slice(0, -1) : value.length < maxLength ? value + k : value)}
            onLongPress={isDel ? () => onChange('') : undefined}
            style={({ pressed }) => [styles.key, styles.keyBg, pressed && { backgroundColor: colors.line }]}>
            {isDel ? <Icon name="delete" size={26} /> : <T style={{ fontSize: 26, fontWeight: '600' }}>{k}</T>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: { width: '31.8%', height: 60, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  keyBg: { backgroundColor: colors.field },
});
