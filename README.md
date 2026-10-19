# PLC Academy

Entorno educativo para aprender programación de PLC con Structured Text, un runtime Rust
compilado a WebAssembly y una planta virtual. El estado actual y las decisiones de producto
se describen en [el documento de diseño](docs/diseno.md).

## Requisitos

- Node.js 20 o posterior y npm
- Rust estable con Cargo
- `wasm-pack` (se instala como dependencia del proyecto web)
- El target `wasm32-unknown-unknown` de Rust

## Instalar y ejecutar

```sh
rustup target add wasm32-unknown-unknown
npm --prefix apps/web install
npm --prefix apps/web run dev
```

Vite muestra en la terminal la URL local de la aplicación.

## Verificaciones

```sh
cargo test -p plc-runtime
npm --prefix apps/web test
npm --prefix apps/web run build
```
