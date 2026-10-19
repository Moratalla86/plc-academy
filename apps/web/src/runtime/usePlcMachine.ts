import { useCallback, useEffect, useRef, useState } from "react";

export type PlcMachineHandle = {
  input_count(): number;
  input_name(index: number): string;
  output_count(): number;
  output_name(index: number): string;
  variable_count(): number;
  variable_name(index: number): string;
  variable(index: number): boolean;
  ladder_latch_compatible(): boolean;
  scan_period_ms(): number;
  trace_count(): number;
  trace_line(index: number): number;
  trace_column(index: number): number;
  trace_target_kind(index: number): number;
  trace_target_index(index: number): number;
  trace_value(index: number): boolean;
  set_input(index: number, value: boolean): void;
  scan(): bigint;
  output(index: number): boolean;
  free(): void;
};

export type CompileDiagnostic = {
  line: number;
  column: number;
  message: string;
};

export type CompilerWarning = {
  line: number;
  column: number;
  message: string;
  code: string;
};

type PlcMachineModule = {
  new (source: string, scanPeriodMs: number): PlcMachineHandle;
  validate(source: string): {
    ok: boolean;
    diagnostic: CompileDiagnostic | null;
    warnings: CompilerWarning[];
  };
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

export function usePlcMachine(initialSource: string, scanPeriodMs: number) {
  const machineRef = useRef<PlcMachineHandle | null>(null);
  const moduleRef = useRef<PlcMachineModule | null>(null);
  const [ready, setReady] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const wasm = await import("../wasm/plc_runtime.js");
        await wasm.default();
        if (!mounted) return;

        const Machine = wasm.PlcMachine as PlcMachineModule;
        const machine = new Machine(initialSource, scanPeriodMs);
        moduleRef.current = Machine;
        machineRef.current = machine;
        setReady(true);
      } catch (error) {
        if (mounted) setInitializationError(errorMessage(error));
      }
    }

    void initialize();
    return () => {
      mounted = false;
      machineRef.current?.free();
      machineRef.current = null;
      moduleRef.current = null;
    };
  }, [initialSource, scanPeriodMs]);

  const createMachine = useCallback((source: string) => {
    const Machine = moduleRef.current;
    return Machine ? new Machine(source, scanPeriodMs) : null;
  }, [scanPeriodMs]);

  const validate = useCallback((source: string) => {
    return moduleRef.current?.validate(source) ?? null;
  }, []);

  return {
    createMachine,
    initializationError,
    machineRef,
    ready,
    validate,
  };
}
