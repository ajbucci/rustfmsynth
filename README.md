# An FM Synthesizer written in Rust

A fun project to learn Rust, WASM, and make some noise.

Web app: <https://ajbucci.github.io/rustfmsynth/>

## Input Modes

### Native

- QWERTY
- MIDI

### WASM

- QWERTY
- (MIDI coming soon)

## Building

### Native

Tested on MacOS and Linux.

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone repo
git clone https://github.com/ajbucci/rustfmsynth_public.git

# Change directory
cd rustfmsynth_public

# Build/run debug version
cargo run

# Optionally build and run --release for more performance
cargo build --release
./target/release/rustfmsynth
```

### WASM

```bash
# Dependencies: wasm-pack
wasm-pack build --target web --out-dir ./src/wasm/pkg --no-default-features --features wasm
```
