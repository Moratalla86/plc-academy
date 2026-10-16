use crate::Instruction;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeError {
    InvalidScanPeriod { period_ms: u32 },
    InputOutOfRange { index: usize, input_count: usize },
    OutputOutOfRange { index: usize, output_count: usize },
    VariableOutOfRange { index: usize, variable_count: usize },
    StackUnderflow,
    NonEmptyStackAtEnd { remaining: usize },
    ScanNumberOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScanResult {
    pub scan_number: u64,
    pub outputs: Vec<bool>,
}

#[derive(Debug, Clone)]
pub struct Runtime {
    program: Vec<Instruction>,
    inputs: Vec<bool>,
    outputs: Vec<bool>,
    variables: Vec<bool>,
    scan_period_ms: u32,
    scan_number: u64,
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
        if !(1..=100).contains(&scan_period_ms) {
            return Err(RuntimeError::InvalidScanPeriod {
                period_ms: scan_period_ms,
            });
        }

        Ok(Self {
            program,
            inputs: vec![false; input_count],
            outputs: vec![false; output_count],
            variables: vec![false; variable_count],
            scan_period_ms,
            scan_number: 0,
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
        let input_snapshot = self.inputs.clone();
        let mut next_outputs = self.outputs.clone();
        let mut next_variables = self.variables.clone();
        let mut stack = Vec::new();

        for instruction in &self.program {
            match *instruction {
                Instruction::LoadInput(index) => {
                    let Some(value) = input_snapshot.get(index) else {
                        return Err(RuntimeError::InputOutOfRange {
                            index,
                            input_count: input_snapshot.len(),
                        });
                    };
                    stack.push(*value);
                }
                Instruction::LoadOutput(index) => {
                    let Some(value) = next_outputs.get(index) else {
                        return Err(RuntimeError::OutputOutOfRange {
                            index,
                            output_count: next_outputs.len(),
                        });
                    };
                    stack.push(*value);
                }
                Instruction::LoadVariable(index) => {
                    let Some(value) = next_variables.get(index) else {
                        return Err(RuntimeError::VariableOutOfRange {
                            index,
                            variable_count: next_variables.len(),
                        });
                    };
                    stack.push(*value);
                }
                Instruction::LoadBool(value) => stack.push(value),
                Instruction::And => {
                    let right = pop(&mut stack)?;
                    let left = pop(&mut stack)?;
                    stack.push(left && right);
                }
                Instruction::Or => {
                    let right = pop(&mut stack)?;
                    let left = pop(&mut stack)?;
                    stack.push(left || right);
                }
                Instruction::Not => {
                    let value = pop(&mut stack)?;
                    stack.push(!value);
                }
                Instruction::StoreOutput(index) => {
                    let value = pop(&mut stack)?;
                    let output_count = next_outputs.len();
                    let Some(output) = next_outputs.get_mut(index) else {
                        return Err(RuntimeError::OutputOutOfRange {
                            index,
                            output_count,
                        });
                    };
                    *output = value;
                }
                Instruction::StoreVariable(index) => {
                    let value = pop(&mut stack)?;
                    let variable_count = next_variables.len();
                    let Some(variable) = next_variables.get_mut(index) else {
                        return Err(RuntimeError::VariableOutOfRange {
                            index,
                            variable_count,
                        });
                    };
                    *variable = value;
                }
            }
        }

        if !stack.is_empty() {
            return Err(RuntimeError::NonEmptyStackAtEnd {
                remaining: stack.len(),
            });
        }

        self.outputs = next_outputs;
        self.variables = next_variables;
        self.scan_number = next_scan_number;
        Ok(ScanResult {
            scan_number: self.scan_number,
            outputs: self.outputs.clone(),
        })
    }
}

fn pop(stack: &mut Vec<bool>) -> Result<bool, RuntimeError> {
    stack.pop().ok_or(RuntimeError::StackUnderflow)
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
    fn failed_scan_does_not_commit_partial_outputs_or_advance_counter() {
        let program = vec![
            Instruction::LoadBool(true),
            Instruction::StoreOutput(0),
            Instruction::LoadInput(0),
        ];
        let mut runtime = Runtime::new(program, 0, 1, 10).unwrap();

        assert_eq!(
            runtime.scan(),
            Err(RuntimeError::InputOutOfRange {
                index: 0,
                input_count: 0,
            })
        );
        assert_eq!(runtime.outputs(), &[false]);
        assert_eq!(runtime.scan_number(), 0);
    }

    #[test]
    fn rejects_unbalanced_program_stack() {
        let mut runtime = Runtime::new(vec![Instruction::LoadBool(true)], 0, 0, 10).unwrap();

        assert_eq!(
            runtime.scan(),
            Err(RuntimeError::NonEmptyStackAtEnd { remaining: 1 })
        );
        assert_eq!(runtime.scan_number(), 0);
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
    fn output_range_error_does_not_commit_or_advance_scan() {
        let program = vec![
            Instruction::LoadBool(true),
            Instruction::StoreOutput(0),
            Instruction::LoadBool(false),
            Instruction::StoreOutput(1),
        ];
        let mut runtime = Runtime::new(program, 0, 1, 10).unwrap();

        assert_eq!(
            runtime.scan(),
            Err(RuntimeError::OutputOutOfRange {
                index: 1,
                output_count: 1,
            })
        );
        assert_eq!(runtime.outputs(), &[false]);
        assert_eq!(runtime.scan_number(), 0);
    }

    #[test]
    fn failed_scan_does_not_commit_internal_variable_state() {
        let program = vec![
            Instruction::LoadBool(true),
            Instruction::StoreVariable(0),
            Instruction::LoadBool(true),
            Instruction::StoreOutput(0),
        ];
        let mut runtime = Runtime::with_variables(program, 0, 0, 1, 10).unwrap();

        assert_eq!(
            runtime.scan(),
            Err(RuntimeError::OutputOutOfRange {
                index: 0,
                output_count: 0,
            })
        );
        assert_eq!(runtime.variables(), &[false]);
        assert_eq!(runtime.scan_number(), 0);
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
