import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader2 } from 'lucide-react';

import { useLang } from '../context/LanguageContext.jsx';
import Button from './ui/Button.jsx';

/**
 * LocationPicker — drop a pin on your shop.
 * ──────────────────────────────────────────────────────────────────────────
 * The most consequential screen in registration: every distance a tenant ever
 * sees for this provider is computed from this one point.
 *
 * ⚠ This component speaks (lat, lng) — Leaflet's order, and the order the rest
 * of this codebase uses. The API takes { lat, lng } too. GeoJSON's [lng, lat]
 * inversion is confined to Provider.setPoint() on the server and must never
 * leak out here.
 *
 * "আমার বর্তমান অবস্থান" is the primary action because a shopkeeper is almost
 * always standing in his shop when he registers. Dragging is the correction,
 * not the main path.
 */

// Leaflet's default marker icons resolve via relative URLs that Vite's bundler
// rewrites, so they 404 silently and the pin renders as a broken image. Point
// them at the CDN copies instead.
const PIN = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Central Dhaka. Only a starting view — never submitted as an answer, because
// a provider who never touches the map must not silently claim to be here.
const DEFAULT_CENTER = { lat: 23.7806, lng: 90.4074 };

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function Recenter({ lat, lng }) {
  const map = useMapEvents({});
  const last = useRef(null);
  useEffect(() => {
    const key = `${lat},${lng}`;
    if (lat == null || lng == null || last.current === key) return;
    last.current = key;
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }, [lat, lng, map]);
  return null;
}

const LocationPicker = ({ value, onChange }) => {
  const { t } = useLang();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  const hasPin = Number.isFinite(value?.lat) && Number.isFinite(value?.lng);
  const center = hasPin ? value : DEFAULT_CENTER;

  const locate = () => {
    if (!navigator.geolocation) {
      setGeoError(t('এই ফোনে লোকেশন পাওয়া যাচ্ছে না।', 'Location is unavailable on this device.'));
      return;
    }
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        // Permission denied or a timeout. Not a dead end — he can still tap the
        // map, so say that rather than just reporting failure.
        setGeoError(t(
          'লোকেশন পাওয়া গেল না। ম্যাপে চেপে আপনার দোকান দেখিয়ে দিন।',
          'Could not get your location. Tap the map to show your shop.',
        ));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-3">
      <Button
        variant="primary"
        size="lg"
        fullWidth
        icon={locating ? Loader2 : Crosshair}
        iconClassName={locating ? 'animate-spin' : ''}
        onClick={locate}
        disabled={locating}
      >
        {t('আমার বর্তমান অবস্থান', 'Use my current location')}
      </Button>

      {geoError ? (
        <p className="text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
          {geoError}
        </p>
      ) : null}

      <div className="rounded-2xl overflow-hidden border border-gray-200 h-72">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={hasPin ? 16 : 12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <ClickHandler onPick={onChange} />
          {hasPin ? (
            <>
              <Recenter lat={value.lat} lng={value.lng} />
              <Marker
                position={[value.lat, value.lng]}
                icon={PIN}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    onChange(lat, lng);
                  },
                }}
              />
            </>
          ) : null}
        </MapContainer>
      </div>

      <p className="text-sm text-gray-600">
        {hasPin
          ? t('পিনটি টেনে ঠিক জায়গায় বসান।', 'Drag the pin to the exact spot.')
          : t('ম্যাপে চেপে আপনার দোকান দেখান।', 'Tap the map to show your shop.')}
      </p>
    </div>
  );
};

export default LocationPicker;
