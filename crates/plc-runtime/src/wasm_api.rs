use wasm_bindgen::prelude::*;

use crate::{compile_st, Runtime};

#[wasm_bindgen]
pub struct PlcMachine {
    runtime: Runtime,
    input_names: Vec<String>,
    output_names: Vec<String>,
    variable_names: Vec<String>,
}

#[wasm_bindgen]
impl PlcMachine {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str, scan_period_ms: u32) -> Result<PlcMachine, JsValue> {
        let program = compile_st(source).map_err(|error| {
            JsValue::from_str(&format!(
                "Línea {}, columna {}: {}",
                error.line, error.column, error.message
            ))
        })?;
        let runtime = Runtime::with_variables(
            program.bytecode,
            program.inputs.len(),
            program.outputs.len(),
            program.variables.len(),
            scan_period_ms,
        )
        .map_err(|error| JsValue::from_str(&format!("{error:?}")))?;
        Ok(Self {
            runtime,
            input_names: program.inputs,
            output_names: program.outputs,
            variable_names: program.variables,
        })
    }

    pub fn input_count(&self) -> u32 {
        self.input_names.len() as u32
    }

    pub fn output_count(&self) -> u32 {
        self.output_names.len() as u32
    }

    pub fn variable_count(&self) -> u32 {
        self.variable_names.len() as u32
    }

    pub fn input_name(&self, index: u32) -> Result<String, JsValue> {
        self.input_names
            .get(index as usize)
            .cloned()
            .ok_or_else(|| JsValue::from_str("Índice de entrada fuera de rango"))
    }

    pub fn output_name(&self, index: u32) -> Result<String, JsValue> {
        self.output_names
            .get(index as usize)
            .cloned()
            .ok_or_else(|| JsValue::from_str("Índice de salida fuera de rango"))
    }

    pub fn variable_name(&self, index: u32) -> Result<String, JsValue> {
        self.variable_names
            .get(index as usize)
            .cloned()
            .ok_or_else(|| JsValue::from_str("Índice de variable fuera de rango"))
    }

    pub fn set_input(&mut self, index: u32, value: bool) -> Result<(), JsValue> {
        self.runtime
            .set_input(index as usize, value)
            .map_err(|error| JsValue::from_str(&format!("{error:?}")))
    }

    pub fn scan(&mut self) -> Result<u64, JsValue> {
        self.runtime
            .scan()
            .map(|result| result.scan_number)
            .map_err(|error| JsValue::from_str(&format!("{error:?}")))
    }

    pub fn output(&self, index: u32) -> Result<bool, JsValue> {
        self.runtime
            .outputs()
            .get(index as usize)
            .copied()
            .ok_or_else(|| JsValue::from_str("Índice de salida fuera de rango"))
    }

    pub fn variable(&self, index: u32) -> Result<bool, JsValue> {
        self.runtime
            .variables()
            .get(index as usize)
            .copied()
            .ok_or_else(|| JsValue::from_str("Índice de variable fuera de rango"))
    }
}
