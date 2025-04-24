import {
  onMount,
  onCleanup,
  createEffect,
  createSignal,
  batch,
} from 'solid-js';
import { Store, SetStoreFunction, unwrap, reconcile } from 'solid-js/store';
import { AppState } from './state';

const DEFAULT_DEBOUNCE_MS = 500;

let debounceTimeout: number | undefined;

// --- Helpers ---
const serializeState = (state: AppState): string => {
  try {
    return encodeURIComponent(JSON.stringify(unwrap(state)));
  } catch (e) {
    console.error("URL State: Failed to serialize state:", e);
    return "";
  }
};

const deserializeState = (hash: string): AppState | null => {
  if (!hash || hash.length <= 1) return null;
  try {
    const decoded = decodeURIComponent(hash.substring(1));
    const parsed = JSON.parse(decoded);
    if (typeof parsed === 'object' && parsed !== null && 'operators' in parsed && 'algorithm' in parsed && Array.isArray(parsed.operators)) {
      return parsed as AppState;
    } else {
      console.warn("URL State: Parsed state from URL hash does not match expected AppState structure.", parsed);
      return null;
    }
  } catch (e) {
    console.error("URL State: Failed to deserialize state from URL hash:", e, "Hash was:", hash);
    return null;
  }
};


// --- Custom Hook ---

interface UrlStatePersistenceOptions {
  debounceMs?: number;
}

/**
 * Creates handlers and effects to synchronize a Solid Store with the URL fragment.
 * Returns a wrapped setter function that should be used instead of the original
 * setStore function to ensure changes trigger the persistence logic.
 *
 * @param store The Solid Store instance to sync.
 * @param setStore The original SetStoreFunction for the store.
 * @param options Configuration options like debounce time.
 * @returns A wrapped setter function.
 */
export function createUrlStatePersistence(
  store: Store<AppState>,
  setStore: SetStoreFunction<AppState>,
  options?: UrlStatePersistenceOptions
): SetStoreFunction<AppState> { // Return type is the same as setStore
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  // --- The Change Signal ---
  // We only care *that* it changed, not its value. Boolean works fine.
  const [storeChangedSignal, setStoreChangedSignal] = createSignal(false);

  // --- Update URL hash (debounced) ---
  const updateUrlHash = () => {
    clearTimeout(debounceTimeout);
    console.log(`URL State: Debounce timer cleared. Scheduling update in ${debounceMs}ms.`);
    debounceTimeout = window.setTimeout(() => {
      try {
        const stateToSave = unwrap(store);
        console.log(`+++ URL State: Debounce timeout fired after ${debounceMs}ms. Attempting to save. +++`);
        const serialized = serializeState(stateToSave);
        if (!serialized) {
          console.warn("URL State: Serialization resulted in empty string. Aborting hash update.");
          return;
        }

        const newHash = `#${serialized}`;
        // console.log(`URL State: Current hash: ${window.location.hash}, New hash would be: ${newHash}`);
        if (window.location.hash !== newHash) {
          console.log("URL State: Hashes differ. Calling history.replaceState...");
          history.replaceState(null, '', newHash);
          console.log("URL State: history.replaceState called.");
        } else {
          console.log("URL State: Hashes are the same. No update needed.");
        }
      } catch (e) {
        console.error("URL State: Error during debounced save:", e);
      }
    }, debounceMs);
  };

  // --- Load state from hash ---
  const loadStateFromHash = () => {
    console.log("URL State: Attempting to load state from hash:", window.location.hash);
    const hash = window.location.hash;
    const potentialState = deserializeState(hash);

    if (potentialState) {
      console.log("URL State: Loading state from URL hash via reconcile.");
      setStore(reconcile(potentialState));
      // IMPORTANT: After loading, trigger the signal briefly
      // This ensures the URL reflects the loaded state if it differs
      // from the default state (which wouldn't have triggered the save yet).
      // We use a quick toggle.
      batch(() => {
        console.log("URL State: Triggering save signal after loading from hash.");
        setStoreChangedSignal(true);
        setStoreChangedSignal(false); // Immediately reset, we just need the change event
      });

    } else if (hash && hash !== '#') {
      console.warn("URL State: Could not load valid state from URL hash. Using default/current state.");
    } else {
      console.log("URL State: No valid hash found. Using default/current state.");
    }
  };

  // --- Lifecycle ---
  onMount(() => {
    loadStateFromHash(); // Load initial state first
    window.addEventListener('hashchange', loadStateFromHash);
  });

  onCleanup(() => {
    window.removeEventListener('hashchange', loadStateFromHash);
    clearTimeout(debounceTimeout); // Clear pending timeout on cleanup
  });

  // --- Effect to Trigger Debounced Save ---
  // This effect ONLY listens to the dummy signal
  createEffect(() => {
    storeChangedSignal();
    console.log(">>> URL State: Store change signal detected, triggering debounced updateUrlHash. <<<");
    updateUrlHash();
  });

  // --- The Wrapped Setter Function ---
  // This is what the rest of the app will use instead of the original setStore
  const setStoreAndTriggerSave: SetStoreFunction<AppState> = (...args: any[]) => {
    // Use batch to ensure the store update and signal trigger happen
    // without intermediate renders if possible.
    batch(() => {
      console.log("Wrapped Setter: Calling original setStore...");
      // Apply the arguments to the original setter
      (setStore as any)(...args);
      console.log("Wrapped Setter: Toggling storeChangedSignal.");
      // Toggle the signal to notify the effect. Value doesn't matter.
      setStoreChangedSignal(prev => !prev);
    });
  };

  // Return the wrapped function
  return setStoreAndTriggerSave;
}
