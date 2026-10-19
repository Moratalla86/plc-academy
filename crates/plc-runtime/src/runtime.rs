use std::fmt;

use crate::{Instruction, SourceLocation};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeError {
    InvalidScanPeriod { period_ms: u32 },
    InputOutOfRange { index: usize, input_count: usize },
    OutputOutOfRange { index: usize, output_count: usize },
    VariableOutOfRange { index: usize, variable_count: usize },
    StackUnderflow,
    NonEmptyStackAtEnd { remaining: usize },
    ScanNumberOverflow,
    InvalidSourceMap { instruction_count: usize, location_count: usize },
}

impl fmt::Display for RuntimeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidScanPeriod { period_ms } => write!(
                formatter,
                "El periodo de scan debe estar entre 1 y 100 ms; se recibió {period_ms} ms"
            ),
            Self::InputOutOfRange { index, input_count } => write!(
                formatter,
                "La entrada {index} no existe; el programa declara {input_count} entradas"
            ),
            Self::OutputOutOfRange { index, output_count } => write!(
                formatter,
                "La salida {index} no existe; el programa declara {output_count} salidas"
            ),
            Self::VariableOutOfRange { index, variable_count } => write!(
                formatter,
                "La variable interna {index} no existe; el programa declara {variable_count} variables"
            ),
            Self::StackUnderflow => write!(formatter, "Error interno: faltan operandos en la pila"),
            Self::NonEmptyStackAtEnd { remaining } => write!(
                formatter,
                "Error interno: quedaron {remaining} valores en la pila al terminar el programa"
            ),
            Self::ScanNumberOverflow => write!(formatter, "El contador de scans ha alcanzado su límite"),
            Self::InvalidSourceMap { instruction_count, location_count } => write!(
                formatter,
                "Mapa de código fuente inválido: hay {instruction_count} instrucciones y {location_count} ubicaciones"
            ),
        }
    }
}

