import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Keypad } from '@/components/Keypad';
import { Banner, Button, Header, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { groupPhone } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { SelfUser } from '@/lib/types';

const RESEND_AFTER = 30;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_AFTER);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(value: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ accessToken: string; refreshToken: string; user: SelfUser }>(
        '/auth/otp/verify', { method: 'POST', body: { phone, code: value } },
      );
      await signIn({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api('/auth/otp/request', { method: 'POST', body: { phone } });
      setWait(RESEND_AFTER);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function onChange(v: string) {
    setCode(v);
    setError(null);
    if (v.length === 6) verify(v);
  }

  return (
    <Screen footer={wait > 0
      ? <T variant="label" color={colors.muted} style={{ textAlign: 'center', paddingVertical: 14 }}>Nouveau code possible dans {wait} s</T>
      : <Button variant="secondary" label="Renvoyer le code" onPress={resend} />}>
      <Header listen={`Tapez le code à 6 chiffres reçu par SMS au ${groupPhone(phone ?? '')}.`} />
      <View style={{ gap: 8 }}>
        <T variant="hero">Le code reçu par SMS</T>
        <T color={colors.ink2}>Envoyé au <T variant="bodyStrong">+225 {groupPhone(phone ?? '')}</T></T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }} accessible accessibilityLabel={`Code: ${code.split('').join(' ') || 'vide'}`}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 64, borderRadius: radius.md, borderWidth: 2,
            borderColor: i === code.length ? colors.ink : colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <T style={{ fontSize: 28, fontWeight: '800' }}>{code[i] ?? ''}</T>
          </View>
        ))}
      </View>
      {loading && <Banner tone="info">Vérification…</Banner>}
      {error && <Banner tone="alert">{error}</Banner>}
      <View style={{ flex: 1 }} />
      <Keypad value={code} onChange={onChange} maxLength={6} />
    </Screen>
  );
}
