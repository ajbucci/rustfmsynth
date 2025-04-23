export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
export function objToJsonBytes(obj: Object) {
  const jsonString = JSON.stringify(obj);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(jsonString);
  return jsonBytes;
}
export function stringToBytes(str: string) {
  return new TextEncoder().encode(str);
}
