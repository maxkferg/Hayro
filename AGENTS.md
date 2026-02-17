# AGENTS.md

This document explains how to develop and validate changes in this repository.
Use it as the source of truth for local development expectations before opening a PR.

## Rust toolchain (must match CI)

CI uses `dtolnay/rust-toolchain@1.92.0`, so local development should use:

- Rust `1.92.0`
- `clippy` and `rustfmt` components
- `thumbv6m-none-eabi` target (for `no_std` checks)

## Development environment setup

From the repository root:

```bash
# Install the exact Rust version used by CI
rustup toolchain install 1.92.0

# Add required components and target for this toolchain
rustup component add --toolchain 1.92.0 clippy rustfmt
rustup target add --toolchain 1.92.0 thumbv6m-none-eabi

# Pin this repository to the CI toolchain
rustup override set 1.92.0

# Required for the CI feature-matrix check
cargo install cargo-hack
```

Verify:

```bash
rustc --version
cargo --version
cargo hack --version
```

## Required checks before opening a PR

Run all commands below from the repository root.
These mirror `.github/workflows/ci.yml`.

### 1) Linting, formatting, docs, and feature checks

```bash
RUSTFLAGS="-D warnings" cargo clippy --workspace --exclude hayro-demo --tests --examples
cargo fmt --check --all
RUSTFLAGS="-D warnings" cargo doc --workspace --exclude hayro-demo --no-deps
RUSTFLAGS="-D warnings" cargo hack check --each-feature --workspace --exclude hayro-demo
```

### 2) `no_std` compatibility checks

```bash
cargo check -p hayro-ccitt --target thumbv6m-none-eabi
cargo check -p hayro-font --no-default-features --target thumbv6m-none-eabi
cargo check -p hayro-jbig2 --no-default-features --target thumbv6m-none-eabi
cargo check -p hayro-jpeg2000 --no-default-features --target thumbv6m-none-eabi
cargo check -p hayro-syntax --no-default-features --target thumbv6m-none-eabi
```

### 3) CI test suite currently required for PRs

```bash
cargo test -p hayro-tests -- "load::"
```

## How to run tests locally

- Run the CI-required regression load tests:

  ```bash
  cargo test -p hayro-tests -- "load::"
  ```

- Run all tests in a specific crate:

  ```bash
  cargo test -p <crate-name>
  ```

- Run a specific test by name filter:

  ```bash
  cargo test -p hayro-tests -- "<test_name_or_filter>"
  ```
