import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import { stopSpeaking, toggleSpeak } from '@/lib/speech';
import { colors, radius, space, touch, type } from '@/lib/theme';
import { Icon, IconName } from './Icon';

export function T({ style, children, numberOfLines, variant = 'body', color }: {
  style?: TextStyle | TextStyle[]; children: ReactNode; numberOfLines?: number;
  variant?: keyof typeof type; color?: string;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[type[variant] as TextStyle, { color: color ?? colors.ink }, style as TextStyle]}>
      {children}
    </Text>
  );
}

/** "Écouter": same place on every screen, reads the screen's summary aloud. Tap again to stop. */
export function ListenButton({ text, compact, surface = colors.field }: { text: string; compact?: boolean; surface?: string }) {
  const [on, setOn] = useState(false);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused && on) stopSpeaking();
  }, [focused, on]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? 'Arrêter la lecture' : 'Écouter cette page'}
      onPress={() => toggleSpeak(text, setOn)}
      hitSlop={8}
      style={({ pressed }) => [styles.listen, { backgroundColor: surface }, compact && styles.listenCompact, on && styles.listenOn, pressed && styles.pressed]}>
      <Icon name={on ? 'stop' : 'volume'} size={20} color={on ? colors.white : colors.ink} />
      {!compact && <T variant="label" style={{ fontWeight: '700' }} color={on ? colors.white : colors.ink}>{on ? 'Arrêter' : 'Écouter'}</T>}
    </Pressable>
  );
}

export function Header({ listen, back = true, right, onBack }: { listen: string; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={onBack ?? (() => router.back())} hitSlop={8}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <Icon name="back" />
        </Pressable>
      ) : <Wordmark />}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        {right}
        <ListenButton text={listen} />
      </View>
    </View>
  );
}

export function Wordmark() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={styles.logo}><Icon name="sprout" size={18} color={colors.green} strokeWidth={2.4} /></View>
      <T style={{ fontSize: 21, fontWeight: '800', letterSpacing: -0.6 }}>nogoman</T>
    </View>
  );
}

/**
 * Standard page: header, scrolling content, and the one main action pinned at the bottom.
 */
export function Screen({ children, footer, scroll = true, background = colors.white, padded = true }: {
  children: ReactNode; footer?: ReactNode; scroll?: boolean; background?: string; padded?: boolean;
}) {
  const body = padded ? <View style={styles.body}>{children}</View> : children;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['top', 'left', 'right', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{body}</ScrollView>
      ) : <View style={{ flex: 1 }}>{body}</View>}
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, sublabel, style }: {
  label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName; disabled?: boolean; loading?: boolean; sublabel?: string; style?: ViewStyle;
}) {
  const fg = variant === 'primary' ? colors.white : variant === 'danger' ? colors.alertText : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.ink },
        variant === 'secondary' && { borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.white },
        variant === 'danger' && { borderWidth: 1.5, borderColor: colors.alertSoft, backgroundColor: colors.white },
        variant === 'ghost' && { backgroundColor: 'transparent', minHeight: 48 },
        sublabel ? { minHeight: 62 } : null,
        (disabled || loading) && { opacity: 0.4 },
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {icon && <Icon name={icon} color={fg} size={20} />}
            <T variant="h3" color={fg} style={variant === 'ghost' ? { textDecorationLine: 'underline', fontSize: 16 } : undefined}>{label}</T>
          </View>
          {sublabel && <T variant="tiny" color={variant === 'primary' ? colors.onInkMuted : colors.muted}>{sublabel}</T>}
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, filled }: { icon: IconName; label: string; onPress: () => void; filled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.round, filled && { backgroundColor: colors.ink }, pressed && styles.pressed]}>
      <Icon name={icon} color={filled ? colors.white : colors.ink} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
      {icon && <Icon name={icon} size={18} color={selected ? colors.white : colors.ink} />}
      <T variant="label" style={{ fontWeight: '700' }} color={selected ? colors.white : colors.ink}>{label}</T>
    </Pressable>
  );
}

export function Card({ children, style, onPress, dark }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; dark?: boolean }) {
  const s = [styles.card, dark && { backgroundColor: colors.ink, borderColor: colors.ink }, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...s, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const bannerTones = {
  info: { bg: colors.field, fg: colors.ink2, icon: 'clock' as IconName },
  success: { bg: colors.greenSoft, fg: colors.greenText, icon: 'shield' as IconName },
  pending: { bg: colors.pendingSoft, fg: colors.pendingText, icon: 'clock' as IconName },
  alert: { bg: colors.alertSoft, fg: colors.alertText, icon: 'alert' as IconName },
};

export function Banner({ tone = 'info', title, children, icon }: { tone?: keyof typeof bannerTones; title?: string; children: ReactNode; icon?: IconName }) {
  const t = bannerTones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole={tone === 'alert' ? 'alert' : undefined}>
      <Icon name={icon ?? t.icon} color={t.fg} size={22} />
      <Text style={[type.small as TextStyle, { color: t.fg, flex: 1 }]}>
        {title && <Text style={{ fontWeight: '800' }}>{title} </Text>}
        {children}
      </Text>
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'pending' | 'alert' }) {
  const map = {
    neutral: [colors.field, colors.ink],
    success: [colors.greenSoft, colors.greenText],
    pending: [colors.pendingSoft, colors.pendingText],
    alert: [colors.alertSoft, colors.alertText],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <T variant="tiny" style={{ fontWeight: '700' }} color={fg}>{label}</T>
    </View>
  );
}

export function Avatar({ name, size = 44, dark }: { name: string; size?: number; dark?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: dark ? colors.ink : colors.field }}>
      <T style={{ fontSize: size * 0.36, fontWeight: '800' }} color={dark ? colors.white : colors.ink}>{name}</T>
    </View>
  );
}

export function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <View style={{ flex: 1 }}>
        <T variant="label" color={colors.muted}>{label}</T>
        <T style={{ fontSize: 20, fontWeight: '800' }}>{value}</T>
      </View>
      <IconButton icon="minus" label={`Moins, ${label}`} onPress={onMinus} />
      <IconButton icon="plus" label={`Plus, ${label}`} onPress={onPlus} filled />
    </View>
  );
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? colors.ink : colors.line }} />
        ))}
      </View>
      <T variant="label" color={colors.muted}>Étape {step} sur {total}</T>
    </View>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}><ActivityIndicator color={colors.ink} size="large" /></View>;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: 40, paddingHorizontal: 20 }}>
      <View style={[styles.round, { width: 64, height: 64, borderRadius: 32 }]}><Icon name={icon} size={30} /></View>
      <T variant="h3" style={{ textAlign: 'center' }}>{title}</T>
      {children && <T variant="small" color={colors.muted} style={{ textAlign: 'center' }}>{children}</T>}
    </View>
  );
}

export const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  body: { flexGrow: 1, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xl, gap: space.lg },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, gap: space.sm, backgroundColor: colors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: touch.min },
  round: { width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colors.field, alignItems: 'center', justifyContent: 'center' },
  listen: { height: 40, paddingLeft: 10, paddingRight: 14, borderRadius: radius.pill, backgroundColor: colors.field, flexDirection: 'row', alignItems: 'center', gap: 6 },
  listenCompact: { width: touch.min, height: touch.min, paddingLeft: 0, paddingRight: 0, justifyContent: 'center' },
  listenOn: { backgroundColor: colors.ink },
  logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: touch.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space.lg, backgroundColor: colors.white },
  banner: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', padding: space.lg, borderRadius: radius.md },
  pill: { alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 68, paddingLeft: space.lg, paddingRight: space.md },
});
