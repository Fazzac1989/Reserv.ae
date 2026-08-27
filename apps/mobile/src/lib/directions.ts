import { Linking, Platform } from 'react-native';

/**
 * Hand the venue to whatever the person already uses to get places.
 *
 * Coordinates when we have them, because a pin is unambiguous and a Dubai
 * address often is not — several of the Marina towers share a street name and
 * the map picks the wrong one.
 */
export async function openDirections(
  address: string,
  lat: number | null,
  lng: number | null,
): Promise<void> {
  const query = lat !== null && lng !== null ? `${lat},${lng}` : address;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${encodeURIComponent(query)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
  await Linking.openURL(url).catch(() => undefined);
}
