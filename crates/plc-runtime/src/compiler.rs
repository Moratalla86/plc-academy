use std::collections::HashMap;

use crate::Instruction;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileError {
    pub line: usize,
    pub column: usize,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledProgram {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
    pub variables: Vec<String>,
    pub bytecode: Vec<Instruction>,
}

pub fn compile_st(source: &str) -> Result<CompiledProgram, CompileError> {
    let tokens = Lexer::new(source).tokenize()?;
    Parser::new(tokens).compile()
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum TokenKind {
    Identifier(String),
    VarInput,
    VarOutput,
    Var,
    EndVar,
    Bool(bool),
    And,
    Or,
    Not,
    Assign,
    Colon,
    Semicolon,
    LeftParen,
    RightParen,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Token {
    kind: TokenKind,
    line: usize,
    column: usize,
}

struct Lexer<'a> {
    source: &'a str,
    offset: usize,
    line: usize,
    column: usize,
}

impl<'a> Lexer<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            source,
            offset: 0,
            line: 1,
            column: 1,
        }
    }

    fn tokenize(mut self) -> Result<Vec<Token>, CompileError> {
        let mut tokens = Vec::new();
        while let Some(character) = self.peek() {
            if character.is_whitespace() {
                self.advance();
                continue;
            }

            if character == '/' && self.peek_second() == Some('/') {
                while !matches!(self.peek(), None | Some('\n')) {
                    self.advance();
                }
                continue;
            }

            if character == '(' && self.peek_second() == Some('*') {
                let line = self.line;
                let column = self.column;
                self.advance();
                self.advance();
                let mut closed = false;
                while self.peek().is_some() {
                    if self.peek() == Some('*') && self.peek_second() == Some(')') {
                        self.advance();
                        self.advance();
                        closed = true;
                        break;
                    }
                    self.advance();
                }
                if !closed {
                    return Err(CompileError {
                        line,
                        column,
                        message: "Comentario sin cerrar; se esperaba '*)'".into(),
                    });
                }
                continue;
            }

            if character.is_ascii_alphabetic() || character == '_' {
                tokens.push(self.identifier());
                continue;
            }

            let line = self.line;
            let column = self.column;
            let kind = match character {
                ':' if self.peek_second() == Some('=') => {
                    self.advance();
                    self.advance();
                    TokenKind::Assign
                }
                ':' => {
                    self.advance();
                    TokenKind::Colon
                }
                ';' => {
                    self.advance();
                    TokenKind::Semicolon
                }
                '(' => {
                    self.advance();
                    TokenKind::LeftParen
                }
                ')' => {
                    self.advance();
                    TokenKind::RightParen
                }
                _ => {
                    return Err(CompileError {
                        line,
                        column,
                        message: format!("Carácter inesperado: {character:?}"),
                    });
                }
            };
            tokens.push(Token { kind, line, column });
        }
        Ok(tokens)
    }

    fn identifier(&mut self) -> Token {
        let line = self.line;
        let column = self.column;
        let start = self.offset;
        while let Some(character) = self.peek() {
            if !character.is_ascii_alphanumeric() && character != '_' {
                break;
            }
            self.advance();
        }
        let text = self.source[start..self.offset].to_owned();
        let kind = match text.to_ascii_uppercase().as_str() {
            "VAR_INPUT" => TokenKind::VarInput,
            "VAR_OUTPUT" => TokenKind::VarOutput,
            "VAR" => TokenKind::Var,
            "END_VAR" => TokenKind::EndVar,
            "TRUE" => TokenKind::Bool(true),
            "FALSE" => TokenKind::Bool(false),
            "AND" => TokenKind::And,
            "OR" => TokenKind::Or,
            "NOT" => TokenKind::Not,
            _ => TokenKind::Identifier(text),
        };
        Token { kind, line, column }
    }

    fn peek(&self) -> Option<char> {
        self.source[self.offset..].chars().next()
    }

    fn peek_second(&self) -> Option<char> {
        self.source[self.offset..].chars().nth(1)
    }

    fn advance(&mut self) {
        let Some(character) = self.peek() else {
            return;
        };
        self.offset += character.len_utf8();
        if character == '\n' {
            self.line += 1;
            self.column = 1;
        } else {
            self.column += 1;
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeclarationKind {
    Input,
    Output,
    Variable,
}

struct Parser {
    tokens: Vec<Token>,
    cursor: usize,
    inputs: Vec<String>,
    outputs: Vec<String>,
    variables: Vec<String>,
    input_indices: HashMap<String, usize>,
    output_indices: HashMap<String, usize>,
    variable_indices: HashMap<String, usize>,
    bytecode: Vec<Instruction>,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self {
            tokens,
            cursor: 0,
            inputs: Vec::new(),
            outputs: Vec::new(),
            variables: Vec::new(),
            input_indices: HashMap::new(),
            output_indices: HashMap::new(),
            variable_indices: HashMap::new(),
            bytecode: Vec::new(),
        }
    }

    fn compile(mut self) -> Result<CompiledProgram, CompileError> {
        while matches!(
            self.current_kind(),
            Some(TokenKind::VarInput | TokenKind::VarOutput | TokenKind::Var)
        ) {
            let declaration_kind = match self.current_kind() {
                Some(TokenKind::VarInput) => DeclarationKind::Input,
                Some(TokenKind::VarOutput) => DeclarationKind::Output,
                Some(TokenKind::Var) => DeclarationKind::Variable,
                _ => unreachable!(),
            };
            self.advance();
            self.parse_declarations(declaration_kind)?;
        }

        let mut statement_count = 0;
        while self.current().is_some() {
            self.parse_assignment()?;
            statement_count += 1;
        }

        if statement_count == 0 {
            return Err(self.error_at_current("Se esperaba al menos una asignación"));
        }
        if self.outputs.is_empty() {
            return Err(self.error_at_current("Declara al menos una salida con VAR_OUTPUT"));
        }

        Ok(CompiledProgram {
            inputs: self.inputs,
            outputs: self.outputs,
            variables: self.variables,
            bytecode: self.bytecode,
        })
    }

    fn parse_declarations(
        &mut self,
        declaration_kind: DeclarationKind,
    ) -> Result<(), CompileError> {
        loop {
            if matches!(self.current_kind(), Some(TokenKind::EndVar)) {
                self.advance();
                return Ok(());
            }

            let (name, token) = self.expect_identifier("Se esperaba el nombre de la variable")?;
            self.expect_kind(TokenKind::Colon, "Se esperaba ':' después del nombre")?;
            let (type_name, type_token) = self.expect_identifier("Se esperaba el tipo BOOL")?;
            if !type_name.eq_ignore_ascii_case("BOOL") {
                return Err(Self::error(
                    &type_token,
                    format!("Tipo no soportado: {type_name}; solo se admite BOOL"),
                ));
            }
            self.expect_kind(
                TokenKind::Semicolon,
                "Se esperaba ';' al final de la declaración",
            )?;

            let key = name.to_ascii_uppercase();
            if self.input_indices.contains_key(&key)
                || self.output_indices.contains_key(&key)
                || self.variable_indices.contains_key(&key)
            {
                return Err(Self::error(&token, format!("Variable duplicada: {name}")));
            }

            match declaration_kind {
                DeclarationKind::Input => {
                    self.input_indices.insert(key, self.inputs.len());
                    self.inputs.push(name);
                }
                DeclarationKind::Output => {
                    self.output_indices.insert(key, self.outputs.len());
                    self.outputs.push(name);
                }
                DeclarationKind::Variable => {
                    self.variable_indices.insert(key, self.variables.len());
                    self.variables.push(name);
                }
            }
        }
    }

    fn parse_assignment(&mut self) -> Result<(), CompileError> {
        let (target, target_token) =
            self.expect_identifier("Se esperaba una asignación a una salida")?;
        let target_key = target.to_ascii_uppercase();
        let output_index = self.output_indices.get(&target_key).copied();
        let variable_index = self.variable_indices.get(&target_key).copied();
        let store_instruction = match (output_index, variable_index) {
            (Some(index), None) => Instruction::StoreOutput(index),
            (None, Some(index)) => Instruction::StoreVariable(index),
            _ => {
                return Err(Self::error(
                    &target_token,
                    format!("La variable '{target}' no está declarada como salida o interna"),
                ));
            }
        };
        self.expect_kind(TokenKind::Assign, "Se esperaba ':='")?;
        self.parse_or_expression()?;
        self.expect_kind(
            TokenKind::Semicolon,
            "Se esperaba ';' al final de la asignación",
        )?;
        self.bytecode.push(store_instruction);
        Ok(())
    }

    fn parse_or_expression(&mut self) -> Result<(), CompileError> {
        self.parse_and_expression()?;
        while matches!(self.current_kind(), Some(TokenKind::Or)) {
            self.advance();
            self.parse_and_expression()?;
            self.bytecode.push(Instruction::Or);
        }
        Ok(())
    }

    fn parse_and_expression(&mut self) -> Result<(), CompileError> {
        self.parse_unary_expression()?;
        while matches!(self.current_kind(), Some(TokenKind::And)) {
            self.advance();
            self.parse_unary_expression()?;
            self.bytecode.push(Instruction::And);
        }
        Ok(())
    }

    fn parse_unary_expression(&mut self) -> Result<(), CompileError> {
        if matches!(self.current_kind(), Some(TokenKind::Not)) {
            self.advance();
            self.parse_unary_expression()?;
            self.bytecode.push(Instruction::Not);
            return Ok(());
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<(), CompileError> {
        let Some(token) = self.current().cloned() else {
            return Err(self.error_at_current("Se esperaba una expresión"));
        };
        match token.kind {
            TokenKind::Identifier(ref name) => {
                self.advance();
                let key = name.to_ascii_uppercase();
                let instruction = if let Some(&index) = self.input_indices.get(&key) {
                    Instruction::LoadInput(index)
                } else if let Some(&index) = self.variable_indices.get(&key) {
                    Instruction::LoadVariable(index)
                } else if let Some(&index) = self.output_indices.get(&key) {
                    Instruction::LoadOutput(index)
                } else {
                    return Err(Self::error(&token, format!("Variable desconocida: {name}")));
                };
                self.bytecode.push(instruction);
            }
            TokenKind::Bool(value) => {
                self.advance();
                self.bytecode.push(Instruction::LoadBool(value));
            }
            TokenKind::LeftParen => {
                self.advance();
                self.parse_or_expression()?;
                self.expect_kind(
                    TokenKind::RightParen,
                    "Se esperaba ')' para cerrar la expresión",
                )?;
            }
            _ => {
                return Err(Self::error(
                    &token,
                    "Se esperaba una variable, BOOL o '('".into(),
                ))
            }
        }
        Ok(())
    }

    fn expect_identifier(&mut self, message: &str) -> Result<(String, Token), CompileError> {
        let Some(token) = self.current().cloned() else {
            return Err(self.error_at_current(message));
        };
        let TokenKind::Identifier(name) = &token.kind else {
            return Err(Self::error(&token, message.into()));
        };
        self.advance();
        Ok((name.clone(), token))
    }

    fn expect_kind(&mut self, kind: TokenKind, message: &str) -> Result<(), CompileError> {
        if self.current_kind() == Some(&kind) {
            self.advance();
            Ok(())
        } else {
            Err(self.error_at_current(message))
        }
    }

    fn current(&self) -> Option<&Token> {
        self.tokens.get(self.cursor)
    }

    fn current_kind(&self) -> Option<&TokenKind> {
        self.current().map(|token| &token.kind)
    }

    fn advance(&mut self) {
        self.cursor += 1;
    }

    fn error_at_current(&self, message: &str) -> CompileError {
        self.current().map_or_else(
            || CompileError {
                line: self.tokens.last().map_or(1, |token| token.line),
                column: self.tokens.last().map_or(1, |token| token.column + 1),
                message: message.to_owned(),
            },
            |token| Self::error(token, message.to_owned()),
        )
    }

    fn error(token: &Token, message: String) -> CompileError {
        CompileError {
            line: token.line,
            column: token.column,
            message,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Runtime;

    #[test]
    fn compiles_boolean_assignments_and_respects_operator_precedence() {
        let source = r#"
            VAR_INPUT
                Start : BOOL;
                Stop : BOOL;
            END_VAR
            VAR_OUTPUT
                Motor : BOOL;
            END_VAR
            Motor := Start OR Stop AND NOT FALSE;
        "#;
        let program = compile_st(source).unwrap();
        assert_eq!(program.inputs, ["Start", "Stop"]);
        assert_eq!(program.outputs, ["Motor"]);

        let mut runtime = Runtime::new(program.bytecode, 2, 1, 10).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, [false]);
        runtime.set_input(1, true).unwrap();
        let running = runtime.scan().unwrap();
        assert_eq!(running.outputs, [true]);
        assert_eq!(running.scan_number, 2);

        runtime.set_input(1, false).unwrap();
        let stopped = runtime.scan().unwrap();
        assert_eq!(stopped.outputs, [false]);
        assert_eq!(stopped.scan_number, 3);
    }

    #[test]
    fn accepts_parentheses_and_case_insensitive_names() {
        let source = r#"
            var_input Run : BOOL; end_var
            var_output Lamp : BOOL; end_var
            LAMP := NOT (run OR FALSE);
        "#;
        let program = compile_st(source).unwrap();
        let mut runtime = Runtime::new(program.bytecode, 1, 1, 10).unwrap();
        runtime.set_input(0, true).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, [false]);
    }

    #[test]
    fn reports_unknown_inputs_with_source_location() {
        let source = "VAR_OUTPUT\n Lamp : BOOL;\nEND_VAR\nLamp := Missing;";
        let error = compile_st(source).unwrap_err();
        assert_eq!(error.line, 4);
        assert_eq!(error.column, 9);
        assert!(error.message.contains("Missing"));
    }

    #[test]
    fn rejects_non_boolean_types() {
        let error = compile_st("VAR_INPUT\n Count : INT;\nEND_VAR").unwrap_err();
        assert!(error.message.contains("solo se admite BOOL"));
    }

    #[test]
    fn internal_variables_retain_state_between_scans_for_start_stop_latch() {
        let source = r#"
            VAR_INPUT
                Start : BOOL;
                Stop : BOOL;
            END_VAR
            VAR
                Running : BOOL;
            END_VAR
            VAR_OUTPUT
                Motor : BOOL;
            END_VAR
            Running := (Running OR Start) AND NOT Stop;
            Motor := Running;
        "#;
        let program = compile_st(source).unwrap();
        assert_eq!(program.variables, ["Running"]);
        let mut runtime = Runtime::with_variables(
            program.bytecode,
            program.inputs.len(),
            program.outputs.len(),
            program.variables.len(),
            10,
        )
        .unwrap();

        runtime.set_input(0, true).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, [true]);
        assert_eq!(runtime.variables(), [true]);

        runtime.set_input(0, false).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, [true]);

        runtime.set_input(1, true).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, [false]);
        assert_eq!(runtime.variables(), [false]);
    }

    #[test]
    fn rejects_assignment_to_input_variables() {
        let error = compile_st(
            "VAR_INPUT Start : BOOL; END_VAR\nVAR_OUTPUT Motor : BOOL; END_VAR\nStart := TRUE;",
        )
        .unwrap_err();
        assert!(error
            .message
            .contains("no está declarada como salida o interna"));
    }

    #[test]
    fn ignores_line_and_multiline_comments_in_structured_text() {
        let source = r#"
            // Entradas del panel de prácticas
            VAR_INPUT
                Start : BOOL; (* Pulsador de marcha *)
            END_VAR
            VAR_OUTPUT
                Motor : BOOL;
            END_VAR
            (* La salida sigue a la entrada
               en este ejemplo inicial. *)
            Motor := Start; // Fin del programa
        "#;

        let program = compile_st(source).unwrap();
        let mut runtime = Runtime::new(program.bytecode, 1, 1, 10).unwrap();
        runtime.set_input(0, true).unwrap();
        assert_eq!(runtime.scan().unwrap().outputs, [true]);
    }

    #[test]
    fn reports_unclosed_block_comments_with_source_location() {
        let error = compile_st("VAR_OUTPUT\nMotor : BOOL;\nEND_VAR\n(* sin cerrar").unwrap_err();

        assert_eq!(error.line, 4);
        assert_eq!(error.column, 1);
        assert!(error.message.contains("Comentario sin cerrar"));
    }
}
