fn main() {
    #[cfg(target_arch = "wasm32")]
    rustfmsynth::runtime::wasm::start();

    #[cfg(not(target_arch = "wasm32"))]
    rustfmsynth::runtime::native::start();
}
