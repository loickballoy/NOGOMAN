import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { reversePlace, searchPlaces, shortLabel } from '@/lib/geo';
import { precisePlace } from '@/lib/location';
import { colors, radius, type } from '@/lib/theme';
import { Place } from '@/lib/types';
import { Icon } from './Icon';
import { PlaceMap } from './PlaceMap';
import { Banner, Button, Pill, T } from './ui';

/**
 * Where is the farm: current GPS position or an address search, both checked by the
 * server's geocoder. The pin can then be nudged on the map.
 */
export function PlacePicker({ value, onChange }: { value: Place | null; onChange: (p: Place | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchPlaces(q);
        if (live) { setResults(found); setError(found.length ? null : 'Aucun lieu trouvé. Essayez le nom du village ou de la ville.'); }
      } catch (e) {
        if (live) setError(errorMessage(e));
      } finally {
        if (live) setSearching(false);
      }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  async function useMyPosition() {
    setError(null);
    setLocating(true);
    try {
      const pos = await precisePlace();
      if (!pos) { setError('Activez la localisation, ou cherchez l’adresse.'); return; }
      onChange(await reversePlace(pos.lat, pos.lng));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  async function moveTo(lat: number, lng: number) {
    try {
      onChange(await reversePlace(lat, lng));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (value) {
    return (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.ink }}>
          <Icon name="pin" color={colors.green} size={26} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="bodyStrong">{value.locality}</T>
            <T variant="tiny" color={colors.muted} numberOfLines={2}>{shortLabel(value)}</T>
          </View>
          <Pill label="Vérifié" tone="success" />
        </View>
        <PlaceMap lat={value.lat} lng={value.lng} onMove={moveTo} />
        <T variant="tiny" color={colors.muted}>Déplacez le repère si la plantation est un peu plus loin.</T>
        {error && <Banner tone="alert">{error}</Banner>}
        <Button variant="ghost" label="Choisir un autre lieu" onPress={() => { onChange(null); setQuery(''); }} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Button variant="secondary" icon="locate" label="Je suis à la plantation" loading={locating} onPress={useMyPosition} />
      <T variant="label" color={colors.muted} style={{ textAlign: 'center' }}>ou</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 14 }}>
        <Icon name="pin" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Village, ville ou adresse"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Village, ville ou adresse de la plantation"
          returnKeyType="search"
          autoCorrect={false}
          maxFontSizeMultiplier={1.3}
          style={[type.body, { flex: 1, color: colors.ink, height: '100%' }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        {searching && <ActivityIndicator color={colors.ink} />}
      </View>
      {(query.trim().length >= 3 ? results : []).map((p) => (
        <Pressable key={`${p.lat},${p.lng}`} accessibilityRole="button" onPress={() => { onChange(p); setResults([]); }}
          style={({ pressed }) => [{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line }, pressed && { backgroundColor: colors.field }]}>
          <Icon name="pin" color={colors.muted} />
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">{p.locality}</T>
            <T variant="tiny" color={colors.muted} numberOfLines={2}>{p.label}</T>
          </View>
        </Pressable>
      ))}
      {error && <Banner tone="alert">{error}</Banner>}
    </View>
  );
}
