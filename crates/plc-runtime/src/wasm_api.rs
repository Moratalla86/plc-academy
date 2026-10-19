use js_sys::{Array, Object, Reflect};
use wasm_bindgen::prelude::*;

use crate::{compile_st, Runtime, RuntimeError, WriteTarget, WriteTrace};

#[wasm_bindgen]
pub struct PlcMachine {
    runtime: Runtime,
    input_names: Vec<String>,
    output_names: Vec<String>,
    variable_names: Vec<String>,
    trace: Vec<WriteTrace>,
    ladder_latch_compatible: bool,
}

fn set_property(object: &Object, name: &str, value: &JsValue) -> Result<(), JsValue> {
    Reflect::set(object, &JsValue::from_str(name), value).map(|_| ())
}

fn compile_error_value(line: usize, column: usize, message: &str) -> JsValue {
    let error = Object::new();
    let _ = set_property(&error, "kind", &JsValue::from_str("compile"));
    let _ = set_property(&error, "line", &JsValue::from_f64(line as f64));
    let _ = set_property(&error, "column", &JsValue::from_f64(column as f64));
    let _ = set_property(&error, "message", &JsValue::from_str(message));
    error.into()
}

fn runtime_error_value(error: RuntimeError) -> JsValue {
    let object = Object::new();
    let _ = set_property(&object, "kind", &JsValue::from_str("runtime"));
    let _ = set_property(&object, "message", &JsValue::from_str(&error.to_string()));
    object.into()
}

fn warning_value(warning: &crate::CompilerWarning) -> JsValue {
    let object = Object::new();
    let _ = set_property(&object, "code", &JsValue::from_str(&warning.code));
    let _ = set_property(&object, "line", &JsValue::from_f64(warning.line as f64));
    let _ = set_property(&object, "column", &JsValue::from_f64(warning.column as f64));
    let _ = set_property(&object, "message", &JsValue::from_str(&warning.message));
    object.into()
}

#[wasm_bindgen]
impl PlcMachine {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str, scan_period_ms: u32) -> Result<PlcMachine, JsValue> {
        let program = compile_st(source).map_err(|error| {
            compile_error_value(error.line, error.column, &error.message)
        })?;
        let ladder_latch_compatible = program.supports_ladder_latch_view();
        let runtime = Runtime::with_source_map(
            program.bytecode,
            program.source_map,
            program.inputs.len(),
            program.outputs.len(),
            program.variables.len(),
            scan_period_ms,
        )
        .map_err(runtime_error_value)?;
        Ok(Self {
            runtime,
            input_names: program.inputs,
            output_names: program.outputs,
            variable_names: program.variables,
            trace: Vec::new(),
            ladder_latch_compatible,
        })
    }

    pub fn validate(source: &str) -> JsValue {
        match compile_st(source) {
            Ok(program) => {
                let result = Object::new();
                let _ = set_property(&result, "ok", &JsValue::TRUE);
                let _ = set_property(&result, "diagnostic", &JsValue::NULL);
                let warnings = Array::new();
                for warning in &program.warnings {
                    warnings.push(&warning_value(warning));
                }
                let _ = set_property(&result, "warnings", &warnings.into());
                result.into()
            }
            Err(error) => {
                let result = Object::new();
                let _ = set_property(&result, "ok", &JsValue::FALSE);
                let diagnostic = compile_error_value(error.line, error.column, &error.message);
                let _ = set_property(&result, "diagnostic", &diagnostic);
                let _ = set_property(&result, "warnings", &Array::new().into());
                result.into()
            }
        }
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

    pub fn ladder_latch_compatible(&self) -> bool {
        self.ladder_latch_compatible
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
            .map_err(runtime_error_value)
    }

    pub fn scan(&mut self) -> Result<u64, JsValue> {
        let result = self.runtime.scan().map_err(runtime_error_value)?;
        self.trace = result.trace;
        Ok(result.scan_number)
    }

    pub fn scan_period_ms(&self) -> u32 {
        self.runtime.scan_period_ms()
    }

    pub fn trace_count(&self) -> u32 {
        self.trace.len() as u32
    }

    pub fn trace_line(&self, index: u32) -> Result<u32, JsValue> {
        self.trace
            .get(index as usize)
            .map(|event| event.location.line as u32)
            .ok_or_else(|| JsValue::from_str("Índice de traza fuera de rango"))
    }

    pub fn trace_column(&self, index: u32) -> Result<u32, JsValue> {
        self.trace
            .get(index as usize)
            .map(|event| event.location.column as u32)
            .ok_or_else(|| JsValue::from_str("Índice de traza fuera de rango"))
    }

    pub fn trace_target_kind(&self, index: u32) -> Result<u8, JsValue> {
        self.trace
            .get(index as usize)
            .map(|event| match event.target {
                WriteTarget::Output => 0,
                WriteTarget::Variable => 1,
            })
            .ok_or_else(|| JsValue::from_str("Índice de traza fuera de rango"))
    }

    pub fn trace_target_index(&self, index: u32) -> Result<u32, JsValue> {
        self.trace
            .get(index as usize)
            .map(|event| event.index as u32)
            .ok_or_else(|| JsValue::from_str("Índice de traza fuera de rango"))
    }

    pub fn trace_value(&self, index: u32) -> Result<bool, JsValue> {
        self.trace
            .get(index as usize)
            .map(|event| event.value)
            .ok_or_else(|| JsValue::from_str("Índice de traza fuera de rango"))
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
