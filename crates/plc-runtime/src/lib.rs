mod bytecode;
mod compiler;
mod runtime;

#[cfg(target_arch = "wasm32")]
mod wasm_api;

pub use bytecode::Instruction;
pub use compiler::{compile_st, CompileError, CompiledProgram};
pub use runtime::{Runtime, RuntimeError, ScanResult};
