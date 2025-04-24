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
/**
 * Formats a number to a string with at least a minimum number of decimal places,
 * without truncating existing precision.
 * @param num The number to format.
 * @param minDecimalPlaces The minimum number of decimal places to show.
 * @returns The formatted string.
 */
export function formatNumberToMinDecimals(num: number | null | undefined, minDecimalPlaces: number): string {
  if (num == null || isNaN(num)) {
    // Handle null, undefined, NaN - return empty or a placeholder?
    // Let's return a default representation or empty based on context.
    // For now, let's treat it like 0 for formatting if needed, or maybe return ""
    // If we treat as 0: num = 0; else return "";
    num = num ?? 0; // Coalesce null/undefined to 0 for formatting below
    if (isNaN(num)) return "NaN"; // Explicitly show NaN
  }

  // Ensure minDecimalPlaces is a non-negative integer
  minDecimalPlaces = Math.max(0, Math.floor(minDecimalPlaces));

  const numAsString = String(num);
  const decimalPointIndex = numAsString.indexOf('.');

  if (decimalPointIndex === -1) {
    // Integer or became integer string (e.g. 1.0 -> "1")
    if (minDecimalPlaces === 0) {
      return numAsString; // No decimals needed
    }
    return `${numAsString}.${'0'.repeat(minDecimalPlaces)}`;
  } else {
    // Number has a decimal part
    const existingDecimalPlaces = numAsString.length - decimalPointIndex - 1;
    if (existingDecimalPlaces >= minDecimalPlaces) {
      return numAsString; // Already has enough or more decimals
    } else {
      // Needs padding
      const zerosToAdd = minDecimalPlaces - existingDecimalPlaces;
      return `${numAsString}${'0'.repeat(zerosToAdd)}`;
    }
  }
}
