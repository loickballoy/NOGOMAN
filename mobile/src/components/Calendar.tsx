import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { IconButton, T } from './ui';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEK_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/**
 * Month grid with big day cells. Days before `min` or after `max` (YYYY-MM-DD) can't be picked.
 */
export function Calendar({ value, onChange, min, max }: { value: string; onChange: (iso: string) => void; min: string; max: string }) {
  const start = new Date(`${value}T00:00:00Z`);
  const [cursor, setCursor] = useState({ y: start.getUTCFullYear(), m: start.getUTCMonth() });
  const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const move = (delta: number) => {
    const d = new Date(Date.UTC(cursor.y, cursor.m + delta, 1));
    setCursor({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };
  const canPrev = iso(cursor.y, cursor.m, 0) >= min;
  const canNext = iso(cursor.y, cursor.m + 1, 1) <= max;

  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ opacity: canPrev ? 1 : 0.3 }} pointerEvents={canPrev ? 'auto' : 'none'}>
          <IconButton icon="back" label="Mois précédent" onPress={() => move(-1)} />
        </View>
        <T variant="h3">{MONTHS[cursor.m]} {cursor.y}</T>
        <View style={{ opacity: canNext ? 1 : 0.3 }} pointerEvents={canNext ? 'auto' : 'none'}>
          <IconButton icon="arrow" label="Mois suivant" onPress={() => move(1)} />
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEK.map((w, i) => <T key={i} variant="tiny" color={colors.muted} style={{ flex: 1, textAlign: 'center' }}>{w}</T>)}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row', gap: 4 }}>
          {cells.slice(row * 7, row * 7 + 7).map((d, i) => {
            if (d === null) return <View key={i} style={{ flex: 1, aspectRatio: 1 }} />;
            const day = iso(cursor.y, cursor.m, d);
            const disabled = day < min || day > max;
            const selected = day === value;
            return (
              <Pressable key={i} disabled={disabled} onPress={() => onChange(day)}
                accessibilityRole="button" accessibilityState={{ selected, disabled }}
                accessibilityLabel={`${WEEK_FULL[(offset + d - 1) % 7]} ${d} ${MONTHS[cursor.m]}`}
                style={({ pressed }) => [{ flex: 1, aspectRatio: 1, maxHeight: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected ? colors.ink : 'transparent' }, pressed && { backgroundColor: colors.field }]}>
                <T style={{ fontSize: 17, fontWeight: selected ? '800' : '600' }} color={selected ? colors.white : disabled ? '#C9CDCB' : colors.ink}>{d}</T>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
