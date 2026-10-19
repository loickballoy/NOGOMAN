import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Keypad } from '@/components/Keypad';
import { OperatorBadge, OperatorPicker } from '@/components/OperatorPicker';
import { Avatar, Banner, Button, Card, Header, Pill, T } from '@/components/ui';
import { API_URL, errorMessage } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { operator as op } from '@/lib/catalog';
import { fcfa, groupPhone, initials, shortDate } from '@/lib/format';
import { useDeleteAccount, usePayouts, useUpdateMe } from '@/lib/queries';
import { colors, space } from '@/lib/theme';
import { Operator } from '@/lib/types';

export default function Profile() {
  const me = useMe();
  const { setUser, signOut } = useAuth();
  const payouts = usePayouts();
  const update = useUpdateMe();
  const deletion = useDeleteAccount();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [operator, setOperator] = useState<Operator | null>(me.payout?.operator ?? null);
  const [digits, setDigits] = useState(me.phone.replace(/^\+225/, ''));

  const isWorker = me.role === 'WORKER';
  const balance = payouts.data?.balanceXof ?? 0;
  const listen = `Profil de ${me.name}. ${me.verified ? 'Identité vérifiée.' : "Identité pas encore vérifiée."} `
    + (me.payout ? `Votre argent arrive sur ${op(me.payout.operator).name}.` : "Ajoutez votre numéro mobile money pour recevoir l'argent.")
    + (balance > 0 ? ` ${fcfa(balance)} francs sont en cours de versement.` : '');

  function save() {
    update.mutate({ payoutOperator: operator, payoutPhone: digits }, {
      onSuccess: (u) => { setUser(u); setEditing(false); },
    });
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={payouts.isRefetching} onRefresh={() => { payouts.refetch(); }} />}>
        <Header back={false} listen={listen} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={initials(me.name)} size={64} dark />
          <View style={{ flex: 1, gap: 4 }}>
            <T variant="h2">{me.name}</T>
            <T variant="small" color={colors.muted}>+225 {groupPhone(me.phone.replace(/^\+225/, ''))}</T>
            <Pill label={isWorker ? 'Travailleur' : 'Planteur'} />
          </View>
        </View>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="shield" color={me.verified ? colors.green : colors.muted} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{me.verified ? 'Identité vérifiée' : 'Identité non vérifiée'}</T>
            <T variant="tiny" color={colors.muted}>{me.verified ? 'Les autres voient le badge vert.' : 'La vérification par carte d’identité arrive bientôt.'}</T>
          </View>
        </Card>

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="user" />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{me.rating.average ? `★ ${String(me.rating.average).replace('.', ',')}` : 'Pas encore d’avis'}</T>
            <T variant="tiny" color={colors.muted}>{me.rating.count} avis · membre depuis {shortDate(me.memberSince)}</T>
          </View>
        </Card>

        <T variant="h3">{isWorker ? 'Recevoir mon argent' : 'Remboursements'}</T>
        {!editing ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {me.payout ? <OperatorBadge id={me.payout.operator} /> : <Icon name="wallet" />}
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">{me.payout ? op(me.payout.operator).name : 'Aucun numéro'}</T>
              <T variant="tiny" color={colors.muted}>{me.payout ? me.payout.phone : 'Ajoutez un numéro mobile money'}</T>
            </View>
            <Button variant="ghost" label="Changer" onPress={() => setEditing(true)} />
          </Card>
        ) : (
          <View style={{ gap: space.md }}>
            <OperatorPicker value={operator} onChange={setOperator} />
            <T style={{ fontSize: 22, fontWeight: '800' }}>+225 {groupPhone(digits) || '…'}</T>
            <Keypad value={digits} onChange={setDigits} maxLength={10} />
            {me.payout && (
              <T variant="tiny" color={colors.muted}>
                Par sécurité, les versements sont suspendus 48 h après un changement de numéro, et vous recevez un SMS.
              </T>
            )}
            {update.error && <Banner tone="alert">{errorMessage(update.error)}</Banner>}
            <Button label="Enregistrer" disabled={!operator || digits.length !== 10} loading={update.isPending} onPress={save} />
            <Button variant="ghost" label="Annuler" onPress={() => setEditing(false)} />
          </View>
        )}

        {me.payout?.heldUntil && (
          <Banner tone="pending" title="Numéro modifié">
            Par sécurité, les versements reprennent le {shortDate(me.payout.heldUntil)} à {new Date(me.payout.heldUntil).getUTCHours()} h. Si ce n’est pas vous, contactez Nogoman.
          </Banner>
        )}
        {balance > 0 && <Banner tone="pending" title={`${fcfa(balance)} FCFA`}>en cours de versement sur votre mobile money.</Banner>}
        {(payouts.data?.payouts ?? []).slice(0, 5).map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <View>
              <T variant="bodyStrong">{fcfa(p.amountXof)} FCFA</T>
              <T variant="tiny" color={colors.muted}>{shortDate(p.createdAt)} · {op(p.operator).name}</T>
            </View>
            <Pill label={p.status === 'SUCCEEDED' ? 'Reçu' : p.status === 'PENDING' ? 'En cours' : 'Échoué, nouvel essai'}
              tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'PENDING' ? 'pending' : 'alert'} />
          </View>
        ))}

        <Button variant="secondary" icon="logout" label="Se déconnecter" onPress={signOut} />
        {!confirmDelete ? (
          <Button variant="ghost" label="Supprimer mon compte" onPress={() => setConfirmDelete(true)} />
        ) : (
          <Card style={{ gap: space.md }}>
            <T variant="bodyStrong">Supprimer votre compte ?</T>
            <T variant="small" color={colors.muted}>
              Votre nom, votre numéro et vos messages seront effacés. Vos offres ouvertes seront annulées. Les reçus de paiement sont gardés, sans votre nom, comme la loi l’exige.
            </T>
            {deletion.error && <Banner tone="alert">{errorMessage(deletion.error)}</Banner>}
            <Button variant="danger" icon="trash" label="Oui, supprimer" loading={deletion.isPending}
              onPress={() => deletion.mutate(undefined, { onSuccess: () => { signOut(); } })} />
            <Button variant="ghost" label="Annuler" onPress={() => { setConfirmDelete(false); deletion.reset(); }} />
          </Card>
        )}
        {__DEV__ && <T variant="tiny" color={colors.muted} style={{ textAlign: 'center' }}>API : {API_URL}</T>}
      </ScrollView>
    </SafeAreaView>
  );
}
