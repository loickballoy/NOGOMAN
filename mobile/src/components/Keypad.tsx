import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { Icon } from './Icon';
import { T } from './ui';

/** Big on-screen number pad: no system keyboard to hunt through. */
export function Keypad({ value, onChange, maxLength }: { value: string; onChange: (v: string) => void; maxLength: number }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  // Smaller phones get shorter keys so the whole screen fits without scrolling.
  const { height } = useWindowDimensions();
  const keyHeight = Math.round(Math.min(60, Math.max(46, height * 0.068)));
  return (
    <View style={styles.grid}>
      {keys.map((k, i) => {
        if (k === '') return <View key={i} style={[styles.key, { height: keyHeight }]} />;
        const isDel = k === 'del';
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={isDel ? 'Effacer' : k}
            onPress={() => onChange(isDel ? value.slice(0, -1) : value.length < maxLength ? value + k : value)}
            onLongPress={isDel ? () => onChange('') : undefined}
            style={({ pressed }) => [styles.key, styles.keyBg, { height: keyHeight }, pressed && { backgroundColor: colors.line }]}>
            {isDel ? <Icon name="delete" size={26} /> : <T style={{ fontSize: keyHeight * 0.44, fontWeight: '600' }}>{k}</T>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: { width: '31.8%', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  keyBg: { backgroundColor: colors.field },
});
