import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Icon, IconName } from '@/components/Icon';
import { Keypad } from '@/components/Keypad';
import { OperatorPicker } from '@/components/OperatorPicker';
import { Banner, Button, Header, Progress, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { groupPhone } from '@/lib/format';
import { colors, radius, type } from '@/lib/theme';
import { Operator, Role, SelfUser } from '@/lib/types';

/** First run: who are you, what's your name, where do we pay you. One question per screen. */
export default function Onboarding() {
  const me = useMe();
  const { setUser, signOut } = useAuth();
  const [step, setStep] = useState(me.role ? 2 : 1);
  const [role, setRole] = useState<Role | null>(me.role);
  const [name, setName] = useState(me.name ?? '');
  const ownDigits = me.phone.replace(/^\+225/, '');
  const [operator, setOperator] = useState<Operator | null>(null);
  const [payDigits, setPayDigits] = useState(ownDigits);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = role === 'WORKER' ? 3 : 2;

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim(), role };
      if (role === 'WORKER' && operator) Object.assign(body, { payoutOperator: operator, payoutPhone: payDigits });
      setUser(await api<SelfUser>('/me', { method: 'PATCH', body }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (step === 1) {
    return (
      <Screen footer={<Button label="Continuer" disabled={!role} onPress={() => setStep(2)} />}>
        <Header back={false} listen="Choisissez. Je cherche du travail, si vous voulez travailler dans les plantations. Je cherche des travailleurs, si vous avez une plantation." />
        <Progress step={1} total={total} />
        <T variant="title">Vous êtes…</T>
        <RoleCard icon="briefcase" title="Je cherche du travail" sub="Trouver des missions près de chez moi, payées chaque soir." selected={role === 'WORKER'} onPress={() => setRole('WORKER')} />
        <RoleCard icon="users" title="Je cherche des travailleurs" sub="J'ai une plantation et j'ai besoin de bras." selected={role === 'FARMER'} onPress={() => setRole('FARMER')} />
        <View style={{ flex: 1 }} />
        <Button variant="ghost" label="Changer de numéro" onPress={signOut} />
      </Screen>
    );
  }

  if (step === 2) {
    const ok = name.trim().length >= 2;
    const last = role === 'FARMER';
    return (
      <Screen footer={<Button label={last ? 'Commencer' : 'Continuer'} disabled={!ok} loading={loading} onPress={() => (last ? save() : setStep(3))} />}>
        <Header listen="Écrivez votre nom. Les autres verront ce nom." back={false} />
        <Progress step={2} total={total} />
        <T variant="title">Votre nom</T>
        <T color={colors.ink2}>C’est le nom que les {role === 'WORKER' ? 'planteurs' : 'travailleurs'} verront.</T>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Prénom et nom"
          placeholderTextColor={colors.muted}
          autoFocus
          autoCapitalize="words"
          maxLength={60}
          accessibilityLabel="Prénom et nom"
          style={[type.h3, { height: 64, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.lg, paddingHorizontal: 16, color: colors.ink }]}
        />
        {error && <Banner tone="alert">{error}</Banner>}
        {!me.role && <Button variant="ghost" label="Retour" onPress={() => setStep(1)} />}
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Commencer" disabled={!operator || payDigits.length !== 10} loading={loading} onPress={save} />}>
      <Header listen="Où voulez-vous recevoir votre argent ? Choisissez votre mobile money, puis vérifiez le numéro." onBack={() => setStep(2)} />
      <Progress step={3} total={3} />
      <T variant="title">Où recevoir votre argent ?</T>
      <OperatorPicker value={operator} onChange={setOperator} />
      <View style={{ gap: 6 }}>
        <T variant="label" color={colors.muted}>Numéro mobile money</T>
        <T style={{ fontSize: 24, fontWeight: '800' }}>+225 {groupPhone(payDigits) || '…'}</T>
      </View>
      {error && <Banner tone="alert">{error}</Banner>}
      <Keypad value={payDigits} onChange={setPayDigits} maxLength={10} />
    </Screen>
  );
}

function RoleCard({ icon, title, sub, selected, onPress }: { icon: IconName; title: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 18, borderRadius: radius.xl,
        borderWidth: selected ? 2 : 1.5, borderColor: selected ? colors.ink : colors.line, backgroundColor: selected ? colors.canvas : colors.white },
        pressed && { opacity: 0.7 }]}>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.ink : colors.field }}>
        <Icon name={icon} size={28} color={selected ? colors.white : colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T variant="h3">{title}</T>
        <T variant="small" color={colors.ink2}>{sub}</T>
      </View>
    </Pressable>
  );
}
