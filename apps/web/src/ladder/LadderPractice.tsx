import { useState, type DragEvent } from "react";

export type LadderElementKind = "contact-no" | "contact-nc" | "coil";

export type LadderElement = {
  id: number;
  kind: LadderElementKind;
};

export function LadderPractice({
  activeRung,
  start,
  stop,
  running,
  motor,
  rungResults,
  inputsPending,
  elements,
  onAddElement,
  onRemoveElement,
  onClearElements,
}: {
  activeRung: number | null;
  start: boolean;
  stop: boolean;
  running: boolean;
  motor: boolean;
  rungResults: boolean[];
  inputsPending: boolean;
  elements: Record<number, LadderElement[]>;
  onAddElement: (rung: number, kind: LadderElementKind) => void;
  onRemoveElement: (rung: number, id: number) => void;
  onClearElements: () => void;
}) {
  const rungOneEnergized = rungResults[0] ?? running;
  const rungTwoEnergized = rungResults[1] ?? motor;
  const displayedRunning = running;
  const displayedMotor = motor;
  const rungOneElements = elements[0] ?? [];
  const rungTwoElements = elements[1] ?? [];
  const rungOneCoilX = 565 + rungOneElements.length * 82;
  const rungTwoCoilX = 565 + rungTwoElements.length * 82;
  const rightRailX = Math.max(rungOneCoilX, rungTwoCoilX) + 107;
  const canvasWidth = rightRailX + 48;
  const rungOneSimulationVisible = rungOneElements.length === 0;
  const rungTwoSimulationVisible = rungTwoElements.length === 0;
  const hasVisualEdits = !rungOneSimulationVisible || !rungTwoSimulationVisible;
  const rungOneTraceVisible = activeRung === 0 && rungOneSimulationVisible;
  const rungTwoTraceVisible = activeRung === 1 && rungTwoSimulationVisible;
  const [selectedRung, setSelectedRung] = useState(0);
  const [draggingOverRung, setDraggingOverRung] = useState<number | null>(null);

  function getDropRung(event: DragEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const y = ((event.clientY - bounds.top) / bounds.height) * 300;
    return y >= 40 && y <= 120 ? 0 : y >= 182 && y <= 238 ? 1 : null;
  }
  function handleDrop(event: DragEvent<SVGSVGElement>) {
    event.preventDefault();
    setDraggingOverRung(null);
    const rung = getDropRung(event);
    if (rung === null) return;
    const kind = event.dataTransfer.getData("application/x-plc-ladder-element");
    if (
      kind === "contact-no" ||
      kind === "contact-nc" ||
      kind === "coil"
    ) {
      onAddElement(rung, kind);
    }
  }

  function handleDragStart(
    event: DragEvent<HTMLButtonElement>,
    kind: LadderElementKind,
  ) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-plc-ladder-element", kind);
  }

  return (
    <div className="ladder-view">
      <div className="ladder-toolbar">
        <span>LD · Editor visual · Marcha/paro</span>
        <span className="ladder-live-indicator">
          <span className={displayedRunning && !hasVisualEdits ? "is-on" : ""} />
          {hasVisualEdits
            ? "VISTA EDITADA"
            : activeRung === 0
              ? "TRAZA DE RUNTIME"
              : displayedRunning
                ? "MARCHA"
                : "PARADO"}
        </span>
        {inputsPending && (
          <span className="ladder-pending-indicator">
            ENTRADAS PENDIENTES
          </span>
        )}
      </div>
      <div className="ladder-canvas-scroll">
        <svg
          className="ladder-canvas"
          viewBox={`0 0 ${canvasWidth} 300`}
          style={{ width: `${canvasWidth}px` }}
          role="img"
          onDragOver={(event) => {
            event.preventDefault();
            const rung = getDropRung(event);
            setDraggingOverRung((current) => current === rung ? current : rung);
          }}
          onDrop={handleDrop}
          onDragLeave={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            ) return;
            setDraggingOverRung(null);
          }}
          aria-label={`Diagrama Ladder con dos peldaños. Start ${start ? "activo" : "inactivo"}, Stop ${stop ? "activo" : "inactivo"}, memoria Running ${displayedRunning ? "activa" : "inactiva"}, salida Motor ${displayedMotor ? "activa" : "inactiva"}${activeRung === null ? "" : `, evaluando peldaño ${activeRung + 1}`}.`}
        >
          <rect
            className={`ladder-drop-zone${draggingOverRung === 0 ? " is-dragging-over" : ""}`}
            x="42"
            y="40"
            width={rightRailX - 34}
            height="80"
          />
          <rect
            className={`ladder-drop-zone${draggingOverRung === 1 ? " is-dragging-over" : ""}`}
            x="42"
            y="182"
            width={rightRailX - 34}
            height="56"
          />
          <line className="ladder-rail" x1="48" y1="28" x2="48" y2="265" />
          <line className="ladder-rail" x1={rightRailX} y1="28" x2={rightRailX} y2="265" />

          {rungOneTraceVisible && (
            <rect
              className="ladder-rung-trace"
              x="42"
              y="40"
              width={rightRailX - 34}
              height="80"
              rx="6"
            />
          )}
          <text
            className={`ladder-rung-number${rungOneTraceVisible ? " is-active" : ""}`}
            x="20"
            y="84"
          >
            01
          </text>
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized ? " is-energized" : ""}`}
            x1="48" y1="80" x2="145" y2="80"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized ? " is-energized" : ""}`}
            x1="145" y1="50" x2="145" y2="110"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized && start ? " is-energized" : ""}`}
            x1="145" y1="50" x2="238" y2="50"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized && running ? " is-energized" : ""}`}
            x1="145" y1="110" x2="238" y2="110"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized && start ? " is-energized" : ""}`}
            x1="292" y1="50" x2="325" y2="50"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized && running ? " is-energized" : ""}`}
            x1="292" y1="110" x2="325" y2="110"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized ? " is-energized" : ""}`}
            x1="325" y1="50" x2="325" y2="110"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized ? " is-energized" : ""}`}
            x1="325" y1="80" x2="425" y2="80"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized ? " is-energized" : ""}`}
            x1="479" y1="80" x2={rungOneElements.length ? 514 : rungOneCoilX + 8} y2="80"
          />
          <line
            className={`ladder-wire${rungOneSimulationVisible && rungOneEnergized ? " is-energized" : ""}`}
            x1={rungOneCoilX + 54} y1="80" x2={rightRailX} y2="80"
          />
          {rungOneElements.map((element, index) => (
            <line
              key={`rung-one-wire-${element.id}`}
              className="ladder-wire"
              x1={560 + index * 82}
              y1="80"
              x2={
                index + 1 < rungOneElements.length
                  ? 514 + (index + 1) * 82
                  : rungOneCoilX + 8
              }
              y2="80"
            />
          ))}
          <LadderContact
            x={238}
            y={50}
            label="Start"
            closed={start}
            energized={rungOneSimulationVisible && rungOneEnergized && start}
          />
          <LadderContact
            x={238}
            y={110}
            label="Running"
            closed={running}
            energized={rungOneSimulationVisible && rungOneEnergized && running}
          />
          <LadderContact
            x={425}
            y={80}
            label="Stop"
            normallyClosed
            closed={!stop}
            energized={rungOneSimulationVisible && rungOneEnergized}
          />
          {rungOneElements.map((element, index) => {
            const x = 510 + index * 82;
            return element.kind === "coil" ? (
              <LadderCoil
                key={element.id}
                x={x}
                y={80}
                label={`Q${element.id}`}
                energized={false}
                traced={false}
              />
            ) : (
              <LadderContact
                key={element.id}
                x={x}
                y={80}
                label={`X${element.id}`}
                normallyClosed={element.kind === "contact-nc"}
                closed={false}
                energized={false}
              />
            );
          })}
          <LadderCoil
            x={rungOneCoilX}
            y={80}
            label="Running"
            energized={rungOneSimulationVisible && displayedRunning}
            traced={rungOneTraceVisible}
          />
          {rungTwoTraceVisible && (
            <rect
              className="ladder-rung-trace"
              x="42"
              y="182"
              width={rightRailX - 34}
              height="56"
              rx="6"
            />
          )}
          <text
            className={`ladder-rung-number${rungTwoTraceVisible ? " is-active" : ""}`}
            x="20"
            y="214"
          >
            02
          </text>
          <line
            className={`ladder-wire${rungTwoSimulationVisible && rungTwoEnergized ? " is-energized" : ""}`}
            x1="48" y1="210" x2="238" y2="210"
          />
          <line
            className={`ladder-wire${rungTwoSimulationVisible && rungTwoEnergized ? " is-energized" : ""}`}
            x1="292" y1="210" x2={rungTwoElements.length ? 324 : rungTwoCoilX + 8} y2="210"
          />
          <line
            className={`ladder-wire${rungTwoSimulationVisible && rungTwoEnergized ? " is-energized" : ""}`}
            x1={rungTwoCoilX + 54} y1="210" x2={rightRailX} y2="210"
          />
          {rungTwoElements.map((element, index) => (
            <line
              key={`rung-two-wire-${element.id}`}
              className="ladder-wire"
              x1={374 + index * 82}
              y1="210"
              x2={
                index + 1 < rungTwoElements.length
                  ? 324 + (index + 1) * 82
                  : rungTwoCoilX + 8
              }
              y2="210"
            />
          ))}
          <LadderContact
            x={238}
            y={210}
            label="Running"
            closed={displayedRunning}
            energized={rungTwoSimulationVisible && rungTwoEnergized}
          />
          {rungTwoElements.map((element, index) => {
            const x = 320 + index * 82;
            return element.kind === "coil" ? (
              <LadderCoil
                key={element.id}
                x={x}
                y={210}
                label={`Q${element.id}`}
                energized={false}
                traced={false}
              />
            ) : (
              <LadderContact
                key={element.id}
                x={x}
                y={210}
                label={`X${element.id}`}
                normallyClosed={element.kind === "contact-nc"}
                closed={false}
                energized={false}
              />
            );
          })}
          <LadderCoil
            x={rungTwoCoilX}
            y={210}
            label="Motor"
            energized={rungTwoSimulationVisible && displayedMotor}
            traced={rungTwoTraceVisible}
          />
        </svg>
      </div>
      <div className="ladder-legend">
        <span><i className="ladder-symbol-no" /> Contacto normalmente abierto</span>
        <span><i className="ladder-symbol-nc" /> Contacto normalmente cerrado</span>
        <span><i className="ladder-symbol-coil" /> Bobina</span>
      </div>
      <div className="ladder-editor" aria-label="Editor Ladder visual">
        <div className="ladder-editor-heading">
          <span>Elementos</span>
          <label>
            Peldaño
            <select
              value={selectedRung}
              onChange={(event) => setSelectedRung(Number(event.target.value))}
            >
              <option value={0}>01 · Running</option>
              <option value={1}>02 · Motor</option>
            </select>
          </label>
        </div>
        <p className="ladder-editor-help">
          Arrastra un elemento al peldaño o selecciónalo para añadirlo.
        </p>
        <div className="ladder-palette">
          <button
            type="button"
            draggable
            onDragStart={(event) => handleDragStart(event, "contact-no")}
            onClick={() => onAddElement(selectedRung, "contact-no")}
          >
            <i className="ladder-symbol-no" aria-hidden="true" />
            NO
          </button>
          <button
            type="button"
            draggable
            onDragStart={(event) => handleDragStart(event, "contact-nc")}
            onClick={() => onAddElement(selectedRung, "contact-nc")}
          >
            <i className="ladder-symbol-nc" aria-hidden="true" />
            NC
          </button>
          <button
            type="button"
            draggable
            onDragStart={(event) => handleDragStart(event, "coil")}
            onClick={() => onAddElement(selectedRung, "coil")}
          >
            <i className="ladder-symbol-coil" aria-hidden="true" />
            Bobina
          </button>
        </div>
        {Object.entries(elements).some(([, rungElements]) => rungElements.length > 0) && (
          <div className="ladder-added-elements" aria-live="polite">
            {[0, 1].map((rung) => (
              <div className="ladder-added-rung" key={rung}>
                <span>Peldaño {String(rung + 1).padStart(2, "0")}</span>
                {(elements[rung] ?? []).map((element) => (
                  <span className="ladder-added-element" key={element.id}>
                    {element.kind === "contact-no"
                      ? `X${element.id} · NO`
                      : element.kind === "contact-nc"
                        ? `X${element.id} · NC`
                        : `Q${element.id} · Bobina`}
                    <button
                      type="button"
                      aria-label={`Quitar elemento ${element.id} del peldaño ${rung + 1}`}
                      onClick={() => onRemoveElement(rung, element.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        <p className="ladder-editor-notice">
          Editor visual experimental: los elementos añadidos aún no se ejecutan
          ni modifican el programa PLC.
        </p>
        <button
          className="ladder-clear-button"
          type="button"
          disabled={rungOneElements.length + rungTwoElements.length === 0}
          onClick={onClearElements}
        >
          Limpiar elementos añadidos
        </button>
      </div>
      <div className="ladder-equations" aria-label="Lógica de los peldaños">
        <p className={activeRung === 0 ? "is-active" : ""}>
          <span>01</span>
          <code>Running := (Running OR Start) AND NOT Stop</code>
        </p>
        <p className={activeRung === 1 ? "is-active" : ""}>
          <span>02</span>
          <code>Motor := Running</code>
        </p>
      </div>
      <p className="ladder-explanation">
        El primer peldaño enclava la marcha; Stop interrumpe el circuito.
      </p>
    </div>
  );
}

function LadderContact({
  x,
  y,
  label,
  normallyClosed = false,
  closed,
  energized,
}: {
  x: number;
  y: number;
  label: string;
  normallyClosed?: boolean;
  closed: boolean;
  energized: boolean;
}) {
  return (
    <g
      className={`ladder-contact${closed ? " is-closed" : ""}${energized ? " is-energized" : ""}`}
    >
      <text x={x + 27} y={y - 16} textAnchor="middle">{label}</text>
      <line x1={x + 4} y1={y - 13} x2={x + 4} y2={y + 13} />
      <line x1={x + 50} y1={y - 13} x2={x + 50} y2={y + 13} />
      {closed && (
        <line
          className="ladder-contact-bridge"
          x1={x + 4}
          y1={y}
          x2={x + 50}
          y2={y}
        />
      )}
      {normallyClosed && (
        <line className="ladder-contact-slash" x1={x} y1={y + 14} x2={x + 54} y2={y - 14} />
      )}
    </g>
  );
}

function LadderCoil({
  x,
  y,
  label,
  energized,
  traced,
}: {
  x: number;
  y: number;
  label: string;
  energized: boolean;
  traced: boolean;
}) {
  return (
    <g
      className={`ladder-coil${energized ? " is-energized" : ""}${traced ? " is-traced" : ""}`}
    >
      <text x={x + 27} y={y - 16} textAnchor="middle">{label}</text>
      <path d={`M ${x + 8} ${y - 14} C ${x - 2} ${y - 7}, ${x - 2} ${y + 7}, ${x + 8} ${y + 14}`} />
      <path d={`M ${x + 46} ${y - 14} C ${x + 56} ${y - 7}, ${x + 56} ${y + 7}, ${x + 46} ${y + 14}`} />
    </g>
  );
}
