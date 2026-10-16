#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Instruction {
    LoadInput(usize),
    LoadOutput(usize),
    LoadVariable(usize),
    LoadBool(bool),
    And,
    Or,
    Not,
    StoreOutput(usize),
    StoreVariable(usize),
}
