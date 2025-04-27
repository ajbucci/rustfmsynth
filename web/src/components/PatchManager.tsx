import { Component, createSignal, createResource, createMemo, Show, For, onMount, batch } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { AppState } from '../state'; // Adjust path as needed
import { appStore, setAppStore } from '../App'; // Adjust path as needed
import { createDefaultAppState } from '../defaults'; // Adjust path as needed
import * as SynthInputHandler from '../synthInputHandler'; // Adjust path as needed

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

// --- Component ---

const PatchManager: Component = () => {

  // --- State ---
  const [selectedPatchId, setSelectedPatchId] = createSignal<string | null>(null);
  const [userPatches, setUserPatches] = createSignal<Patch[]>([]);
  const [isSavingAsNew, setIsSavingAsNew] = createSignal(false);
  const [newPatchName, setNewPatchName] = createSignal("");
  const [editName, setEditName] = createSignal<string | null>(null); // Track which user patch name is being edited
  const [editingValue, setEditingValue] = createSignal(""); // Temporary value during edit

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
      setAppStore(unwrap(patch.state)); // Load the state
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
                          />
                          {/* <button class="edit-confirm-btn" onClick={(e) => handleConfirmEditName(patch, e)} title="Confirm rename">✓</button>
                            <button class="edit-cancel-btn" onClick={handleCancelEditName} title="Cancel rename">✕</button> */}
                          {/* Buttons removed for simplicity, relying on Enter/Blur/Escape */}
                        </div>
                      }> {/* Fallback: Show Patch Name and Actions */}
                        <span class="patch-name">{patch.name}</span>
                        <Show when={patch.type === 'user'}>
                          <div class="patch-item-actions">
                            <button class="edit-btn" title="Rename patch" onClick={(e) => handleInitiateEditName(patch, e)}>✏️</button>
                            <button class="delete-btn" title="Delete patch" onClick={(e) => handleDeleteUserPatch(patch, e)}>🗑️</button>
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
    </div>
  );
};

export default PatchManager;
