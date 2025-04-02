#[cfg(not(target_arch = "wasm32"))]
mod keyboard;
#[cfg(not(target_arch = "wasm32"))]
mod midi;
#[cfg(not(target_arch = "wasm32"))]
pub use self::keyboard::KeyboardHandler;
#[cfg(not(target_arch = "wasm32"))]
pub use self::midi::MidiHandler;
