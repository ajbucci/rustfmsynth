import { Component, createSignal, createResource, createMemo, Show, For, onMount, batch } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { AppState } from '../state'; // Adjust path as needed
import { appStore, setAppStore } from '../App'; // Adjust path as needed
import { createDefaultAppState } from '../defaults'; // Adjust path as needed
import * as SynthInputHandler from '../synthInputHandler'; // Adjust path as needed
import { deserializeState, serializeState } from '../urlState';
// --- Interfaces ---

interface PatchDefinition {
  name: string;
  state: AppState;
  section?: string; // Only for defaults from JSON
}

interface Patch extends PatchDefinition {
  type: 'default' | 'user';
  id: string; // Unique ID for list rendering (name + type)
}

// Represents an item in the displayed list (either a patch or a section header)
type PatchListItem =
  | { isSection: true; name: string }
  | { isSection: false; patch: Patch };


// --- Constants ---
const USER_PATCHES_STORAGE_KEY = 'userSynthPatches_v1'; // Use versioning

// --- Helper Functions ---

const loadUserPatches = (): Patch[] => {
  try {
    const stored = localStorage.getItem(USER_PATCHES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as PatchDefinition[]; // Assume stored format might miss 'type'
      // Ensure patches have the correct type and a unique ID
      return parsed.map(p => ({ ...p, type: 'user', id: `user-${p.name}` }));
    }
  } catch (error) {
    console.error("Error loading user patches from localStorage:", error);
    localStorage.removeItem(USER_PATCHES_STORAGE_KEY); // Clear corrupted data
  }
  return [];
};

const saveUserPatches = (patches: Patch[]) => {
  try {
    // Only store the necessary data (name, state), not the derived 'type' or 'id'
    const dataToStore: PatchDefinition[] = patches.map(({ name, state, section }) => ({ name, state, section }));
    localStorage.setItem(USER_PATCHES_STORAGE_KEY, JSON.stringify(dataToStore));
  } catch (error) {
    console.error("Error saving user patches to localStorage:", error);
    alert("Failed to save user patches. LocalStorage might be full or disabled.");
  }
};

const exportPatch = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(appStore, null, 2)], {
    type: "text/plain"
  }));
  a.setAttribute("download", "rustfmsynth_patch.json");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --- Component ---

