const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** 2点間の距離（m） */
export const distanceInMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

/** 地点1から見た地点2の方角（北=0°、時計回り、0〜360°） */
export const bearingDegrees = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

/** 中心から radiusM の範囲を囲む緯度経度の幅（粗い絞り込み用） */
export const boundingDeltas = (latitude: number, radiusM: number) => {
  const metersPerDegreeLat = 111320;
  return {
    latDelta: radiusM / metersPerDegreeLat,
    lngDelta: radiusM / (metersPerDegreeLat * Math.cos(toRad(latitude))),
  };
};
