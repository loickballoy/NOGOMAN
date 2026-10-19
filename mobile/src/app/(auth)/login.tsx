import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Keypad } from '@/components/Keypad';
import { Banner, Button, Header, Screen, T } from '@/components/ui';
import { API_URL, api, errorMessage } from '@/lib/api';
import { groupPhone } from '@/lib/format';
import { colors, radius } from '@/lib/theme';

export default function LoginScreen() {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = digits.length === 10;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone: digits } });
      router.push({ pathname: '/verify', params: { phone: digits } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen footer={<Button label="Recevoir le code" icon="arrow" disabled={!valid} loading={loading} onPress={submit} />}>
      <Header back={false} listen="Tapez votre numéro de téléphone avec les touches. On vous envoie un code par SMS. Il n'y a pas de mot de passe." />
      <View style={{ gap: 8, marginTop: 8 }}>
        <T variant="hero">Votre numéro de téléphone</T>
        <T color={colors.ink2}>On vous envoie un code par SMS. Pas de mot de passe.</T>
      </View>
      <View accessible accessibilityLabel={`Numéro: ${digits.split('').join(' ') || 'vide'}`}
        style={{ height: 64, borderWidth: 2, borderColor: colors.ink, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, borderRightWidth: 1, borderRightColor: colors.line, height: 32 }}>
          <View style={{ width: 24, height: 16, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' }}>
            <View style={{ flex: 1, backgroundColor: '#F77F00' }} /><View style={{ flex: 1, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }} /><View style={{ flex: 1, backgroundColor: '#009E60' }} />
          </View>
          <T style={{ fontSize: 20, fontWeight: '700' }}>+225</T>
        </View>
        <T style={{ fontSize: 24, fontWeight: '700', letterSpacing: 0.5 }} color={digits ? colors.ink : colors.muted}>
          {digits ? groupPhone(digits) : '07 00 00 00 00'}
        </T>
      </View>
      {error && <Banner tone="alert">{error}</Banner>}
      <View style={{ flex: 1 }} />
      <Keypad value={digits} onChange={(v) => { setDigits(v); setError(null); }} maxLength={10} />
      {__DEV__ && <T variant="tiny" color={colors.muted} style={{ textAlign: 'center' }}>API : {API_URL}</T>}
    </Screen>
  );
}
