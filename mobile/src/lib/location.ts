import * as Location from 'expo-location';
import { TOWNS } from './catalog';

export interface Place { lat: number; lng: number; fromGps: boolean }

/** Current position, or Daloa if the person refuses or GPS is off. Never blocks the screen. */
export async function currentPlace(): Promise<Place> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { lat: TOWNS[0].lat, lng: TOWNS[0].lng, fromGps: false };
    const last = await Location.getLastKnownPositionAsync();
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, fromGps: true };
  } catch {
    return { lat: TOWNS[0].lat, lng: TOWNS[0].lng, fromGps: false };
  }
}

/** A fresh, precise fix for checking in at the farm. */
export async function precisePlace(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