impl std::error::Error for RuntimeError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteTarget {
    Output,
    Variable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WriteTrace {
    pub location: SourceLocation,
    pub target: WriteTarget,
    pub index: usize,
    pub value: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanResult {
    pub scan_number: u64,
    pub outputs: Vec<bool>,
    pub trace: Vec<WriteTrace>,
}

#[derive(Debug, Clone)]
pub struct Runtime {
    program: Vec<Instruction>,
    source_map: Vec<SourceLocation>,
    inputs: Vec<bool>,
    outputs: Vec<bool>,
    variables: Vec<bool>,
    scan_period_ms: u32,
    scan_number: u64,
    stack: Vec<bool>,
}

impl Runtime {
    pub fn new(
        program: Vec<Instruction>,
        input_count: usize,
        output_count: usize,
        scan_period_ms: u32,
    ) -> Result<Self, RuntimeError> {
        Self::with_variables(program, input_count, output_count, 0, scan_period_ms)
    }

    pub fn with_variables(
        program: Vec<Instruction>,
        input_count: usize,
        output_count: usize,
        variable_count: usize,
        scan_period_ms: u32,
    ) -> Result<Self, RuntimeError> {
        let source_map = vec![SourceLocation::default(); program.len()];
        Self::with_source_map(
            program,
            source_map,
            input_count,
            output_count,
            variable_count,
            scan_period_ms,
        )
    }

    pub fn with_source_map(
        program: Vec<Instruction>,
        source_map: Vec<SourceLocation>,
        input_count: usize,
        output_count: usize,
        variable_count: usize,
        scan_period_ms: u32,
    ) -> Result<Self, RuntimeError> {
        if !(1..=100).contains(&scan_period_ms) {
            return Err(RuntimeError::InvalidScanPeriod {
                period_ms: scan_period_ms,
            });
        }
        if source_map.len() != program.len() {
            return Err(RuntimeError::InvalidSourceMap {
                instruction_count: program.len(),
                location_count: source_map.len(),
            });
        }
        let stack_capacity = verify_program(&program, input_count, output_count, variable_count)?;

        Ok(Self {
            program,
            source_map,
            inputs: vec![false; input_count],
            outputs: vec![false; output_count],
            variables: vec![false; variable_count],
            scan_period_ms,
            scan_number: 0,
            stack: Vec::with_capacity(stack_capacity),
        })
    }

    pub fn set_input(&mut self, index: usize, value: bool) -> Result<(), RuntimeError> {
        let input_count = self.inputs.len();
        let Some(input) = self.inputs.get_mut(index) else {
            return Err(RuntimeError::InputOutOfRange { index, input_count });
        };
        *input = value;
        Ok(())
    }

    pub fn inputs(&self) -> &[bool] {
        &self.inputs
    }

    pub fn outputs(&self) -> &[bool] {
        &self.outputs
    }

    pub fn variables(&self) -> &[bool] {
        &self.variables
    }

    pub fn scan_period_ms(&self) -> u32 {
        self.scan_period_ms
    }

    pub fn scan_number(&self) -> u64 {
        self.scan_number
    }

    pub fn scan(&mut self) -> Result<ScanResult, RuntimeError> {
        let next_scan_number = self
            .scan_number
            .checked_add(1)
            .ok_or(RuntimeError::ScanNumberOverflow)?;
        self.stack.clear();
        let mut trace = Vec::new();

        for (instruction_index, instruction) in self.program.iter().enumerate() {
            match *instruction {
                Instruction::LoadInput(index) => {
                    let Some(value) = self.inputs.get(index) else {
                        return Err(RuntimeError::InputOutOfRange {
                            index,
                            input_count: self.inputs.len(),
                        });
                    };
                    self.stack.push(*value);
                }
                Instruction::LoadOutput(index) => {
                    let Some(value) = self.outputs.get(index) else {
                        return Err(RuntimeError::OutputOutOfRange {
                            index,
                            output_count: self.outputs.len(),
                        });
                    };
                    self.stack.push(*value);
                }
                Instruction::LoadVariable(index) => {
                    let Some(value) = self.variables.get(index) else {
                        return Err(RuntimeError::VariableOutOfRange {
                            index,
                            variable_count: self.variables.len(),
                        });
                    };
                    self.stack.push(*value);
                }
                Instruction::LoadBool(value) => self.stack.push(value),
                Instruction::And => {
                    let right = pop(&mut self.stack)?;
                    let left = pop(&mut self.stack)?;
                    self.stack.push(left && right);
                }
                Instruction::Or => {
                    let right = pop(&mut self.stack)?;
                    let left = pop(&mut self.stack)?;
                    self.stack.push(left || right);
                }
                Instruction::Not => {
                    let value = pop(&mut self.stack)?;
                    self.stack.push(!value);
                }
                Instruction::StoreOutput(index) => {
                    let value = pop(&mut self.stack)?;
                    let output_count = self.outputs.len();
                    let Some(output) = self.outputs.get_mut(index) else {
                        return Err(RuntimeError::OutputOutOfRange {
                            index,
                            output_count,
                        });
                    };
                    *output = value;
                    trace.push(WriteTrace {
                        location: self.source_map[instruction_index],
                        target: WriteTarget::Output,
                        index,
                        value,
                    });
                }
                Instruction::StoreVariable(index) => {
                    let value = pop(&mut self.stack)?;
                    let variable_count = self.variables.len();
                    let Some(variable) = self.variables.get_mut(index) else {
                        return Err(RuntimeError::VariableOutOfRange {
                            index,
                            variable_count,
                        });
                    };
                    *variable = value;
                    trace.push(WriteTrace {
                        location: self.source_map[instruction_index],
                        target: WriteTarget::Variable,
                        index,
                        value,
                    });
                }
            }
        }

        if !self.stack.is_empty() {
            return Err(RuntimeError::NonEmptyStackAtEnd {
                remaining: self.stack.len(),
            });
        }

        self.scan_number = next_scan_number;
        Ok(ScanResult {
            scan_number: self.scan_number,
            outputs: self.outputs.clone(),
            trace,
        })
    }
}

fn pop(stack: &mut Vec<bool>) -> Result<bool, RuntimeError> {
    stack.pop().ok_or(RuntimeError::StackUnderflow)
}

fn verify_program(
    program: &[Instruction],
    input_count: usize,
    output_count: usize,
    variable_count: usize,
) -> Result<usize, RuntimeError> {
    let mut depth = 0usize;
    let mut max_depth = 0usize;
    for instruction in program {
        match *instruction {
            Instruction::LoadInput(index) => {
                if index >= input_count {
                    return Err(RuntimeError::InputOutOfRange { index, input_count });
                }
                depth += 1;
            }
            Instruction::LoadOutput(index) => {
                if index >= output_count {
                    return Err(RuntimeError::OutputOutOfRange { index, output_count });
                }
                depth += 1;
            }
            Instruction::LoadVariable(index) => {
                if index >= variable_count {
                    return Err(RuntimeError::VariableOutOfRange { index, variable_count });
                }
                depth += 1;
            }
            Instruction::LoadBool(_) => depth += 1,
            Instruction::And | Instruction::Or => {
                if depth < 2 {
                    return Err(RuntimeError::StackUnderflow);
                }
                depth -= 1;
            }
            Instruction::Not => {
                if depth < 1 {
                    return Err(RuntimeError::StackUnderflow);
                }
            }
            Instruction::StoreOutput(index) => {
                if index >= output_count {
                    return Err(RuntimeError::OutputOutOfRange { index, output_count });
                }
                if depth < 1 {
                    return Err(RuntimeError::StackUnderflow);
                }
                depth -= 1;
            }
            Instruction::StoreVariable(index) => {
                if index >= variable_count {
                    return Err(RuntimeError::VariableOutOfRange { index, variable_count });
                }
                if depth < 1 {
                    return Err(RuntimeError::StackUnderflow);
                }
                depth -= 1;
            }
        }
        max_depth = max_depth.max(depth);
    }
    if depth != 0 {
        return Err(RuntimeError::NonEmptyStackAtEnd { remaining: depth });
    }
    Ok(max_depth)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_reads_inputs_and_commits_outputs() {
        let program = vec![
            Instruction::LoadInput(0),
            Instruction::LoadInput(1),
            Instruction::And,
            Instruction::StoreOutput(0),
        ];
        let mut runtime = Runtime::new(program, 2, 1, 10).unwrap();

        runtime.set_input(0, true).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, vec![false]);

        runtime.set_input(1, true).unwrap();
        let result = runtime.scan().unwrap();
        assert_eq!(result.outputs, vec![true]);
        assert_eq!(result.scan_number, 2);
        assert_eq!(runtime.scan_period_ms(), 10);
    }

    #[test]
    fn rejects_invalid_program_before_first_scan() {
        let program = vec![
            Instruction::LoadBool(true),
            Instruction::StoreOutput(0),
            Instruction::LoadInput(0),
        ];
        assert_eq!(
            Runtime::new(program, 0, 1, 10).unwrap_err(),
            RuntimeError::InputOutOfRange {
                index: 0,
                input_count: 0,
            }
        );
    }

    #[test]
    fn rejects_unbalanced_program_stack_at_load_time() {
        assert_eq!(
            Runtime::new(vec![Instruction::LoadBool(true)], 0, 0, 10).unwrap_err(),
            RuntimeError::NonEmptyStackAtEnd { remaining: 1 }
        );
    }

    #[test]
    fn accepts_scan_periods_from_one_to_one_hundred_milliseconds() {
        assert!(Runtime::new(Vec::new(), 0, 0, 1).is_ok());
        assert!(Runtime::new(Vec::new(), 0, 0, 100).is_ok());
        assert_eq!(
            Runtime::new(Vec::new(), 0, 0, 0).unwrap_err(),
            RuntimeError::InvalidScanPeriod { period_ms: 0 }
        );
        assert_eq!(
            Runtime::new(Vec::new(), 0, 0, 101).unwrap_err(),
            RuntimeError::InvalidScanPeriod { period_ms: 101 }
        );
    }

    #[test]
    fn rejects_invalid_output_index_at_load_time() {
        let program = vec![
            Instruction::LoadBool(true),
            Instruction::StoreOutput(0),
            Instruction::LoadBool(false),
            Instruction::StoreOutput(1),
        ];
        assert_eq!(
            Runtime::new(program, 0, 1, 10).unwrap_err(),
            RuntimeError::OutputOutOfRange {
                index: 1,
                output_count: 1,
            }
        );
    }

    #[test]
    fn rejects_invalid_output_after_variable_store_at_load_time() {
        let program = vec![
            Instruction::LoadBool(true),
            Instruction::StoreVariable(0),
            Instruction::LoadBool(true),
            Instruction::StoreOutput(0),
        ];
        assert_eq!(
            Runtime::with_variables(program, 0, 0, 1, 10).unwrap_err(),
            RuntimeError::OutputOutOfRange {
                index: 0,
                output_count: 0,
            }
        );
    }

    #[test]
    fn scan_counter_overflow_does_not_commit_outputs() {
        let mut runtime = Runtime::new(
            vec![Instruction::LoadBool(true), Instruction::StoreOutput(0)],
            0,
            1,
            10,
        )
        .unwrap();
        runtime.scan_number = u64::MAX;

        assert_eq!(runtime.scan(), Err(RuntimeError::ScanNumberOverflow));
        assert_eq!(runtime.outputs(), &[false]);
        assert_eq!(runtime.scan_number(), u64::MAX);
    }
}
