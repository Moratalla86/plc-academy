export function ConveyorTwin({
  motorOn,
  cycleRunning,
}: {
  motorOn: boolean;
  cycleRunning: boolean;
}) {
  const plantRunning = motorOn && cycleRunning;
  const plantStatus = motorOn
    ? cycleRunning
      ? "Motor en marcha"
      : "Motor activo · ciclo pausado"
    : "Motor parado";

  return (
    <section className="conveyor-twin" aria-label="Gemelo visual de una cinta transportadora">
      <div className="conveyor-twin-heading">
        <div>
          <span>PLANTA VIRTUAL · CINTA 01</span>
          <strong>Gemelo digital</strong>
        </div>
        <span className={`twin-motor-status${motorOn ? " is-running" : ""}`} role="status">
          <i aria-hidden="true" />
          {plantStatus}
        </span>
      </div>
      <div
        className={`conveyor-scene${motorOn ? " is-running" : ""}${motorOn && !cycleRunning ? " is-paused" : ""}`}
        role="img"
        aria-label={`Cinta transportadora ${plantRunning ? "en movimiento" : motorOn ? "pausada con el motor activo" : "detenida"}. La animación sigue la salida Q0.0 Motor y el ciclo automático.`}
      >
        <span className="conveyor-scene-label conveyor-label-left">ENTRADA</span>
        <span className="conveyor-scene-label conveyor-label-right">SALIDA</span>
        <div className="conveyor-support" />
        <div className="conveyor-track">
          <div className="conveyor-belt" />
          <div className="conveyor-rollers" aria-hidden="true">
            {Array.from({ length: 11 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="conveyor-part">
            <span />
          </div>
          <div className="conveyor-sensor">
            <i />
          </div>
        </div>
        <div className="conveyor-sensor-caption">
          <span>PE-01</span>
          <span>Sensor de presencia · ilustrativo</span>
        </div>
      </div>
      <p className="conveyor-twin-note">
        Animación ligada a la salida <code>Q0.0 Motor</code> tras cada scan. Las
        entradas de sensores de esta práctica se cambian manualmente; todavía
        no realimentan el proceso virtual.
      </p>
    </section>
  );
}
