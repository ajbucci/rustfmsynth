use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct LowPassParams {
    pub cutoff: f32,
    pub q: f32,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct CombParams {
    pub alpha: f32,
    pub k: usize,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PitchedCombParams {
    pub alpha: f32,
    // No 'k' here, it's determined by frequency later
}

// #[derive(Deserialize, Serialize, Debug, Clone)]
// #[serde(tag = "type", content = "params")] // Helps Serde figure out which variant based on JS
// pub enum FilterParams {
//     // Use names that might match JS keys if possible, or map later
//     LowPassBiquad(LowPassParams),
//     Comb(CombParams),
//     PitchedComb(PitchedCombParams),
//     None, // For filters with no params
// }