const PatchManager: Component = () => {

  // --- State ---
  const [selectedPatchId, setSelectedPatchId] = createSignal<string | null>(null);
  const [userPatches, setUserPatches] = createSignal<Patch[]>([]);
  const [isSavingAsNew, setIsSavingAsNew] = createSignal(false);
  const [newPatchName, setNewPatchName] = createSignal("");
  const [editName, setEditName] = createSignal<string | null>(null); // Track which user patch name is being edited
  const [editingValue, setEditingValue] = createSignal(""); // Temporary value during edit
  const [copied, setCopied] = createSignal(false);

  // --- Resources ---
  const [defaultPatchesResource] = createResource<Patch[], string>(
    './default-patches.json', // Path relative to the public folder
    async (url) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json() as PatchDefinition[];
        // Add type and unique ID
        return data.map(p => ({ ...p, type: 'default', id: `default-${p.section || 'misc'}-${p.name}` }));
      } catch (error) {
        console.error("Error fetching default patches:", error);
        alert("Could not load default patches.");
        return []; // Return empty array on error
      }
    }
  );

  // --- Lifecycle ---
  onMount(() => {
    setUserPatches(loadUserPatches());
  });

  // --- Memos ---

  // Combine default and user patches, adding section headers
  const patchListItems = createMemo<PatchListItem[]>(() => {
    const defaults = defaultPatchesResource() ?? [];
    const users = userPatches();
    const combined: PatchListItem[] = [];
    const sections: Record<string, Patch[]> = {};

    // Group defaults by section
    defaults.forEach(patch => {
      const sectionName = patch.section || "Uncategorized Defaults";
      if (!sections[sectionName]) {
        sections[sectionName] = [];
      }
      sections[sectionName].push(patch);
    });

    // Add default sections and patches
    Object.entries(sections)
      .sort(([a], [b]) => a.localeCompare(b)) // Sort sections alphabetically
      .forEach(([sectionName, patches]) => {
        combined.push({ isSection: true, name: sectionName });
        patches
          .sort((a, b) => a.name.localeCompare(b.name)) // Sort patches within section
          .forEach(patch => combined.push({ isSection: false, patch }));
      });

    // Add user patches section header if any exist
    if (users.length > 0) {
      combined.push({ isSection: true, name: "User Patches" });
      users
        .sort((a, b) => a.name.localeCompare(b.name)) // Sort user patches
        .forEach(patch => combined.push({ isSection: false, patch }));
    }

    return combined;
  });

  const selectedPatch = createMemo<Patch | null>(() => {
    const id = selectedPatchId();
    if (!id) return null;
    const list = patchListItems(); // Depend on the combined list
    const item = list.find(item => !item.isSection && item.patch.id === id);
    return item && !item.isSection ? item.patch : null;
  });

  const canSaveCurrent = createMemo(() => {
    const patch = selectedPatch();
    return patch !== null && patch.type === 'user';
  });

  // --- Event Handlers ---

  const handleSelectPatch = (patch: Patch) => {
    batch(() => {
      // NOTE: was previously using unwrap(patch.state) here,
      // but it was causing edits to be saved into the patch,
      // so now using a deep clone
      const stateToLoad = JSON.parse(JSON.stringify(patch.state));
      setAppStore(stateToLoad); // Load the deep-cloned state
      setSelectedPatchId(patch.id);
      setIsSavingAsNew(false); // Close save as new if open
      setEditName(null); // Close name editing if open
    });
    SynthInputHandler.setSynthState(unwrap(patch.state)); // Update synth state
  };

  const handleSaveCurrent = () => {
    const currentSelectedPatch = selectedPatch();
    if (!currentSelectedPatch || currentSelectedPatch.type !== 'user') {
      console.warn("Save current called on non-user patch or no selection.");
      return;
    }

    const updatedPatches = userPatches().map(p =>
      p.id === currentSelectedPatch.id
        ? { ...p, state: unwrap(appStore) } // Update state of the selected user patch
        : p
    );
    batch(() => {
      setUserPatches(updatedPatches);
      saveUserPatches(updatedPatches);
    });
    alert(`Patch '${currentSelectedPatch.name}' saved.`);
  };

  const handleSaveAsNew = () => {
    const name = newPatchName().trim();
    if (!name) {
      alert("Please enter a name for the new patch.");
      return;
    }

    // Check for name collision (case-insensitive check is safer)
    const nameLower = name.toLowerCase();
    if (userPatches().some(p => p.name.toLowerCase() === nameLower) ||
      (defaultPatchesResource() ?? []).some(p => p.name.toLowerCase() === nameLower)) {
      alert(`A patch named "${name}" already exists. Please choose a different name.`);
      return;
    }

    const newPatch: Patch = {
      name: name,
      state: unwrap(appStore),
      type: 'user',
      id: `user-${name}` // Create a unique ID
    };

    const updatedPatches = [...userPatches(), newPatch];
    batch(() => {
      setUserPatches(updatedPatches);
      saveUserPatches(updatedPatches);
      setNewPatchName("");
      setIsSavingAsNew(false);
      setSelectedPatchId(newPatch.id); // Select the newly saved patch
    });
    alert(`Patch '${name}' saved.`);
  };

  const handleDeleteUserPatch = (patchToDelete: Patch, event: MouseEvent) => {
    event.stopPropagation(); // Prevent row selection when clicking delete
    if (patchToDelete.type !== 'user') return; // Should not happen via UI

    if (confirm(`Are you sure you want to delete the user patch "${patchToDelete.name}"?`)) {
      const updatedPatches = userPatches().filter(p => p.id !== patchToDelete.id);
      batch(() => {
        setUserPatches(updatedPatches);
        saveUserPatches(updatedPatches);
        // If the deleted patch was selected, clear selection
        if (selectedPatchId() === patchToDelete.id) {
          setSelectedPatchId(null);
        }
      });
    }
  };

  const handleInitiateEditName = (patch: Patch, event: MouseEvent) => {
    event.stopPropagation(); // Prevent row selection
    if (patch.type !== 'user') return;
    batch(() => {
      setEditName(patch.id);
      setEditingValue(patch.name);
      setSelectedPatchId(patch.id); // Also select the patch being edited
    });
    // Focus the input shortly after it's rendered
    setTimeout(() => {
      const inputElement = document.getElementById(`edit-patch-name-${patch.id}`);
      inputElement?.focus();
    }, 0);
  };

  const handleConfirmEditName = (patch: Patch, event?: MouseEvent | KeyboardEvent) => {
    event?.stopPropagation();
    const newName = editingValue().trim();
    if (!newName) {
      alert("Patch name cannot be empty.");
      setEditingValue(patch.name); // Reset to original if empty
      return;
    }
    if (newName === patch.name) {
      setEditName(null);
      return;
    }

    // Check for name collision (case-insensitive check)
    const newNameLower = newName.toLowerCase();
    const collision = userPatches().some(p => p.id !== patch.id && p.name.toLowerCase() === newNameLower) ||
      (defaultPatchesResource() ?? []).some(p => p.name.toLowerCase() === newNameLower);

    if (collision) {
      alert(`A patch named "${newName}" already exists. Please choose a different name.`);
      // Don't reset editName here, let user correct it
      return;
    }

    const updatedPatches = userPatches().map(p =>
      p.id === patch.id
        ? { ...p, name: newName, id: `user-${newName}` } // Update name AND id
        : p
    );

    batch(() => {
      setUserPatches(updatedPatches);
      saveUserPatches(updatedPatches);
      setSelectedPatchId(`user-${newName}`); // Update selection to new ID
      setEditName(null);
    });
  };

  const handleCancelEditName = (event?: MouseEvent | KeyboardEvent) => {
    event?.stopPropagation();
    setEditName(null);
    setEditingValue("");
  };

  const handleEditKeyDown = (patch: Patch, event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleConfirmEditName(patch, event);
    } else if (event.key === 'Escape') {
      handleCancelEditName(event);
    }
  };

  const handleResetToDefault = () => {
    // Simply load the default state again
    const defaultState = createDefaultAppState();
    setAppStore(unwrap(defaultState));
    setSelectedPatchId(null); // De-select any patch
    alert("Synth reset to initial default state.");
  };

  const handleImportPatch = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result);
          setAppStore(parsed);
          setSelectedPatchId(null); // De-select any patch
          SynthInputHandler.setSynthState(unwrap(parsed)); // Update synth state
        } else {
          console.error('Unexpected file reader result type');
        }
      } catch (err) {
        console.error('Invalid JSON', err);
      }
    };
    reader.readAsText(file);
  };
  const handleShareUrl = async () => {
    try {
      const encoded = serializeState(appStore);
      const url = `${window.location.origin}${window.location.pathname}#${encoded}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset copied state after 2 seconds
      console.log('Share URL copied!');
    } catch (err) {
      console.error('Failed to copy share URL', err);
    }
  };
  // --- Render ---
  return (
    <div class="patch-manager">
      <h3>Patch Manager</h3>

      <div class="patch-actions">
        <button onClick={handleSaveCurrent} disabled={!canSaveCurrent()}>
          Save Current
        </button>
        <button onClick={() => batch(() => { setIsSavingAsNew(true); setEditName(null); })}>
          Save As New...
        </button>
        <button onClick={handleResetToDefault}>
          Reset Synth
        </button>
      </div>
      <Show when={isSavingAsNew()}>
        <div class="save-as-new-form">
          <input
            type="text"
            placeholder="Enter new patch name"
            value={newPatchName()}
            onInput={(e) => setNewPatchName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveAsNew()}
            data-ignore-synth="true"
          />
          <button onClick={handleSaveAsNew}>Confirm</button>
          <button onClick={() => setIsSavingAsNew(false)}>Cancel</button>
        </div>
      </Show>

      <div class="patch-list-container">
        <ul class="patch-list">
          <Show when={defaultPatchesResource.loading}>
            <li>Loading default patches...</li>
          </Show>
          <Show when={defaultPatchesResource.error}>
            <li class="error">Error loading default patches.</li>
          </Show>
          <For each={patchListItems()}>
            {(item) => (
              <Show when={item.isSection} fallback={ // Render Patch Row
                (() => { // IIFE needed for complex fallback logic involving signals
                  const patch = (item as { isSection: false; patch: Patch }).patch;
                  const isSelected = () => selectedPatchId() === patch.id;
                  const isEditing = () => editName() === patch.id;

                  return (
                    <li
                      class="patch-item"
                      classList={{
                        'patch-default': patch.type === 'default',
                        'patch-user': patch.type === 'user',
                        'selected': isSelected() && !isEditing(), // Don't show selected style when editing input is visible
                        'editing': isEditing()
                      }}
                      onClick={() => !isEditing() && handleSelectPatch(patch)} // Prevent selection change when clicking inside edit area
                      title={patch.type === 'default' ? 'Default Patch' : 'User Patch'}
                    >
                      <Show when={!isEditing()} fallback={ // Show Edit Input
                        <div class="edit-name-container">
                          <input
                            type="text"
                            id={`edit-patch-name-${patch.id}`}
                            value={editingValue()}
                            onInput={(e) => setEditingValue(e.currentTarget.value)}
                            onKeyDown={(e) => handleEditKeyDown(patch, e)}
                            onClick={e => e.stopPropagation()} // Prevent li click handler
                            onBlur={() => handleConfirmEditName(patch)} // Save on blur
                            data-ignore-synth="true"
                          />
                          {/* <button class="edit-confirm-btn" onClick={(e) => handleConfirmEditName(patch, e)} title="Confirm rename">✓</button>
                            <button class="edit-cancel-btn" onClick={handleCancelEditName} title="Cancel rename">✕</button> */}
                          {/* Buttons removed for simplicity, relying on Enter/Blur/Escape */}
                        </div>
                      }> {/* Fallback: Show Patch Name and Actions */}
                        <span class="patch-name">{patch.name}</span>
                        <Show when={patch.type === 'user'}>
                          <div class="patch-item-actions">
                            <button style={{ width: "1em" }} class="edit-btn" title="Rename patch" onClick={(e) => handleInitiateEditName(patch, e)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                              </svg>
                            </button>
                            <button style={{ width: "1em" }} class="delete-btn" title="Delete patch" onClick={(e) => handleDeleteUserPatch(patch, e)}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </Show>
                      </Show>
                    </li>
                  );
                })() // Execute IIFE
              }>
                {/* Render Section Header */}
                <li class="patch-section-header">{(item as { isSection: true; name: string }).name}</li>
              </Show>
            )}
          </For>
          <Show when={!defaultPatchesResource.loading && patchListItems().length === 0}>
            <li>No patches found.</li>
          </Show>
        </ul>
      </div>
      <div class="patch-actions">
        <input type="file" id="file-input" accept=".json" style={{ display: "none" }} onChange={handleImportPatch} />
        <label for="file-input" class="button">
          Import...
        </label>
        <button onClick={exportPatch}>
          Export...
        </button>
        <button onClick={handleShareUrl}>
          {copied() ? "Copied!" : "Share URL"}
        </button>
      </div>
    </div>
  );
};

export default PatchManager;
