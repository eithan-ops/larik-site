declare module "geoip-country" {
  export interface GeoResult { country: string; name?: string; continent?: string }
  export function lookup(ip: string): GeoResult | null;
  const geoip: { lookup: typeof lookup };
  export default geoip;
}
