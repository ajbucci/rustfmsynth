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
export function u8ArrayToBinaryString(arr: Uint8Array): string {
  let binaryString = '';
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    binaryString += String.fromCharCode(arr[i]);
  }
  return binaryString;
}
export function binaryStringToU8Array(binaryString: string): Uint8Array {
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
