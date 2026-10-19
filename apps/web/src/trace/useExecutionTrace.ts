import { useCallback, useEffect, useRef, useState } from "react";

export type AssignmentTrace = {
  line: number;
  column: number;
  targetKind: number;
  targetIndex: number;
  value: boolean;
};

export function useExecutionTrace() {
  const timersRef = useRef<number[]>([]);
  const inProgressRef = useRef(false);
  const [executionTrace, setExecutionTrace] = useState<AssignmentTrace[]>([]);
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
  const [activeStatementLine, setActiveStatementLine] = useState<number | null>(
    null,
  );
  const [activeAssignmentTarget, setActiveAssignmentTarget] = useState<
    string | null
  >(null);
  const [isScanning, setIsScanning] = useState(false);

  const clear = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    inProgressRef.current = false;
    setIsScanning(false);
    setActiveTraceIndex(null);
    setActiveStatementLine(null);
    setActiveAssignmentTarget(null);
  }, []);

  const reset = useCallback(() => {
    clear();
    setExecutionTrace([]);
  }, [clear]);

  const record = useCallback((
    assignments: AssignmentTrace[],
    animate: boolean,
    outputNames: string[],
    variableNames: string[],
  ) => {
    setExecutionTrace(assignments);
    if (!animate || assignments.length === 0) return;

    inProgressRef.current = true;
    setIsScanning(true);
    assignments.forEach((assignment, index) => {
      const timer = window.setTimeout(() => {
        setActiveTraceIndex(index);
        setActiveStatementLine(assignment.line - 1);
        const targetNames = assignment.targetKind === 0 ? outputNames : variableNames;
        setActiveAssignmentTarget(targetNames[assignment.targetIndex] ?? null);
        if (index === assignments.length - 1) {
          const finishTimer = window.setTimeout(() => {
            setActiveTraceIndex(null);
            setActiveStatementLine(null);
            setActiveAssignmentTarget(null);
            setIsScanning(false);
            inProgressRef.current = false;
            timersRef.current = [];
          }, 280);
          timersRef.current.push(finishTimer);
        }
      }, index * 360);
      timersRef.current.push(timer);
    });
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach(window.clearTimeout);
  }, []);

  return {
    activeAssignmentTarget,
    activeStatementLine,
    activeTraceIndex,
    clear,
    executionTrace,
    inProgressRef,
    isScanning,
    record,
    reset,
  };
}
