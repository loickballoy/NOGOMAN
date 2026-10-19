import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Keypad } from '@/components/Keypad';
import { OperatorPicker } from '@/components/OperatorPicker';
import { Banner, Button, Header, Loading, Screen, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fcfa, groupPhone } from '@/lib/format';
import { useApiMutation, usePayment, useQuote } from '@/lib/queries';
import { colors, radius, space } from '@/lib/theme';
import { Operator, Payment } from '@/lib/types';

/** "Sécuriser le paiement": the farmer pays the escrow for every hired worker in one go. */
export default function FundScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const me = useMe();
  const quote = useQuote(jobId);
  const [operator, setOperator] = useState<Operator | null>(me.payout?.operator ?? null);
  const [digits, setDigits] = useState(me.phone.replace(/^\+225/, ''));
  const [editPhone, setEditPhone] = useState(false);
  const [paymentId, setPaymentId] = useState<string>();
  const payment = usePayment(paymentId);

  const pay = useApiMutation(() => api<Payment>(`/jobs/${jobId}/funding`, { method: 'POST', body: { operator, phone: digits } }));
  // Only the development backend accepts this: it plays the payment provider's confirmation.
  const simulate = useApiMutation(() => api(`/dev/payments/collection/${paymentId}/simulate`, { method: 'POST', body: { status: 'SUCCEEDED' } }));

  if (quote.isLoading) return <Screen><Loading /></Screen>;
  if (!quote.data) return <Screen><Header listen="Erreur." /><Banner tone="alert">{errorMessage(quote.error)}</Banner></Screen>;
  const q = quote.data;

  const status = payment.data?.status ?? (paymentId ? 'PENDING' : undefined);
  if (status === 'SUCCEEDED') {
    return (
      <Screen footer={<Button label="Voir la mission" onPress={() => router.replace(`/job/${jobId}`)} />}>
        <Header listen={`Paiement reçu. ${fcfa(q.totalXof)} francs sont bloqués chez Nogoman. Les travailleurs peuvent commencer.`} back={false} />
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <Banner tone="success" title="Paiement reçu.">{fcfa(q.totalXof)} FCFA sont bloqués chez Nogoman. Les travailleurs peuvent commencer.</Banner>
          <T color={colors.ink2}>Chaque soir, confirmez la journée : chacun est payé sur son mobile money.</T>
        </View>
      </Screen>
    );
  }

  if (status === 'PENDING') {
    return (
      <Screen footer={__DEV__ ? <Button variant="secondary" label="Simuler la confirmation (test)" loading={simulate.isPending} onPress={() => simulate.mutate(undefined, { onSuccess: () => payment.refetch() })} /> : undefined}>
        <Header listen="Confirmez le paiement sur votre téléphone. Composez votre code secret mobile money quand on vous le demande." back={false} />
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <Loading />
          <T variant="title" style={{ textAlign: 'center' }}>Confirmez sur votre téléphone</T>
          <T color={colors.ink2} style={{ textAlign: 'center' }}>Tapez votre code secret mobile money quand on vous le demande. Cette page se met à jour toute seule.</T>
          {simulate.error && <Banner tone="alert">{errorMessage(simulate.error)}</Banner>}
        </View>
      </Screen>
    );
  }

  const listen = `Sécuriser le paiement. ${q.workers} travailleur${q.workers > 1 ? 's' : ''}, ${fcfa(q.subtotalXof)} francs, plus ${fcfa(q.feeXof)} francs de frais. Total : ${fcfa(q.totalXof)} francs. `
    + "L'argent reste bloqué chez Nogoman et n'est versé aux travailleurs que quand vous confirmez le travail. Choisissez votre mobile money, puis touchez Payer.";

  return (
    <Screen footer={<Button icon="lock" label={`Payer ${fcfa(q.totalXof)} FCFA`} disabled={!operator || digits.length !== 10}
      loading={pay.isPending} onPress={() => pay.mutate(undefined, { onSuccess: (p) => setPaymentId(p.id) })} />}>
      <Header listen={listen} />
      <T variant="title">Sécuriser le paiement</T>
      <View style={{ backgroundColor: colors.field, borderRadius: radius.xl, padding: 18, gap: 10 }}>
        <Row label={`${q.workers} × ${q.unitsPerWorker} ${q.unitsPerWorker > 1 ? 'jours' : 'tâche'} × ${fcfa(q.rateXof)}`} value={fcfa(q.subtotalXof)} />
        <Row label={`Frais Nogoman (${(q.feeBps / 100).toString().replace('.', ',')} %)`} value={fcfa(q.feeXof)} />
        <View style={{ height: 1, backgroundColor: '#D6D9D6' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T variant="bodyStrong">Total</T>
          <T style={{ fontSize: 30, fontWeight: '800' }}>{fcfa(q.totalXof)} <T variant="label">FCFA</T></T>
        </View>
        <Banner tone="success">L’argent reste bloqué chez Nogoman. Il est versé aux travailleurs seulement quand vous confirmez le travail.</Banner>
      </View>
      <T variant="bodyStrong">Payer avec</T>
      <OperatorPicker value={operator} onChange={setOperator} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <T variant="label" color={colors.muted}>Numéro qui paie</T>
          <T style={{ fontSize: 20, fontWeight: '800' }}>+225 {groupPhone(digits) || '…'}</T>
        </View>
        <Button variant="ghost" label={editPhone ? 'OK' : 'Changer'} onPress={() => setEditPhone(!editPhone)} />
      </View>
      {editPhone && <Keypad value={digits} onChange={setDigits} maxLength={10} />}
      {pay.error && <Banner tone="alert">{errorMessage(pay.error)}</Banner>}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <T variant="small" color={colors.ink2} style={{ flex: 1 }}>{label}</T>
      <T variant="bodyStrong">{value}</T>
    </View>
  );
}
