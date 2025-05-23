// Prelude module for conditional no_std compatibility

// fmt
#[cfg(target_arch = "wasm32")]
pub use core::fmt;
#[cfg(not(target_arch = "wasm32"))]
pub use std::fmt;

// OnceLock / OnceCell
#[cfg(target_arch = "wasm32")]
pub use once_cell::sync::OnceCell as OnceLock;
#[cfg(not(target_arch = "wasm32"))]
pub use std::sync::OnceLock;

// collections
#[cfg(target_arch = "wasm32")]
pub use hashbrown::{HashMap, HashSet};

#[cfg(not(target_arch = "wasm32"))]
pub use std::collections::{HashMap, HashSet};

// PI constant
pub use core::f32::consts::FRAC_1_SQRT_2;
pub use core::f32::consts::PI;
pub use core::f32::consts::TAU;
#[cfg(target_arch = "wasm32")]
pub fn random_range(min: f32, max: f32) -> f32 {
    fastrand::f32() * (max - min) + min
}

#[cfg(not(target_arch = "wasm32"))]
pub fn random_range(min: f32, max: f32) -> f32 {
    use rand::Rng;
    let mut rng = rand::rng();
    rng.random_range(min..max)
}
