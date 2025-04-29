import {
  onMount,
  onCleanup,
  createEffect,
  createSignal,
  batch,
} from 'solid-js';
import { Store, SetStoreFunction, unwrap, reconcile } from 'solid-js/store';
import { AppState } from './state';
import { strToU8, strFromU8, deflateSync, inflateSync } from 'fflate';
import { binaryStringToU8Array, u8ArrayToBinaryString } from './utils';
const DEFAULT_DEBOUNCE_MS = 500;

let debounceTimeout: number | undefined;

// --- Helpers ---
export const serializeState = (state: AppState): string => {
  try {
    const jsonString = JSON.stringify(unwrap(state));
    const jsonU8 = strToU8(jsonString);
    const compressedU8 = deflateSync(jsonU8);
    const binaryString = u8ArrayToBinaryString(compressedU8);
    const base64String = btoa(binaryString);
    return encodeURIComponent(base64String);
  } catch (e) {
    console.error("URL State: Failed to serialize and compress state:", e);
    return "";
  }
};

export const deserializeState = (hash: string): AppState | null => {
  if (!hash || hash.length <= 1) return null;

  console.log(hash);
  let potentialJsonString: string | null = null;

  try {
    const base64String = decodeURIComponent(hash);
    const binaryString = atob(base64String);
    const compressedU8 = binaryStringToU8Array(binaryString);

    // --- Attempt Decompression ---
    try {
      const decompressedU8 = inflateSync(compressedU8);
      potentialJsonString = strFromU8(decompressedU8);
      console.log("URL State: Successfully decompressed state from hash.");
    } catch (inflateError) {
      console.warn("URL State: Failed to decompress hash data, attempting to parse as raw JSON string.", inflateError);
      // If decompression fails, maybe it's an old link or non-compressed data.
      // The result of atob (binaryString) *might* be the original JSON string
      // if it only contained characters representable in Latin1.
      // We'll try parsing it directly in the next step.
      // Note: If the original JSON had characters outside Latin1, atob might corrupt it.
      // This fallback is best-effort for simpler JSON or older links.
      potentialJsonString = binaryString; // Treat the atob result as potential JSON
    }

    // --- Attempt Parsing ---
    if (potentialJsonString) {
      const parsed = JSON.parse(potentialJsonString);

      if (typeof parsed === 'object' && parsed !== null && 'operators' in parsed && 'algorithm' in parsed && Array.isArray(parsed.operators)) {
        console.log("URL State: Parsed state from hash looks valid.");
        return parsed as AppState;
      } else {
        console.warn("URL State: Parsed state from URL hash does not match expected AppState structure.", parsed);
        return null;
      }
    } else {
      // Should not happen if binaryString existed, but good practice
      console.warn("URL State: Could not obtain a potential JSON string after decoding/decompression attempt.");
      return null;
    }

  } catch (e) {
    // Catch errors from decodeURIComponent, atob, JSON.parse etc.
    console.error("URL State: Failed to deserialize state from URL hash:", e, "Hash was:", hash);
    return null;
  }
};
