import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type * as monacoEditor from "monaco-editor/editor/editor.api";
import { LadderPractice, type LadderElement, type LadderElementKind } from "./ladder/LadderPractice";
import { StructuredTextTrace } from "./trace/StructuredTextTrace";
import {
  useExecutionTrace,
  type AssignmentTrace,
} from "./trace/useExecutionTrace";
import {
  usePlcMachine,
  type CompileDiagnostic,
  type CompilerWarning,
  type PlcMachineHandle,
} from "./runtime/usePlcMachine";
import { ConveyorTwin } from "./plant/ConveyorTwin";

const PlcEditor = lazy(() =>
  import("./editor/PlcEditor").then((module) => ({ default: module.PlcEditor })),
);

const scanSteps = [
  {
    number: "01",
    name: "Lee las entradas",
    detail: "El PLC captura el estado de los sensores.",
    symbol: "I",
  },
  {
    number: "02",
    name: "Ejecuta el programa",
    detail: "La lógica se resuelve con esos valores.",
    symbol: "ƒ",
  },
  {
    number: "03",
    name: "Actualiza las salidas",
    detail: "El proceso responde al resultado del scan.",
    symbol: "Q",
  },
];

const courseLevels = [
  {
    id: "primeros-pasos",
    number: "01",
    title: "Primeros pasos",
    description: "Aprende el hardware, las señales y las formas de representar un programa.",
    modules: [
      {
        id: "hardware-plc",
        title: "El PLC y su hardware",
        kind: "guided",
        summary: "CPU, E/S digitales y analógicas, buses",
        introduction: "Antes de programar, identifica qué equipo ejecuta el programa, qué señales lee y cómo se comunica con sensores, actuadores y otros dispositivos.",
        theory: [
          { title: "CPU, fuente y módulos", body: "La fuente alimenta el controlador; la CPU ejecuta el programa y gestiona el ciclo; los módulos de E/S conectan las señales de campo. Un PLC modular permite ampliar o sustituir módulos según la aplicación." },
          { title: "Señal digital", body: "Una entrada digital distingue estados discretos, como 0/1 o abierto/cerrado. Ejemplos: pulsador, final de carrera, presostato. Las salidas digitales gobiernan órdenes discretas mediante el tipo de interfaz apropiado." },
          { title: "Señal analógica", body: "Una entrada analógica convierte una magnitud continua en un valor numérico: temperatura, presión o velocidad. Son comunes 0–10 V y 4–20 mA. El programa debe escalar el valor bruto a unidades de ingeniería y considerar rango, resolución y fallo de cable." },
          { title: "Bus y red industrial", body: "Un bus de campo intercambia datos entre controlador y dispositivos siguiendo un protocolo. Puede llevar varias señales, diagnósticos y parámetros por una conexión compartida. Ethernet industrial, PROFINET, EtherNet/IP y Modbus son ejemplos con características distintas; no son simplemente 'un cable de entradas'." },
        ],
        procedure: ["Clasifica un pulsador, un transmisor 4–20 mA y un variador conectado por red.", "Sigue la ruta de una señal: sensor → módulo/bus → variable del PLC → lógica → actuador.", "Compara una entrada digital con una medida analógica: estado frente a valor dentro de un rango."],
        problems: [
          { title: "Selecciona las señales de una estación de bombeo", scenario: "La estación tiene un pulsador de marcha, un flotador de nivel mínimo, un transmisor de presión 4–20 mA y un variador con diagnóstico por red.", requirements: ["Clasifica cada elemento como E/S digital, analógica o dato de comunicación.", "Indica qué variable debería usar el programa para leer presión y en qué unidades.", "Explica por qué la HMI no sustituye al módulo que adquiere la señal física."] },
          { title: "Un cable no explica la señal", scenario: "El transmisor de presión indica 0 bar en el PLC, pero el proceso está presurizado.", requirements: ["Enumera al menos cuatro puntos de la cadena sensor→módulo→escala→variable que revisarías.", "Distingue un problema de cableado de uno de configuración de rango.", "Propón cómo debería representarse una rotura de lazo 4–20 mA."] },
        ],
      },
      {
        id: "comunicaciones-industriales",
        title: "Tramas y redes industriales",
        kind: "communications",
        summary: "Codificación, direccionamiento y protocolos",
        introduction: "Sigue un dato desde la aplicación hasta el cable: aprende cómo se organiza una trama, qué direcciones intervienen y cómo inspeccionar intercambios Modbus, PROFINET y EtherNet/IP.",
        theory: [
          { title: "Qué contiene una trama", body: "Una comunicación se encapsula por capas: la trama de enlace identifica el siguiente salto físico, IP localiza equipos entre redes, TCP o UDP transportan segmentos o datagramas y el protocolo industrial define la operación y los datos. Cada capa añade campos de control; no existe una única estructura de trama para todos los protocolos." },
          { title: "Direcciones no son lo mismo", body: "MAC identifica interfaces en la red local; IP identifica interfaces entre redes; puerto identifica un servicio de transporte; la dirección de registro o el path CIP identifica un dato dentro del protocolo de aplicación. Una dirección documental Modbus como 40001 suele referirse al registro de holding 0, pero el PDU transmite el offset 0: comprueba siempre la convención del fabricante." },
          { title: "Codificación y diagnóstico", body: "Los campos se envían como bytes. Modbus codifica sus campos numéricos del PDU en big-endian, mientras que el CRC-16 de Modbus RTU se transmite con el byte bajo primero. Longitud, función, secuencia, estado y checksum permiten interpretar y diagnosticar el intercambio; no confundas una captura parcial con un telegrama completo." },
          { title: "Protocolos industriales", body: "Modbus RTU usa tramas serie delimitadas por tiempos de silencio y CRC; Modbus TCP añade una cabecera MBAP sobre TCP (puerto 502). PROFINET IO suele intercambiar datos cíclicos en Ethernet de capa 2 y la forma exacta depende de la configuración. EtherNet/IP usa CIP: mensajería explícita normalmente sobre TCP/44818 e I/O implícita en tiempo real normalmente sobre UDP/2222." },
        ],
        procedure: ["Selecciona un protocolo y localiza sus capas, direcciones y campos de control.", "Genera una lectura Modbus y compara el offset de protocolo con la notación 4xxxx de documentación.", "Comprueba el CRC RTU y observa cómo cambia la encapsulación al usar Modbus TCP.", "Para PROFINET y EtherNet/IP, distingue los campos comunes de Ethernet de los datos que dependen de la configuración y del tipo de tráfico."],
        problems: [
          { title: "Dos direcciones para el mismo registro", scenario: "La documentación del equipo llama 40108 al registro y la captura Modbus muestra el offset 0x006B en una petición de lectura.", requirements: ["Convierte el offset hexadecimal a decimal.", "Explica por qué 40108 menos la base 40001 da ese offset.", "Comprueba si la aplicación del fabricante usa offsets base cero o base uno antes de configurar el PLC."] },
          { title: "Elegir y diagnosticar el transporte", scenario: "Un PLC intercambia E/S cíclicas con un dispositivo PROFINET y además consulta un medidor Modbus TCP; otro equipo de mantenimiento ofrece acceso EtherNet/IP.", requirements: ["Distingue el tráfico cíclico PROFINET de una petición de lectura Modbus TCP.", "Identifica qué direcciones y puertos revisarías en una captura TCP/IP.", "Explica por qué una comunicación EtherNet/IP no se diagnostica buscando solo el puerto TCP 44818: el I/O implícito suele usar UDP/2222.", "Indica qué datos de configuración faltan para reconstruir una trama PROFINET o un path CIP exactos."] },
        ],
      },
      {
        id: "lenguajes-plc",
        title: "Editores y lenguajes PLC",
        kind: "guided",
        summary: "Ladder, Structured Text y bloques FBD",
        introduction: "Un editor es la herramienta para escribir y probar el programa; el lenguaje es la forma de expresar la lógica. Aprende a leer tres representaciones habituales sin confundirlas con el proceso físico.",
        theory: [
          { title: "Ladder (LD)", body: "Se lee como peldaños entre dos barras. Los contactos representan condiciones y las bobinas asignan resultados. Es muy visual para lógica discreta y mantenimiento; la apariencia de contactos no significa que el PLC sea literalmente un circuito cableado." },
          { title: "Structured Text (ST)", body: "Es un lenguaje textual con asignaciones, expresiones, condiciones y estructuras. Es cómodo para cálculos, datos y algoritmos. La ejecución sigue las reglas del entorno y del orden del programa." },
          { title: "Function Block Diagram (FBD)", body: "Representa funciones como bloques con entradas y salidas conectadas por señales. Es habitual para control de proceso, funciones analógicas y composición de bloques como escalado o PID." },
          { title: "El editor como herramienta", body: "Un IDE de PLC suele organizar proyecto, hardware/configuración, bloques de programa, tabla de tags, compilación, descarga y diagnóstico online. Separar la declaración de variables, el programa y la configuración de hardware ayuda a entender proyectos reales." },
        ],
        procedure: ["Lee primero el ejemplo comentado línea por línea; todavía no hace falta escribir.", "Sigue en el esquema Ladder el camino desde el raíl izquierdo hasta la bobina.", "Predice el resultado con Start = TRUE y Stop = FALSE; después prueba la combinación contraria.", "Solo cuando puedas explicar cada símbolo, modifica una condición y describe qué debería cambiar."],
        problems: [
          { title: "Sigue la lógica antes de cambiarla", scenario: "En el ejemplo de la lección, Start está activo, Stop está inactivo y Running comienza en FALSE.", requirements: ["Lee cada línea de ST y predice los valores nuevos de Running y Motor.", "Explica qué contacto del peldaño representa Start y cuál representa la memoria Running.", "Explica por qué el contacto Stop está negado y qué ocurre al activarse Stop.", "Cambia una sola condición en el borrador y describe el resultado esperado; no hace falta escribir un programa desde cero."] },
          { title: "Reconoce las partes de un proyecto PLC", scenario: "Te entregan un proyecto con configuración de CPU, una tabla de tags, un bloque principal y varias pantallas HMI.", requirements: ["Separa configuración de hardware, variables (tags), lógica y visualización.", "Identifica qué partes configurarías en el editor y cuáles se ejecutan en el PLC.", "Explica con tus palabras qué significan compilar, descargar y conectarse online."] },
        ],
      },
      {
        id: "ciclo-scan",
        title: "El ciclo de scan",
        kind: "theory",
        summary: "Entradas, ejecución y salidas",
        introduction: "Un PLC no responde como un interruptor instantáneo: repite un ciclo ordenado de lectura, cálculo y actualización.",
        theory: [
          { title: "1. Leer entradas", body: "El PLC copia el estado de sensores y pulsadores a una imagen de entradas. El programa trabaja con esa fotografía durante el scan." },
          { title: "2. Ejecutar lógica", body: "Las instrucciones se evalúan en orden. Los estados internos pueden cambiar mientras se calcula el resultado." },
          { title: "3. Actualizar salidas", body: "Al terminar la ejecución, el PLC publica la imagen de salidas. Después comienza otro scan." },
        ],
        procedure: ["Pulsa «Siguiente paso» en la explicación del ciclo.", "Compara el orden con lo que ves en el editor y en los valores de E/S.", "Recuerda: un cambio de entrada puede reflejarse en la salida al final del scan."],
        problems: [
          { title: "Sensor entre scans", scenario: "Un sensor se activa justo después de que el PLC haya leído sus entradas.", requirements: ["Explica en qué scan se detecta el cambio.", "Indica cuándo puede cambiar la salida asociada.", "Distingue el tiempo de scan del tiempo físico del proceso."] },
          { title: "Salida desactualizada", scenario: "El programa calcula una salida nueva, pero todavía no ha terminado el scan.", requirements: ["¿En qué fase se publica la salida?", "¿Qué vería el proceso antes de esa fase?"] },
        ],
      },
      {
        id: "marcha-paro",
        title: "Marcha, paro y memoria",
        kind: "runtime",
        summary: "Enclavamiento básico con Start y Stop",
        introduction: "Construye una orden de marcha que se mantenga aunque el operador suelte Start, y que se interrumpa al pulsar Stop.",
        theory: [
          { title: "La memoria retiene el estado", body: "Running aparece a ambos lados de la condición OR: si ya estaba activa, puede mantener la marcha cuando Start vuelve a cero." },
          { title: "Stop debe tener prioridad", body: "La expresión lógica aplica NOT Stop al final. Cuando Stop está activo, el resultado de Running pasa a falso." },
          { title: "La salida refleja la orden", body: "Motor se asigna desde Running para conectar el estado de control con la salida del proceso." },
        ],
        procedure: ["Activa Start y ejecuta «Un scan».", "Desactiva Start y ejecuta otro scan: Running debe conservarse.", "Activa Stop y ejecuta un scan: Running y Motor deben apagarse."],
        problems: [
          { title: "Añade una condición de seguridad", scenario: "El motor también debe detenerse si se activa una seta de emergencia EStop.", requirements: ["Añade EStop como entrada booleana.", "Haz que tenga prioridad sobre Start y Running.", "Prueba Start y EStop activos simultáneamente y explica el resultado."] },
          { title: "Dos motores, una autorización", scenario: "Una salida Motor2 solo puede activarse si Running está activo y GuardClosed confirma que la protección está cerrada.", requirements: ["Declara GuardClosed como entrada y Motor2 como salida.", "Expresa la condición con AND.", "Comprueba qué pasa al abrir la protección durante la marcha."] },
        ],
      },
      {
        id: "temporizador-ton",
        title: "Temporizador TON",
        kind: "timer",
        summary: "Retardo a la conexión",
        introduction: "Un TON espera a que IN permanezca activa durante el tiempo preseleccionado antes de activar Q.",
        theory: [
          { title: "IN inicia la temporización", body: "Con IN a TRUE, ET acumula tiempo desde cero. Si IN vuelve a FALSE antes del tiempo objetivo, un TON no retentivo reinicia ET." },
          { title: "PT y ET no son lo mismo", body: "PT es el tiempo ajustado por el programador; ET es el tiempo que ya ha transcurrido." },
          { title: "Q cambia al alcanzar PT", body: "La salida Q permanece apagada mientras ET < PT y se activa cuando ET alcanza PT. La resolución depende del ciclo y del runtime." },
        ],
        procedure: ["Activa el sensor de presencia.", "Observa ET crecer por cada scan y Q permanecer apagada.", "Cambia PT y observa cuándo se enciende la lámpara.", "Desactiva IN y confirma que ET vuelve a cero."],
        problems: [
          { title: "Lámpara de acceso con retardo", scenario: "Una zona de paso debe encender una lámpara solo si el sensor de presencia permanece activo durante 2 segundos; un paso fugaz no debe encenderla.", requirements: ["Define IN, PT y la salida de lámpara.", "Explica qué ocurre si el sensor se desactiva al cabo de 1,5 s.", "Indica qué estado debe tener ET y Q tras la desconexión."] },
          { title: "Ventilador con retardo a la conexión", scenario: "Al arrancar una máquina, el ventilador de extracción debe encenderse 5 segundos después para evitar un pico de carga simultáneo.", requirements: ["Plantea la condición de IN y el valor PT.", "Describe la secuencia en scans: antes y después de alcanzar PT.", "Explica qué ocurre si la máquina se para antes de los 5 segundos."] },
        ],
      },
    ],
  },
  {
    id: "avanzamos",
    number: "02",
    title: "Avanzamos",
    description: "Integra PLC, HMI, redes y control PID en aplicaciones reales.",
    modules: [
      {
        id: "integracion-plc-hmi",
        title: "Cómo se programa un PLC hoy",
        kind: "guided",
        summary: "Proyecto, tags, HMI y comunicación",
        introduction: "En una máquina actual el PLC no está aislado: forma parte de un proyecto de automatización que incluye hardware, programa, HMI, accionamientos y comunicaciones.",
        theory: [
          { title: "Del proyecto al controlador", body: "Se configura CPU y módulos, se declaran tags con nombres significativos, se organiza la lógica en bloques y tareas, se compila y se descarga una versión controlada al PLC. En online se comparan valores y diagnósticos; no se debe cambiar producción sin procedimiento y autorización." },
          { title: "PLC y HMI", body: "El PLC toma decisiones deterministas y mantiene permisos/interbloqueos. La HMI presenta estados, alarmas y tendencias y envía solicitudes del operador. La lógica debe validar cada solicitud: una pantalla no es un dispositivo de seguridad." },
          { title: "Comunicación industrial", body: "Los dispositivos intercambian tags cíclicos o mensajes mediante redes y protocolos configurados. Hay que definir quién produce y consume los datos, direcciones, tiempos, calidad/validez y qué hace la máquina al perder comunicación." },
          { title: "Puesta en marcha", body: "Una secuencia responsable incluye revisión de esquema y riesgos, verificación de E/S, prueba offline, pruebas controladas, registro de cambios y plan de vuelta atrás." },
        ],
        procedure: ["Separa en un diagrama PLC, HMI, variador y E/S remotas.", "Marca qué dispositivo genera cada dato y quién lo consume.", "Diseña qué debe ocurrir si se pierde el dato de velocidad del variador.", "Escribe una lista de comprobaciones antes de descargar un cambio."],
        problems: [
          { title: "La HMI pide arrancar una bomba", scenario: "La pantalla tiene botones Marcha/Paro, un nivel mínimo, un permiso de mantenimiento y una indicación de variador listo.", requirements: ["Define solicitudes de HMI separadas de las salidas físicas.", "Especifica los permisos que el PLC valida antes de arrancar.", "Decide qué muestra la HMI cuando el variador no está listo.", "Explica cómo se comporta el control si se pierde comunicación con el variador."] },
          { title: "Cambio controlado en producción", scenario: "Hay que cambiar el umbral de una alarma en una línea que ya está produciendo.", requirements: ["Define cómo confirmar el cambio y su autorización.", "Explica qué se prueba antes y después de descargar.", "Incluye registro de versión y una forma de volver al valor anterior."] },
        ],
      },
      {
        id: "pid-control",
        title: "Control PID",
        kind: "guided",
        summary: "SP, PV y salida de control",
        introduction: "Un PID regula una variable continua comparando la consigna con la medida. Antes de ajustar ganancias, entiende el proceso, el sentido de actuación y los límites de la salida.",
        theory: [
          { title: "SP, PV y error", body: "SP es la consigna; PV es la variable medida. El error suele expresarse como SP − PV. La salida MV gobierna el elemento final, como una válvula o un variador." },
          { title: "P, I y D", body: "La acción proporcional responde al error actual; la integral acumula error sostenido y puede eliminar offset, pero causar windup; la derivativa responde a la rapidez del cambio y puede amplificar ruido." },
          { title: "Lazo real", body: "Un lazo incluye sensor y escala, algoritmo, límites/anti-windup y actuador. Una inversión de sentido (directo o inverso) mal configurada puede empeorar el error en vez de corregirlo." },
          { title: "Puesta en servicio", body: "Primero valida sensor y sentido de acción, luego límites y modo manual/automático. Ajusta con un procedimiento seguro, registra respuesta y evita experimentar sobre procesos peligrosos sin autorización." },
        ],
        procedure: ["Dibuja PV → comparación con SP → PID → MV → proceso → PV.", "Predice el signo de MV si PV está por debajo de SP en calefacción.", "Identifica qué podría causar saturación o windup.", "Compara respuesta teórica frente a tendencias reales antes de ajustar."],
        problems: [
          { title: "Temperatura de horno", scenario: "Un horno debe mantener 180 °C con una resistencia gobernada por una salida analógica 0–100 %. El sensor está escalado de 0 a 300 °C.", requirements: ["Define PV, SP, error, MV y rangos/unidades.", "Explica el sentido de acción correcto para calefacción.", "Propón límites y una protección independiente de sobretemperatura.", "Describe cómo probarías el lazo sin poner en riesgo producto ni equipo."] },
          { title: "Nivel de tanque con válvula", scenario: "Una válvula de entrada modula 0–100 % para mantener nivel. La válvula puede atascarse y el tanque tiene rebose.", requirements: ["Dibuja el lazo y define la señal analógica de entrada y salida.", "Explica qué ocurre si la salida llega al 100 % y el nivel no aumenta.", "Incluye alarmas y una acción segura ante pérdida de señal.", "Distingue la regulación PID del enclavamiento de alto-alto nivel."] },
        ],
      },
      {
        id: "retardo-off",
        title: "Retardo a la desconexión",
        kind: "theory",
        summary: "TOF para mantener una salida activa",
        introduction: "En una función TOF, Q se activa con IN y permanece activa durante un tiempo después de que IN pase a FALSE.",
        theory: [
          { title: "Comportamiento de TOF", body: "Cuando IN es TRUE, Q está activa. Al desactivar IN comienza el retardo; Q cae cuando ET alcanza PT." },
          { title: "Contraste con TON", body: "TON retarda la conexión. TOF retarda la desconexión. Confundir el flanco temporizado es un error habitual." },
          { title: "Aplicación industrial", body: "La ventilación de una cabina puede mantenerse unos segundos después de detener la máquina para evacuar calor o vapores." },
        ],
        procedure: ["Identifica qué evento inicia el retardo: aquí es la caída de IN.", "Dibuja una línea temporal con IN, ET y Q.", "Comprueba que el motor de proceso puede parar mientras la ventilación continúa."],
        problems: [
          { title: "Extracción de cabina", scenario: "Al parar la pintura, el extractor debe seguir funcionando 30 segundos para limpiar la cabina y luego apagarse.", requirements: ["Usa la orden de marcha como IN de un TOF.", "Define PT = T#30s.", "Explica qué sucede si la máquina vuelve a arrancar antes de terminar el retardo."] },
          { title: "Luz de escalera con apagado retardado", scenario: "Un pulsador enciende una luz; al soltarlo, la luz debe permanecer encendida 45 segundos.", requirements: ["Representa el pulsador como IN.", "Distingue el tiempo en que se pulsa del tiempo posterior a soltarlo.", "Propón cómo permitir que otro pulso mantenga la luz encendida."] },
        ],
      },
      {
        id: "estrella-triangulo",
        title: "Arranque estrella-triángulo",
        kind: "theory",
        summary: "Secuencia temporizada con enclavamientos",
        introduction: "Diseña el cambio de conexión de un motor trifásico: arranca en estrella para limitar la corriente y pasa a triángulo tras el tiempo de aceleración.",
        theory: [
          { title: "Secuencia de maniobra", body: "Al dar marcha, se energizan el contactor principal y el de estrella. Tras el tiempo ajustado, estrella se desactiva; después de una pausa de transición, se activa triángulo." },
          { title: "Enclavamiento imprescindible", body: "Estrella y triángulo nunca deben estar activos a la vez. Además de la lógica, la maniobra real requiere enclavamiento eléctrico y mecánico." },
          { title: "Parada y fallo", body: "Stop o una protección térmica deben desenergizar todos los contactores y reiniciar la secuencia de forma segura." },
        ],
        procedure: ["Identifica entradas: Start, Stop y térmico OK.", "Ordena las salidas: principal, estrella y triángulo.", "Traza el TON de aceleración y el tiempo muerto de transición.", "Verifica en cada estado que estrella XOR triángulo nunca sea falso."],
        problems: [
          { title: "Dimensiona los tiempos", scenario: "Un motor de bomba debe arrancar en estrella durante 6 s. Tras abrir estrella, espera 200 ms antes de cerrar triángulo.", requirements: ["Escribe la secuencia temporal con T#6s y T#200ms.", "Asegura que estrella y triángulo nunca se solapan.", "Añade parada por térmico y explica qué salidas caen.", "Indica qué comportamiento tendría una parada y nuevo arranque durante la transición."] },
          { title: "Detecta el fallo de transición", scenario: "En una prueba, los contactores de estrella y triángulo aparecen activos simultáneamente durante un scan.", requirements: ["Explica por qué es una condición peligrosa.", "Propón un interbloqueo lógico y uno físico.", "Define una respuesta segura ante la discrepancia."] },
        ],
      },
      {
        id: "contador-ctu",
        title: "Contadores CTU",
        kind: "theory",
        summary: "Cuenta piezas y detecta el objetivo",
        introduction: "Un contador ascendente registra eventos y activa una condición al alcanzar un objetivo.",
        theory: [
          { title: "Cuenta por flanco", body: "Un CTU incrementa al detectar un nuevo flanco ascendente en CU, no por mantener la entrada a TRUE durante muchos scans." },
          { title: "PV, CV y Q", body: "PV es el valor objetivo, CV el valor actual y Q se activa al alcanzar o superar PV." },
          { title: "Reset explícito", body: "La entrada R reinicia el conteo. En una máquina real, define con claridad qué evento comienza un lote nuevo." },
        ],
        procedure: ["Identifica qué señal representa un evento de conteo.", "Distingue un flanco de una señal sostenida.", "Prueba el valor de salida al alcanzar PV y después de activar reset."],
        problems: [
          { title: "Lote de 24 envases", scenario: "Una cinta debe detenerse al contar 24 envases en una caja y quedar lista para iniciar la caja siguiente.", requirements: ["Define el sensor y el valor PV.", "Explica por qué el sensor debe contar por flanco.", "Indica cuándo debe activarse R y qué salida gobierna la cinta."] },
          { title: "Rechazo de piezas", scenario: "Cada quinta pieza detectada como defectuosa debe activar una alarma de mantenimiento.", requirements: ["Plantea un contador independiente de defectos.", "Determina cuándo se activa su salida Q.", "Explica cómo evitar que una señal defectuosa mantenida cuente varias veces."] },
        ],
      },
    ],
  },
  {
    id: "cracks",
    number: "03",
    title: "¡Cracks!",
    description: "Diseña secuencias seguras y diagnostica problemas de automatización.",
    modules: [
      {
        id: "secuencias",
        title: "Secuencias y estados",
        kind: "theory",
        summary: "Organiza procesos por etapas",
        introduction: "Una máquina de estados hace explícito en qué etapa está el proceso, qué condición permite avanzar y qué acciones corresponden a cada estado.",
        theory: [
          { title: "Un estado, una etapa", body: "Cada estado representa una condición operativa estable: reposo, llenado, mezcla, descarga o fallo." },
          { title: "Transiciones con condiciones", body: "El cambio entre etapas ocurre cuando se cumple un evento o una condición, como un sensor o un temporizador." },
          { title: "Seguridad ante cualquier estado", body: "Las paradas y fallos deben tener una respuesta definida desde todas las etapas, no solo desde el reposo." },
        ],
        procedure: ["Enumera estados mutuamente excluyentes.", "Especifica transiciones y condiciones de entrada.", "Asigna acciones a cada estado.", "Añade una ruta segura de parada y recuperación."],
        problems: [
          { title: "Ciclo de lavado", scenario: "Una lavadora industrial llena hasta nivel, lava durante 8 minutos, vacía y espera confirmación de puerta antes de empezar otra vez.", requirements: ["Define los estados y transiciones.", "Indica qué temporizador pertenece a la etapa de lavado.", "Resuelve qué ocurre si se activa una parada durante el llenado."] },
          { title: "Recuperación tras corte", scenario: "La alimentación se pierde durante el ciclo; al volver, no se debe arrancar un actuador de forma inesperada.", requirements: ["Decide qué estado inicial es seguro.", "Separa variables retentivas de órdenes de salida.", "Define cómo el operador autoriza la reanudación."] },
        ],
      },
      {
        id: "diagnostico",
        title: "Diagnóstico de máquina",
        kind: "theory",
        summary: "Busca la causa, no el síntoma",
        introduction: "Diagnosticar es reconstruir el estado del proceso a partir de entradas, memoria, temporizadores y salidas observables.",
        theory: [
          { title: "Sigue el flujo de señales", body: "Comprueba primero la entrada física, luego su imagen en el PLC, después la condición lógica y finalmente la salida." },
          { title: "Diferencia causa y efecto", body: "Una salida apagada puede ser consecuencia correcta de una seguridad abierta, no un fallo de la salida." },
          { title: "Registra condiciones reproducibles", body: "Anota estados y orden de eventos para distinguir un problema de lógica de un problema de cableado o temporización." },
        ],
        procedure: ["Observa entradas y salidas en el mismo scan.", "Localiza la primera condición que contradice el comportamiento esperado.", "Prueba una hipótesis cada vez y deja registro de la secuencia."],
        problems: [
          { title: "El motor no arranca", scenario: "Start está activo, pero la salida del motor sigue apagada. La protección térmica marca fallo y la tapa está cerrada.", requirements: ["Lista las señales que revisarías y en qué orden.", "Determina cuál puede bloquear el arranque.", "Explica por qué no conviene forzar la salida sin confirmar la causa."] },
          { title: "Retardo aparentemente aleatorio", scenario: "Una lámpara tarda a veces más en encender, aunque PT no ha cambiado.", requirements: ["Compara tiempo real y tiempo virtual de scan.", "Investiga si hay cambios intermitentes en IN.", "Propón qué valores observarías para reproducir el fallo."] },
        ],
      },
    ],
  },
];

const lessonPredictions: Record<
  string,
  { question: string; options: string[]; correctOption: number; feedback: string }
> = {
  "hardware-plc": {
    question: "Un transmisor de presión entrega una señal continua de 4–20 mA. ¿A qué tipo de entrada se conecta?",
    options: [
      "Entrada digital: solo reconoce 0 o 1.",
      "Entrada analógica: representa un rango de medida.",
      "Salida digital: el transmisor recibe una orden.",
    ],
    correctOption: 1,
    feedback: "4–20 mA codifica un rango de presión, por eso entra a un canal analógico. Un contacto de fin de carrera, en cambio, suele leerse como una señal digital.",
  },
  "lenguajes-plc": {
    question: "¿Qué cambia al representar la misma condición de marcha en LD, ST o FBD?",
    options: [
      "La lógica cambia porque cada lenguaje se ejecuta en un runtime distinto.",
      "La representación cambia; el comportamiento puede ser equivalente si las conexiones y el orden son los mismos.",
      "Solo ST puede expresar lógica booleana.",
    ],
    correctOption: 1,
    feedback: "LD muestra contactos y bobinas, ST expresa operaciones textuales y FBD conecta bloques. Los tres pueden representar la misma función IEC.",
  },
  "ciclo-scan": {
    question: "El sensor cambia justo después de que el PLC haya leído las entradas. ¿Cuándo verá ese cambio el programa?",
    options: [
      "En la siguiente lectura de entradas, normalmente en el siguiente scan.",
      "En mitad de la ejecución actual, siempre de forma inmediata.",
      "Solo después de reiniciar el PLC.",
    ],
    correctOption: 0,
    feedback: "El programa suele trabajar con una imagen de entradas capturada al inicio del ciclo. El cambio físico se copia en la siguiente actualización de esa imagen.",
  },
  "marcha-paro": {
    question: "Pulsas Start, ejecutas un scan y luego sueltas Start. ¿Qué debería pasar con Running?",
    options: [
      "Vuelve a FALSE porque Start ya está suelto.",
      "Sigue en TRUE por el enclavamiento, hasta Stop o una condición de seguridad.",
      "Alterna entre TRUE y FALSE en cada scan.",
    ],
    correctOption: 1,
    feedback: "La rama de retención usa el estado anterior de Running. Stop debe romper esa retención; en una instalación real, la parada de emergencia debe resolverse con hardware de seguridad adecuado, no solo con lógica estándar.",
  },
  "temporizador-ton": {
    question: "IN permanece activa 1,5 s con PT = 2 s y luego vuelve a FALSE. En un TON no retentivo, ¿qué ocurre?",
    options: [
      "Q ya está activa porque ET empezó a contar.",
      "ET reinicia y Q nunca llegó a activarse.",
      "ET conserva 1,5 s hasta la próxima activación.",
    ],
    correctOption: 1,
    feedback: "TON solo activa Q al alcanzar PT. Si IN cae antes, un TON no retentivo borra ET y mantiene Q a FALSE.",
  },
  "retardo-off": {
    question: "Una entrada activa una ventilación; al apagar la máquina, quieres que el extractor siga un tiempo. ¿Qué temporizas?",
    options: [
      "La conexión de Q con un TON.",
      "La desconexión de Q con un TOF.",
      "El ciclo de scan con un CTU.",
    ],
    correctOption: 1,
    feedback: "TOF mantiene Q mientras IN está activa y temporiza su caída después del flanco de bajada de IN.",
  },
  "pid-control": {
    question: "Un horno está 10 °C por debajo de la consigna. ¿Qué representa ese error para un controlador PID?",
    options: [
      "La diferencia entre consigna y variable de proceso; el controlador la usa para calcular la salida.",
      "El tiempo restante de un TON.",
      "La dirección de red del sensor.",
    ],
    correctOption: 0,
    feedback: "El PID compara SP (consigna) y PV (medida), y actúa sobre el error. La salida se debe limitar y ajustar con un modelo y un proceso seguros.",
  },
  "integracion-plc-hmi": {
    question: "El operador pulsa «Marcha» en una HMI. ¿Qué hace normalmente la HMI en una arquitectura PLC/HMI?",
    options: [
      "Escribe directamente a la salida física del contactor.",
      "Envía una orden o cambia una variable del PLC; el PLC valida permisos y gobierna las salidas.",
      "Sustituye el programa del PLC mientras la máquina funciona.",
    ],
    correctOption: 1,
    feedback: "La HMI es interfaz de operación y supervisión. La lógica de permisos, enclavamientos y control debe residir en el PLC; la HMI no debe puentear la lógica de seguridad.",
  },
  "estrella-triangulo": {
    question: "¿Qué condición de diseño es innegociable durante el cambio de estrella a triángulo?",
    options: [
      "Los dos contactores deben solaparse brevemente.",
      "Estrella y triángulo no pueden estar cerrados a la vez; debe existir interbloqueo y transición segura.",
      "El térmico debe ignorarse durante la transición.",
    ],
    correctOption: 1,
    feedback: "Una simultaneidad puede causar un cortocircuito. Se requiere interbloqueo eléctrico y mecánico y un diseño validado por personal cualificado.",
  },
  "contador-ctu": {
    question: "Un sensor permanece activo durante diez scans mientras pasa una pieza. ¿Cuántas unidades debería sumar un CTU por ese único evento?",
    options: [
      "Diez, una por scan.",
      "Una, al detectar un nuevo flanco ascendente.",
      "Ninguna hasta que el sensor pase a FALSE para siempre.",
    ],
    correctOption: 1,
    feedback: "Un CTU estándar cuenta flancos ascendentes; una señal mantenida no debe contar repetidamente cada scan.",
  },
  secuencias: {
    question: "En una secuencia de llenado y mezcla, ¿qué hace más fácil una máquina de estados?",
    options: [
      "Representar explícitamente la etapa actual y sus condiciones de transición.",
      "Activar todas las salidas y confiar en el orden de lectura.",
      "Eliminar la necesidad de gestionar fallos y paradas.",
    ],
    correctOption: 0,
    feedback: "Estados y transiciones hacen visible qué etapa está activa y qué condición autoriza avanzar, incluida la respuesta ante fallos.",
  },
  diagnostico: {
    question: "La orden de marcha está activa, pero el motor no se energiza. ¿Qué conviene comprobar primero?",
    options: [
      "Forzar directamente la salida.",
      "Seguir la cadena desde entradas y permisos hasta la lógica y la salida física.",
      "Cambiar el PID antes de revisar señales.",
    ],
    correctOption: 1,
    feedback: "Diagnostica desde las señales y permisos hasta la salida. No fuerces una salida sin entender los enclavamientos y riesgos del equipo.",
  },
  "comunicaciones-industriales": {
    question: "La documentación de un medidor Modbus indica el registro 40108. ¿Qué dirección transmite normalmente la petición en el PDU?",
    options: [
      "La cadena ASCII «40108».",
      "El offset cero 107, codificado como 0x006B.",
      "La dirección MAC del medidor.",
    ],
    correctOption: 1,
    feedback: "La notación 4xxxx es una convención documental de holding registers. El protocolo transmite un offset de 16 bits; en este ejemplo 40108 − 40001 = 107 = 0x006B. Verifica siempre la base usada por el fabricante.",
  },
};

const lessonObjectives: Record<string, string> = {
  "hardware-plc": "Al terminar: distinguirás E/S digitales y analógicas, seguirás una señal hasta la lógica y explicarás para qué sirve un bus industrial.",
  "comunicaciones-industriales": "Al terminar: identificarás capas, direcciones y campos de una trama; interpretarás una petición Modbus y distinguirás el tráfico de PROFINET y EtherNet/IP.",
  "lenguajes-plc": "Al terminar: reconocerás LD, ST y FBD, y podrás describir una misma lógica en las tres representaciones.",
  "ciclo-scan": "Al terminar: podrás explicar cuándo lee el PLC una señal y cuándo publica una salida.",
  "marcha-paro": "Al terminar: podrás explicar el enclavamiento, la memoria y la prioridad del paro.",
  "temporizador-ton": "Al terminar: podrás distinguir IN, PT, ET y Q y diseñar un retardo a la conexión.",
  "integracion-plc-hmi": "Al terminar: separarás control, interfaz, accionamientos y comunicaciones en una arquitectura PLC/HMI.",
  "pid-control": "Al terminar: identificarás SP, PV, error y MV y plantearás un lazo PID con límites y protecciones.",
  "retardo-off": "Al terminar: elegirás TOF cuando el proceso requiera una desconexión retardada.",
  "estrella-triangulo": "Al terminar: describirás una transición temporizada y explicarás por qué se necesita enclavamiento.",
  "contador-ctu": "Al terminar: distinguirás flancos de niveles y definirás PV, CV, Q y reset.",
  secuencias: "Al terminar: modelarás etapas, transiciones y respuesta segura ante paradas.",
  diagnostico: "Al terminar: seguirás una cadena de señales para localizar una causa sin saltar directamente a forzar una salida.",
};

const editorStarterCode: Record<string, string> = {
  "hardware-plc": `(* Sigue una señal desde el campo hasta el programa:

   Sensor de presión 4-20 mA
       -> entrada analógica AI
       -> escala a bar
       -> variable Presion_bar
       -> lógica de control
       -> salida hacia válvula o variador

   ¿Qué cambiaría si la señal fuera un final de carrera? *)`,
  "lenguajes-plc": `(* Mismo comportamiento: marcha enclavada con paro dominante.

   EJEMPLO GUIADO — primero entiende cada línea:
   Running := (Running OR Start) AND NOT Stop;
   Motor := Running;

   No escribas a ciegas: la lección explica asignación, operadores,
   contactos, ramas y bobinas. Las variables se declaran/configuran
   en el proyecto; este runtime de demostración no compila declaraciones IEC. *)`,
  "ciclo-scan": `(* Observa el orden de lectura, ejecución y actualización.
   Describe aquí qué pasa en cada fase. *)`,
  "integracion-plc-hmi": `(* Arquitectura a completar:
   HMI --solicitud Marcha--> PLC --permiso validado--> Variador
   HMI <--estado/alarmas---- PLC <--listo/fallo------ Variador

   Define qué ocurre ante pérdida de comunicación. *)`,
  "pid-control": `(* Lazo PID:
   SP = consigna
   PV = medida escalada
   Error = SP - PV
   PID -> MV limitada -> actuador -> proceso -> sensor -> PV

   Define rango, sentido de acción, alarmas y modo seguro. *)`,
  "temporizador-ton": `VAR_INPUT
  Presencia : BOOL;
END_VAR
VAR
  RetardoLuz : TON;
END_VAR
VAR_OUTPUT
  Lampara : BOOL;
END_VAR
(* Ajusta PT a T#2s y conecta Q con Lampara. *)`,
  "retardo-off": `VAR_INPUT
  Marcha : BOOL;
END_VAR
VAR
  Ventilacion : TOF;
END_VAR
VAR_OUTPUT
  Extractor : BOOL;
END_VAR
Ventilacion(IN := Marcha, PT := T#30s);
Extractor := Ventilacion.Q;`,
  "estrella-triangulo": `VAR_INPUT
  Start : BOOL;
  Stop : BOOL;
  TermicoOK : BOOL;
END_VAR
VAR
  TiempoArranque : TON;
END_VAR
VAR_OUTPUT
  Principal : BOOL;
  Estrella : BOOL;
  Triangulo : BOOL;
END_VAR
(* Diseña la secuencia y el enclavamiento estrella-triangulo. *)`,
  "contador-ctu": `VAR_INPUT
  SensorPieza : BOOL;
  ResetLote : BOOL;
END_VAR
VAR
  Piezas : CTU;
END_VAR
VAR_OUTPUT
  LoteCompleto : BOOL;
END_VAR
(* Define PV y conecta CV/Q con el control de la cinta. *)`,
  secuencias: `(* Estados sugeridos:
   REPOSO -> LLENADO -> LAVADO -> VACIADO
   Define transiciones, acciones y parada segura. *)`,
  diagnostico: `(* Registra en cada scan:
   entradas -> condiciones -> memoria -> salidas
   Anota la primera condición que no coincide con lo esperado. *)`,
};

const demoProgram = `VAR_INPUT
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
Motor := Running;`;
const scanPeriodMs = 100;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function compileDiagnostic(error: unknown): CompileDiagnostic | null {
  if (typeof error !== "object" || error === null || !("kind" in error)) {
    return null;
  }
  if (error.kind !== "compile" || !("line" in error) || !("column" in error) || !("message" in error)) {
    return null;
  }
  const { line, column, message } = error;
  if (
    typeof line !== "number" ||
    typeof column !== "number" ||
    typeof message !== "string"
  ) return null;

  return { line, column, message };
}

function ScanPreview({ theme }: { theme: "dark" | "light" }) {
  const programSourceRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const {
    createMachine,
    initializationError,
    machineRef: runtimeRef,
    ready,
    validate,
  } = usePlcMachine(demoProgram, scanPeriodMs);
  const trace = useExecutionTrace();
  const intervalRef = useRef<number | null>(null);
  const scanActionRef = useRef<(animate?: boolean) => void>(() => {});
  const activeProgramRef = useRef(demoProgram);
  const [autoRunning, setAutoRunning] = useState(false);
  const [slowMotionRunning, setSlowMotionRunning] = useState(false);
  const {
    activeAssignmentTarget,
    activeStatementLine,
    activeTraceIndex,
    clear: clearExecutionTrace,
    executionTrace,
    inProgressRef: scanInProgressRef,
    isScanning,
    record: recordExecutionTrace,
    reset: resetExecutionTrace,
  } = trace;
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<CompileDiagnostic | null>(
    null,
  );
  const [compileWarnings, setCompileWarnings] = useState<CompilerWarning[]>([]);
  const [isValidatingProgram, setIsValidatingProgram] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [programView, setProgramView] = useState<"st" | "ladder">("st");
  const [ladderElements, setLadderElements] = useState<
    Record<number, LadderElement[]>
  >({ 0: [], 1: [] });
  const ladderElementIdRef = useRef(0);
  const [programSource, setProgramSource] = useState(demoProgram);
  const [activeProgram, setActiveProgram] = useState(demoProgram);
  const [inputNames, setInputNames] = useState<string[]>([]);
  const [outputNames, setOutputNames] = useState<string[]>([]);
  const [variableNames, setVariableNames] = useState<string[]>([]);
  const [ladderCompatible, setLadderCompatible] = useState(false);
  const [inputs, setInputs] = useState<boolean[]>([]);
  const [scannedInputs, setScannedInputs] = useState<boolean[]>([]);
  const [outputs, setOutputs] = useState<boolean[]>([]);
  const [variables, setVariables] = useState<boolean[]>([]);
  const [scanNumber, setScanNumber] = useState("0");

  function loadProgram(machine: PlcMachineHandle) {
    setLadderCompatible(machine.ladder_latch_compatible());
    setInputNames(
      Array.from({ length: machine.input_count() }, (_, index) =>
        machine.input_name(index),
      ),
    );
    setOutputNames(
      Array.from({ length: machine.output_count() }, (_, index) =>
        machine.output_name(index),
      ),
    );
    setVariableNames(
      Array.from({ length: machine.variable_count() }, (_, index) =>
        machine.variable_name(index),
      ),
    );
    setInputs(Array(machine.input_count()).fill(false));
    setScannedInputs(Array(machine.input_count()).fill(false));
    setOutputs(Array(machine.output_count()).fill(false));
    setVariables(Array(machine.variable_count()).fill(false));
    setScanNumber("0");
    resetExecutionTrace();
  }

  function clearTrace() {
    clearExecutionTrace();
  }

  useEffect(() => {
    if (!ready || programSource === activeProgram) {
      setIsValidatingProgram(false);
      return;
    }

    setIsValidatingProgram(true);
    const timeoutId = window.setTimeout(() => {
      if (!validate) {
        setIsValidatingProgram(false);
        return;
      }

      try {
        const validation = validate(programSource);
        if (!validation) {
          setIsValidatingProgram(false);
          return;
        }
        setCompileError(validation.diagnostic);
        setCompileWarnings(validation.warnings);
        setRuntimeError(null);
      } catch (error) {
        setCompileWarnings([]);
        setCompileError(null);
        setRuntimeError(errorMessage(error));
      } finally {
        setIsValidatingProgram(false);
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [activeProgram, programSource, ready, validate]);

  useEffect(() => {
    if (ready && runtimeRef.current) loadProgram(runtimeRef.current);
  }, [ready]);

  useEffect(() => {
    if (initializationError) setRuntimeError(initializationError);
  }, [initializationError]);

  function compileProgram() {
    if (!createMachine) return;

    stopAutoScan();
    clearTrace();
    try {
      const nextMachine = createMachine(programSource);
      if (!nextMachine) return;
      runtimeRef.current?.free();
      runtimeRef.current = nextMachine;
      activeProgramRef.current = programSource;
      setActiveProgram(programSource);
      loadProgram(nextMachine);
      if (!nextMachine.ladder_latch_compatible()) setProgramView("st");
      setCompileError(null);
      setCompileWarnings([]);
      setRuntimeError(null);
    } catch (error) {
      const diagnostic = compileDiagnostic(error);
      setCompileError(diagnostic);
      setRuntimeError(
        diagnostic
          ? "No se pudo compilar el programa. Revisa el diagnóstico del editor."
          : errorMessage(error),
      );
      if (diagnostic) {
        setEditorOpen(true);
        const editor = programSourceRef.current;
        editor?.focus();
        editor?.revealPositionInCenter({
          lineNumber: diagnostic.line,
          column: diagnostic.column,
        });
        editor?.setSelection({
          startLineNumber: diagnostic.line,
          startColumn: diagnostic.column,
          endLineNumber: diagnostic.line,
          endColumn: diagnostic.column + 1,
        });
      }
    }
  }

  function updateInput(index: number) {
    const machine = runtimeRef.current;
    if (!machine || programSource !== activeProgramRef.current) return;

    const value = !inputs[index];
    try {
      machine.set_input(index, value);
      setInputs((current) =>
        current.map((input, inputIndex) =>
          inputIndex === index ? value : input,
        ),
      );
      setRuntimeError(null);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }

  function executeScan(animate = true) {
    const machine = runtimeRef.current;
    if (
      !machine ||
      scanInProgressRef.current ||
      programSource !== activeProgramRef.current
    ) {
      return;
    }

    try {
      const nextScan = machine.scan();
      const nextOutputs = Array.from(
        { length: machine.output_count() },
        (_, index) => machine.output(index),
      );
      const nextVariables = Array.from(
        { length: machine.variable_count() },
        (_, index) => machine.variable(index),
      );
      const assignments = Array.from(
        { length: machine.trace_count() },
        (_, index): AssignmentTrace => ({
          line: machine.trace_line(index),
          column: machine.trace_column(index),
          targetKind: machine.trace_target_kind(index),
          targetIndex: machine.trace_target_index(index),
          value: machine.trace_value(index),
        }),
      );
      const commitScan = () => {
        setOutputs(nextOutputs);
        setVariables(nextVariables);
        setScanNumber(nextScan.toString());
        setRuntimeError(null);
      };
      setScannedInputs([...inputs]);
      recordExecutionTrace(assignments, animate, outputNames, variableNames);
      commitScan();
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }

  scanActionRef.current = executeScan;

  useEffect(() => {
    if (!ready || !autoRunning) return;

    const intervalDelay = runtimeRef.current?.scan_period_ms() ?? scanPeriodMs;
    const intervalId = window.setInterval(
      () => scanActionRef.current(false),
      intervalDelay,
    );
    intervalRef.current = intervalId;
    return () => {
      window.clearInterval(intervalId);
      if (intervalRef.current === intervalId) intervalRef.current = null;
    };
  }, [activeProgram, autoRunning, ready]);

  useEffect(() => {
    if (!ready || !slowMotionRunning) return;

    const scanDelay = runtimeRef.current?.scan_period_ms() ?? scanPeriodMs;
    const traceDelay = Math.max(
      scanDelay,
      executionTrace.length * 360 + 300,
    );
    const intervalId = window.setInterval(
      () => scanActionRef.current(true),
      traceDelay,
    );
    intervalRef.current = intervalId;
    return () => {
      window.clearInterval(intervalId);
      if (intervalRef.current === intervalId) intervalRef.current = null;
    };
  }, [executionTrace.length, slowMotionRunning, ready]);

  function stopAutoScan() {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoRunning(false);
    setSlowMotionRunning(false);
    clearTrace();
  }

  function updateProgramSource(source: string) {
    if (source === programSource) return;
    if (source !== activeProgramRef.current) stopAutoScan();
    setCompileError(null);
    setCompileWarnings([]);
    setRuntimeError(null);
    setProgramSource(source);
  }

  function focusCompileError() {
    if (!compileError || !programSourceRef.current) return;

    const editor = programSourceRef.current;
    editor.focus();
    editor.revealPositionInCenter({
      lineNumber: compileError.line,
      column: compileError.column,
    });
    editor.setSelection({
      startLineNumber: compileError.line,
      startColumn: compileError.column,
      endLineNumber: compileError.line,
      endColumn: compileError.column + 1,
    });
  }

  function resetSimulator() {
    stopAutoScan();
    clearTrace();
    try {
      const nextMachine = createMachine(activeProgramRef.current);
      if (!nextMachine) return;
      runtimeRef.current?.free();
      runtimeRef.current = nextMachine;
      loadProgram(nextMachine);
      if (!nextMachine.ladder_latch_compatible()) setProgramView("st");
      setProgramSource(activeProgramRef.current);
      setCompileError(null);
      setRuntimeError(null);
    } catch (error) {
      setRuntimeError(errorMessage(error));
    }
  }

  const hasUncompiledChanges = programSource !== activeProgram;

  const ladderAvailable =
    programSource === activeProgram && ladderCompatible;
  const ladderUnavailableMessage =
    programSource !== activeProgram
      ? "Compila los cambios para volver a habilitar LD."
      : ladderAvailable
        ? "LD está disponible para programas con Start, Stop, Running y Motor."
        : "Para mostrar esta vista, declara Start/Stop, Running y Motor.";
  const activeLadderRung = isScanning ? activeTraceIndex : null;
  const activeLadderRungLabel =
    activeLadderRung !== null && activeLadderRung >= 0
      ? `Peldaño ${activeLadderRung + 1}`
      : "Peldaño";

  function addLadderElement(rung: number, kind: LadderElementKind) {
    const element = { id: ladderElementIdRef.current + 1, kind };
    ladderElementIdRef.current = element.id;
    setLadderElements((current) => ({
      ...current,
      [rung]: [...(current[rung] ?? []), element],
    }));
  }

  function removeLadderElement(rung: number, id: number) {
    setLadderElements((current) => ({
      ...current,
      [rung]: (current[rung] ?? []).filter((element) => element.id !== id),
    }));
  }

  function clearLadderElements() {
    setLadderElements({ 0: [], 1: [] });
    ladderElementIdRef.current = 0;
  }

  function handleProgramViewTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    const views: ("st" | "ladder")[] = ladderAvailable
      ? ["st", "ladder"]
      : ["st"];
    const currentIndex = views.indexOf(programView);
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % views.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + views.length) % views.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = views.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextView = views[nextIndex];
    setProgramView(nextView);
    requestAnimationFrame(() => {
      document.getElementById(`program-view-${nextView}`)?.focus();
    });
  }

  return (
    <div className="simulator-workspace">
    <section className="preview-card" aria-labelledby="simulator-title">
      <div className="preview-topbar">
        <div className="preview-title">
          <span
            className={`preview-led${ready ? "" : runtimeError ? " is-error" : " is-loading"}`}
            aria-hidden="true"
          />
          <span id="simulator-title">Prueba el programa</span>
        </div>
        <span
          className={`runtime-badge${runtimeError ? " is-error" : ready ? " is-ready" : ""}`}
          role="status"
        >
          {ready ? "Listo" : runtimeError ? "Error" : "Cargando"}
        </span>
      </div>

      <p className="simulator-instructions">
        Activa Start y ejecuta un scan. Suelta Start: el motor sigue activo.
        Pulsa Stop para detenerlo.
      </p>

      <div className="preview-body">
        <section className="io-column input-panel" aria-labelledby="input-heading">
          <div className="io-heading">
            <span className="step-label">1</span>
            <span id="input-heading">Entradas</span>
          </div>
          {inputNames.map((name, index) => (
            <button
              className={`io-row io-input${inputs[index] ? " is-on" : ""}`}
              key={name}
              type="button"
              aria-pressed={inputs[index]}
              disabled={!ready || hasUncompiledChanges || isScanning}
              onClick={() => updateInput(index)}
            >
              <span className="io-indicator" aria-hidden="true" />
              <span className="input-copy">
                <span className="signal-name">{name}</span>
                <span className="signal-address">{`I0.${index}`}</span>
              </span>
              <span className={`signal-state${inputs[index] ? " is-on" : ""}`}>
                {inputs[index] ? "ACTIVA" : "INACTIVA"}
              </span>
            </button>
          ))}
          <p className="panel-hint">
            Start arranca el motor; Stop lo detiene.
          </p>
        </section>

        <div className="scan-controls">
          <div className="scan-action-copy">
            <span className="step-label">2</span>
            <span>
              <strong>
                {autoRunning
                  ? "Ejecución en tiempo real"
                  : slowMotionRunning
                    ? "Cámara lenta"
                  : isScanning
                    ? "Ejecutando programa"
                    : "Modo paso a paso"}
              </strong>
              <small>
                Scan {scanNumber} · {runtimeRef.current?.scan_period_ms() ?? scanPeriodMs} ms
              </small>
            </span>
          </div>
          <div className="scan-actions">
            <button
              className="scan-step-button"
              type="button"
              disabled={
                !ready || autoRunning || slowMotionRunning || hasUncompiledChanges || isScanning
              }
              onClick={() => executeScan(true)}
            >
              Un scan
            </button>
            <button
              className={`scan-button${autoRunning ? " is-running" : ""}`}
              type="button"
              disabled={!ready || hasUncompiledChanges || (isScanning && !autoRunning && !slowMotionRunning)}
              aria-pressed={autoRunning}
              onClick={() => {
                if (autoRunning) {
                  stopAutoScan();
                } else {
                  clearTrace();
                  setSlowMotionRunning(false);
                  setAutoRunning(true);
                }
              }}
            >
              {autoRunning ? "Pausar" : "Run"}{" "}
              <span aria-hidden="true">{autoRunning ? "Ⅱ" : "▶"}</span>
            </button>
            <button
              className={`scan-button scan-slow-button${slowMotionRunning ? " is-running" : ""}`}
              type="button"
              disabled={!ready || hasUncompiledChanges || (isScanning && !slowMotionRunning && !autoRunning)}
              aria-pressed={slowMotionRunning}
              onClick={() => {
                if (slowMotionRunning) {
                  stopAutoScan();
                } else {
                  clearTrace();
                  setAutoRunning(false);
                  setSlowMotionRunning(true);
                }
              }}
            >
              {slowMotionRunning ? "Pausar" : "Cámara lenta"}
            </button>
          </div>
        </div>

        <section
          className="io-column output-panel"
          aria-labelledby="output-heading"
          aria-live="polite"
        >
          <div className="io-heading">
            <span className="step-label">3</span>
            <span id="output-heading">Salidas</span>
          </div>
          {outputNames.map((name, index) => (
            <div
              className={`io-output${outputs[index] ? " is-on" : ""}${activeAssignmentTarget?.toUpperCase() === name.toUpperCase() ? " is-traced" : ""}`}
              key={name}
              aria-label={`${name}: ${outputs[index] ? "activa" : "inactiva"}`}
            >
              <span className="io-indicator" aria-hidden="true" />
              <span className="input-copy">
                <span className="signal-name">{name}</span>
                <span className="signal-address">{`Q0.${index}`}</span>
              </span>
              <span className={`signal-state${outputs[index] ? " is-on" : ""}`}>
                {outputs[index] ? "ACTIVA" : "INACTIVA"}
              </span>
            </div>
          ))}
          <p className="panel-hint">
            Las salidas se actualizan al ejecutar el scan.
          </p>
        </section>
        <ConveyorTwin
          motorOn={outputs[0] ?? false}
          cycleRunning={autoRunning || slowMotionRunning}
        />
      </div>

      {hasUncompiledChanges && (
        <p className="pending-program" role="status">
          El código ha cambiado. Compílalo antes de continuar ejecutando el PLC.
        </p>
      )}
      {inputs.some((input, index) => input !== scannedInputs[index]) && (
        <p className="pending-inputs" role="status">
          Entradas cambiadas: ejecuta un scan para aplicar los cambios.
        </p>
      )}
      {variableNames.length > 0 && (
        <div className="memory-state" aria-live="polite">
          <span className="memory-heading">Memoria interna</span>
          {variableNames.map((name, index) => (
            <span
              className={`memory-value${variables[index] ? " is-on" : ""}${activeAssignmentTarget?.toUpperCase() === name.toUpperCase() ? " is-traced" : ""}`}
              key={name}
            >
              <span className="io-indicator" aria-hidden="true" />
              {name} = {variables[index] ? "TRUE" : "FALSE"}
            </span>
          ))}
        </div>
      )}
      <div className="simulator-tools">
        <span>
          {autoRunning
            ? "El PLC ejecuta scans al periodo configurado."
            : slowMotionRunning
              ? "Cámara lenta: cada escritura se ilumina antes del siguiente scan."
              : "Ejecuta un scan, inicia Run en tiempo real o usa cámara lenta."}
        </span>
        <button type="button" disabled={!ready} onClick={resetSimulator}>
          Reiniciar
        </button>
      </div>
      {runtimeError && (
        <p className="runtime-error" role="alert">
          Error de compilación o ejecución: {runtimeError}
        </p>
      )}

    </section>
    <aside className="st-panel" aria-labelledby="st-panel-title">
      <div className="st-panel-header">
        <div>
          <p className="st-panel-eyebrow">PROGRAMA DEL PLC</p>
          <h2 id="st-panel-title">Programa PLC</h2>
        </div>
        <div className="program-view-tabs" role="tablist" aria-label="Vista del programa">
          <button
            id="program-view-st"
            className={`program-view-tab${programView === "st" ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={programView === "st"}
            aria-controls="program-view-content"
            tabIndex={programView === "st" ? 0 : -1}
            onKeyDown={handleProgramViewTabKeyDown}
            onClick={() => setProgramView("st")}
          >
            ST
          </button>
          <button
            id="program-view-ladder"
            className={`program-view-tab${programView === "ladder" ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={programView === "ladder"}
            aria-controls="program-view-content"
            disabled={!ladderAvailable}
            tabIndex={programView === "ladder" ? 0 : -1}
            title={ladderAvailable ? undefined : ladderUnavailableMessage}
            onKeyDown={handleProgramViewTabKeyDown}
            onClick={() => setProgramView("ladder")}
          >
            LD
          </button>
        </div>
      </div>
      <div id="program-view-content" role="tabpanel" aria-labelledby={`program-view-${programView}`}>
        {programView === "st" ? (
          <>
            <p className="st-panel-help">
              Cada scan resuelve las líneas en orden. La línea activa se ilumina.
            </p>
            <StructuredTextTrace
              source={activeProgram}
              activeLine={activeStatementLine}
            />
          </>
        ) : (
          <LadderPractice
            activeRung={activeLadderRung}
            rungResults={executionTrace.map((event) => event.value)}
            start={scannedInputs[0] ?? false}
            stop={scannedInputs[1] ?? false}
            running={variables[0] ?? false}
            motor={outputs[0] ?? false}
            inputsPending={inputs.some(
              (input, index) => input !== scannedInputs[index],
            )}
            elements={ladderElements}
            onAddElement={addLadderElement}
            onRemoveElement={removeLadderElement}
            onClearElements={clearLadderElements}
          />
        )}
      </div>
      <div className="st-trace-status" aria-live="polite">
        <span className={`st-trace-dot${isScanning ? " is-running" : ""}`} />
        {isScanning
          ? `${programView === "ladder" ? activeLadderRungLabel : `Línea ${(activeStatementLine ?? 0) + 1}`} · ${activeAssignmentTarget}`
          : `Scan ${scanNumber} · ${scanPeriodMs} ms`}
      </div>
      {programView === "st" && <details
        className="program-editor"
        open={editorOpen}
        onToggle={(event) => setEditorOpen(event.currentTarget.open)}
      >
        <summary>Editar programa</summary>
        <label className="editor-label">
          PROGRAMA PLC
        </label>
        <p id="program-help" className="editor-help">
          Editor Monaco con resaltado Structured Text, cierre automático de
          paréntesis/comentarios y sangría contextual. Ctrl/Cmd + / comenta
          líneas; Ctrl/Cmd + Z deshace y Ctrl/Cmd + Shift+Z rehace. Los errores
          aparecen marcados en el editor. Ctrl/Cmd + Enter/S compila.
        </p>
        {editorOpen && (
          <Suspense fallback={<div className="plc-monaco-editor">Cargando editor…</div>}>
            <PlcEditor
              value={programSource}
              theme={theme}
              diagnostic={compileError}
              activeLine={activeStatementLine}
              onChange={updateProgramSource}
              onCompile={compileProgram}
              onMount={(editor) => { programSourceRef.current = editor; }}
            />
          </Suspense>
        )}
        {compileError && (
          <div
            id="program-diagnostic"
            className="program-diagnostic"
            role="alert"
          >
            <span>
              Línea {compileError.line}, columna {compileError.column}:{" "}
              {compileError.message}
            </span>
            <button type="button" onClick={focusCompileError}>
              Ir al error
            </button>
          </div>
        )}
        {compileWarnings.length > 0 && (
          <ul className="program-warnings" aria-label="Avisos del compilador">
            {compileWarnings.map((warning) => (
              <li key={`${warning.code}-${warning.line}-${warning.column}`}>
                Línea {warning.line}, columna {warning.column}: {warning.message}
              </li>
            ))}
          </ul>
        )}
        <p
          className={`program-status${hasUncompiledChanges ? " is-pending" : ""}${isValidatingProgram ? " is-checking" : ""}`}
          aria-live="polite"
        >
          {isValidatingProgram
            ? "Comprobando sintaxis…"
            : hasUncompiledChanges
            ? "Hay cambios sin compilar."
            : "Este es el programa que está ejecutando el PLC."}
        </p>
        <button
          className="compile-button"
          type="button"
          disabled={!ready}
          title="Compilar y reiniciar (Ctrl/Cmd + Enter o Ctrl/Cmd + S)"
          onClick={compileProgram}
        >
          Compilar y reiniciar
        </button>
        {hasUncompiledChanges && (
          <button
            className="discard-button"
            type="button"
            onClick={() => updateProgramSource(activeProgram)}
          >
            Descartar cambios
          </button>
        )}
      </details>}
    </aside>
    </div>
  );
}

function TimerPractice() {
  const [enabled, setEnabled] = useState(false);
  const [presetMs, setPresetMs] = useState(2000);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [autoRunning, setAutoRunning] = useState(false);
  const timerDone = elapsedMs >= presetMs;
  const progress = Math.min(100, (elapsedMs / presetMs) * 100);

  function executeTimerScan() {
    setScanCount((current) => current + 1);
    setElapsedMs((current) =>
      enabled ? Math.min(current + scanPeriodMs, presetMs) : 0,
    );
  }

  useEffect(() => {
    if (!autoRunning) return;

    const intervalId = window.setInterval(executeTimerScan, 600);
    return () => window.clearInterval(intervalId);
  }, [autoRunning, enabled, presetMs]);

  function resetTimer() {
    setAutoRunning(false);
    setEnabled(false);
    setElapsedMs(0);
    setScanCount(0);
  }

  function changePreset(value: number) {
    setPresetMs(value);
    setElapsedMs(0);
    setScanCount(0);
  }

  return (
    <section className="timer-practice" id="practica-ton" aria-labelledby="timer-title">
      <div className="timer-practice-heading">
        <div>
          <p className="eyebrow">PRÁCTICA 02 · TEMPORIZADOR TON</p>
          <h2 id="timer-title">Enciende una lámpara con retardo.</h2>
          <p>
            Activa el sensor y observa cómo TON acumula tiempo virtual scan a
            scan. Si desactivas la entrada, el temporizador no retiene el
            tiempo: vuelve a cero en el siguiente scan.
          </p>
        </div>
        <span className="timer-language-tag">IEC 61131-3</span>
      </div>

      <div className="timer-practice-grid">
        <div className="timer-lab" aria-label="Simulador del temporizador TON">
          <div className="timer-input-row">
            <div>
              <span className="timer-field-label">ENTRADA · IN</span>
              <strong>Sensor de presencia</strong>
            </div>
            <button
              className={`timer-input-toggle${enabled ? " is-on" : ""}`}
              type="button"
              aria-pressed={enabled}
              onClick={() => setEnabled((current) => !current)}
            >
              {enabled ? "ACTIVO" : "INACTIVO"}
            </button>
          </div>

          <div className="timer-device">
            <div className="timer-device-header">
              <span>TON · T1</span>
              <label>
                PT
                <select
                  aria-label="Tiempo preseleccionado del temporizador"
                  value={presetMs}
                  onChange={(event) => changePreset(Number(event.target.value))}
                >
                  <option value={1000}>1 s</option>
                  <option value={2000}>2 s</option>
                  <option value={3000}>3 s</option>
                </select>
              </label>
            </div>
            <div className="timer-values">
              <span>ET <strong>{(elapsedMs / 1000).toFixed(1)} s</strong></span>
              <span>Q <strong className={timerDone ? "is-on" : ""}>{timerDone ? "TRUE" : "FALSE"}</strong></span>
            </div>
            <div
              className="timer-progress-track"
              role="progressbar"
              aria-label="Tiempo acumulado del temporizador"
              aria-valuemin={0}
              aria-valuemax={presetMs}
              aria-valuenow={elapsedMs}
              aria-valuetext={`${(elapsedMs / 1000).toFixed(1)} de ${presetMs / 1000} segundos`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className={`timer-lamp${timerDone ? " is-on" : ""}`}>
              <span aria-hidden="true" />
              Lámpara {timerDone ? "encendida" : "apagada"}
            </div>
          </div>

          <div className="timer-controls">
            <span>Scan {scanCount} · {scanPeriodMs} ms virtuales</span>
            <div>
              <button
                type="button"
                disabled={autoRunning}
                onClick={executeTimerScan}
              >
                Un scan
              </button>
              <button
                className="timer-run-button"
                type="button"
                aria-pressed={autoRunning}
                onClick={() => setAutoRunning((current) => !current)}
              >
                {autoRunning ? "Pausar" : "Iniciar scans"}
              </button>
              <button type="button" onClick={resetTimer}>Reiniciar</button>
            </div>
          </div>
        </div>

        <aside className="timer-theory" aria-label="Teoría del temporizador TON">
          <span className="timer-theory-label">CÓMO SE LEE</span>
          <dl>
            <div>
              <dt>IN</dt>
              <dd>La condición que habilita el temporizador.</dd>
            </div>
            <div>
              <dt>PT</dt>
              <dd>El tiempo objetivo: aquí se ajusta entre 1 y 3 segundos.</dd>
            </div>
            <div>
              <dt>ET</dt>
              <dd>El tiempo transcurrido; aumenta 100 ms por cada scan habilitado.</dd>
            </div>
            <div>
              <dt>Q</dt>
              <dd>Se activa al alcanzar PT. TON es no retentivo: IN = FALSE reinicia ET y Q en el siguiente scan.</dd>
            </div>
          </dl>
          <p className="timer-note">
            Modelo didáctico todavía independiente del compilador ST/Rust. Para
            que el cambio se vea con claridad, el modo automático ejecuta un
            scan cada 0,6 s reales; el tiempo del PLC sigue siendo virtual.
          </p>
        </aside>
      </div>
    </section>
  );
}

function ScanCycleAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const explanations = [
    "Se toma una imagen de las entradas. Los cambios físicos ocurridos durante el scan se leen en el siguiente ciclo.",
    "El programa se ejecuta en orden usando esa imagen; las variables internas pueden cambiar durante el cálculo.",
    "El PLC publica las salidas calculadas. Después empieza un nuevo scan y vuelve a leer las entradas.",
  ];

  useEffect(() => {
    if (!playing) return;

    const intervalId = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % scanSteps.length);
    }, 1600);
    return () => window.clearInterval(intervalId);
  }, [playing]);

  function advanceStep() {
    setActiveStep((current) => (current + 1) % scanSteps.length);
  }

  return (
    <div className="scan-cycle-demo">
      <div className="scan-cycle-track" aria-label="Fases del ciclo de scan">
        {scanSteps.map((step, index) => (
          <div
            className={`scan-cycle-phase${index === activeStep ? " is-active" : ""}`}
            key={step.number}
            aria-current={index === activeStep ? "step" : undefined}
          >
            <span className="scan-cycle-number">{step.number}</span>
            <strong>{step.name}</strong>
          </div>
        ))}
      </div>
      <div className="scan-cycle-caption" aria-live="polite" aria-atomic="true">
        <span>{scanSteps[activeStep].symbol}</span>
        <p key={activeStep}>{explanations[activeStep]}</p>
      </div>
      <div className="scan-cycle-controls">
        <span>El orden se repite en cada ciclo.</span>
        <div>
          <button type="button" onClick={advanceStep}>Siguiente paso</button>
          <button
            className="scan-cycle-play"
            type="button"
            aria-pressed={playing}
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? "Pausar animación" : "Reproducir ciclo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LanguageWalkthrough() {
  const stLines = [
    {
      code: "VAR_INPUT",
      explanation:
        "Empieza el bloque de declaración de entradas: señales que el programa lee, como pulsadores.",
    },
    {
      code: "Start : BOOL;",
      explanation:
        "Declara Start como BOOL (valor TRUE o FALSE). Los dos puntos separan nombre y tipo; el punto y coma termina la declaración.",
    },
    {
      code: "Stop : BOOL;",
      explanation: "Declara otra entrada booleana, llamada Stop.",
    },
    {
      code: "END_VAR",
      explanation: "Cierra la sección de entradas.",
    },
    {
      code: "VAR_OUTPUT",
      explanation: "Empieza el bloque de variables que el programa entrega como salidas.",
    },
    {
      code: "Motor : BOOL;",
      explanation: "Declara la orden de salida Motor como booleana.",
    },
    {
      code: "END_VAR",
      explanation: "Cierra la sección de salidas.",
    },
    {
      code: "VAR",
      explanation: "Empieza el bloque de variables internas del programa.",
    },
    {
      code: "Running : BOOL;",
      explanation:
        "Declara Running como memoria booleana para recordar el enclavamiento entre ciclos.",
    },
    {
      code: "END_VAR",
      explanation: "Cierra la sección de variables internas.",
    },
    {
      code: "Running := (Running OR Start) AND NOT Stop;",
      explanation:
        "Calcula el nuevo estado de Running. La parte entre paréntesis lo mantiene o lo inicia; AND exige que ambas condiciones se cumplan y NOT invierte Stop. := asigna el resultado, no compara; el punto y coma cierra la instrucción.",
    },
    {
      code: "Motor := Running;",
      explanation:
        "Asigna el estado de Running a Motor. En un PLC real, Motor debe estar asociado a una salida física mediante la configuración del proyecto.",
    },
  ];

  return (
    <div className="language-walkthrough">
      <div className="language-walkthrough-heading">
        <p className="eyebrow">LEE ANTES DE ESCRIBIR</p>
        <h3>Una línea, pieza por pieza</h3>
        <p>
          Este ejemplo separa declaraciones (nombre y tipo de las variables) de
          instrucciones (la lógica que se ejecuta). Start y Stop son entradas,
          Running es memoria y Motor es una salida. La asignación de variables
          físicas depende de la configuración del proyecto y del fabricante.
        </p>
      </div>

      <div className="language-example">
        <h4>Structured Text (ST)</h4>
        <div className="language-code-lines">
          {stLines.map((line, index) => (
            <div className="language-code-row" key={line.code}>
              <span className="language-line-number">{index + 1}</span>
              <code>{line.code}</code>
              <p>{line.explanation}</p>
            </div>
          ))}
        </div>
        <p className="language-code-note">
          El simulador fijo ejecuta este subconjunto sencillo de ST booleano.
          El borrador de la lección no se compila al editar y el editor visual
          Ladder todavía no ejecuta los cambios; esto no sustituye un IDE de
          fabricante.
        </p>
      </div>

      <div className="language-example">
        <h4>Ladder (LD): sigue el camino de izquierda a derecha</h4>
        <div
          className="ladder-reading"
          role="img"
          aria-label="Primer peldaño: Start y Running en paralelo, Stop como contacto negado en serie y bobina Running. Segundo peldaño: contacto Running y bobina Motor."
        >
          <div className="ladder-reading-rung">
            <span className="ladder-reading-rail" aria-hidden="true" />
            <div className="ladder-reading-branches">
              <span>—| |— Start</span>
              <span>—| |— Running</span>
            </div>
            <span className="ladder-reading-element">—|/|— Stop</span>
            <span className="ladder-reading-element">—( )— Running</span>
            <span className="ladder-reading-rail" aria-hidden="true" />
          </div>
          <p>
            Las dos ramas en paralelo significan OR: basta Start o la memoria
            Running. El contacto Stop negado va en serie: si Stop se activa,
            interrumpe el camino. La bobina escribe el resultado en Running.
          </p>
          <div className="ladder-reading-rung ladder-reading-output">
            <span className="ladder-reading-rail" aria-hidden="true" />
            <span className="ladder-reading-element">—| |— Running</span>
            <span className="ladder-reading-element">—( )— Motor</span>
            <span className="ladder-reading-rail" aria-hidden="true" />
          </div>
          <p>
            En el segundo peldaño, el contacto Running gobierna la bobina
            Motor. Un contacto normalmente abierto conduce cuando su variable
            vale TRUE; el contacto negado conduce cuando vale FALSE.
          </p>
        </div>
      </div>

      <div className="language-fbd-note">
        <strong>¿Y en FBD?</strong>
        <span>
          Los bloques OR (Running, Start), AND y NOT (Stop) expresan la misma
          condición; otro bloque conecta Running con Motor. En cada lenguaje
          cambia el dibujo, no el objetivo lógico.
        </span>
      </div>
    </div>
  );
}

type CommunicationProtocol =
  | "modbus-rtu"
  | "modbus-tcp"
  | "profinet"
  | "ethernet-ip";

type FrameField = {
  name: string;
  value: string;
  purpose: string;
};

function modbusCrc16(bytes: number[]) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

function hexByte(value: number) {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function isCommunicationProtocol(value: string): value is CommunicationProtocol {
  return value === "modbus-rtu" ||
    value === "modbus-tcp" ||
    value === "profinet" ||
    value === "ethernet-ip";
}

function CommunicationFrameLab() {
  const [protocol, setProtocol] =
    useState<CommunicationProtocol>("modbus-rtu");
  const [unitId, setUnitId] = useState("1");
  const [registerOffset, setRegisterOffset] = useState("107");
  const [quantity, setQuantity] = useState("3");
  const [cipMessaging, setCipMessaging] = useState<"explicit" | "implicit">(
    "explicit",
  );
  const rawUnitId = Number(unitId);
  const rawOffset = Number(registerOffset);
  const rawQuantity = Number(quantity);
  const validModbusSettings =
    Number.isInteger(rawUnitId) &&
    rawUnitId >= 1 &&
    rawUnitId <= 247 &&
    Number.isInteger(rawOffset) &&
    rawOffset >= 0 &&
    rawOffset <= 65535 &&
    Number.isInteger(rawQuantity) &&
    rawQuantity >= 1 &&
    rawQuantity <= 125 &&
    rawOffset + rawQuantity <= 65536;
  const parsedUnitId = Math.trunc(Math.min(247, Math.max(1, Number(unitId) || 1)));
  const parsedOffset = Math.trunc(Math.min(65535, Math.max(0, Number(registerOffset) || 0)));
  const parsedQuantity = Math.trunc(Math.min(125, Math.max(1, Number(quantity) || 1)));
  const offsetHex = parsedOffset.toString(16).padStart(4, "0").toUpperCase();
  let fields: FrameField[] = [];
  let frameBytes: number[] = [];
  let explanation = "";
  let addressSummary = "";

  if (protocol === "modbus-rtu") {
    const pdu = [
      0x03,
      (parsedOffset >> 8) & 0xff,
      parsedOffset & 0xff,
      (parsedQuantity >> 8) & 0xff,
      parsedQuantity & 0xff,
    ];
    const payload = [parsedUnitId, ...pdu];
    const crc = modbusCrc16(payload);
    frameBytes = [...payload, crc & 0xff, (crc >> 8) & 0xff];
    fields = [
      {
        name: "Dirección de unidad",
        value: hexByte(parsedUnitId),
        purpose: "Identifica el esclavo/dispositivo serie; 0 se reserva para broadcast en peticiones.",
      },
      {
        name: "Función",
        value: "03",
        purpose: "Leer holding registers. El PDU continúa con offset y cantidad.",
      },
      {
        name: "Offset inicial",
        value: `${hexByte(parsedOffset >> 8)} ${hexByte(parsedOffset & 0xff)}`,
        purpose: `${parsedOffset} decimal = 0x${offsetHex}; los 16 bits se envían big-endian.`,
      },
      {
        name: "Cantidad",
        value: `${hexByte(parsedQuantity >> 8)} ${hexByte(parsedQuantity & 0xff)}`,
        purpose: `${parsedQuantity} registros solicitados, codificados como entero de 16 bits big-endian.`,
      },
      {
        name: "CRC-16",
        value: `${hexByte(crc & 0xff)} ${hexByte((crc >> 8) & 0xff)}`,
        purpose: "Comprobación de integridad Modbus RTU; se transmite byte bajo primero.",
      },
    ];
    explanation =
      "La trama RTU se delimita por intervalos de silencio en la línea serie. No incluye cabecera Ethernet, IP ni puerto TCP.";
    addressSummary =
      `La notación habitual 4${String(parsedOffset + 40001).padStart(4, "0")} corresponde aquí al offset ${parsedOffset} (0x${offsetHex}). La numeración 4xxxx es convención documental, no los bytes que viajan.`;
  } else if (protocol === "modbus-tcp") {
    const pdu = [
      0x03,
      (parsedOffset >> 8) & 0xff,
      parsedOffset & 0xff,
      (parsedQuantity >> 8) & 0xff,
      parsedQuantity & 0xff,
    ];
    const mbapLength = 1 + pdu.length;
    frameBytes = [
      0x00, 0x01,
      0x00, 0x00,
      (mbapLength >> 8) & 0xff, mbapLength & 0xff,
      parsedUnitId,
      ...pdu,
    ];
    fields = [
      {
        name: "Transaction ID",
        value: "00 01",
        purpose: "Permite asociar respuesta y petición en la conexión TCP.",
      },
      {
        name: "Protocol ID",
        value: "00 00",
        purpose: "Cero identifica Modbus en esta cabecera MBAP.",
      },
      {
        name: "Length",
        value: `00 ${hexByte(mbapLength)}`,
        purpose: `${mbapLength} bytes siguientes: Unit ID más PDU.`,
      },
      {
        name: "Unit ID",
        value: hexByte(parsedUnitId),
        purpose: "Identifica unidad detrás de una pasarela; en TCP directo puede ser un valor configurado por el equipo.",
      },
      {
        name: "PDU",
        value: pdu.map(hexByte).join(" "),
        purpose: `Función 03, offset 0x${offsetHex} y cantidad ${parsedQuantity}; campos multibyte big-endian.`,
      },
    ];
    explanation =
      "Modbus TCP lleva MBAP + PDU dentro de un flujo TCP, normalmente al puerto destino 502. No añade el CRC RTU: TCP/Ethernet ya aportan mecanismos de integridad propios.";
    addressSummary =
      `En la aplicación, la unidad se localiza por IP y puerto TCP/502; dentro de Modbus, el dato pedido usa el offset ${parsedOffset} (0x${offsetHex}), no una MAC ni el puerto.`;
  } else if (protocol === "profinet") {
    fields = [
      {
        name: "Ethernet",
        value: "MAC destino · MAC origen · EtherType 0x8892",
        purpose: "PROFINET RT usa tramas Ethernet de capa 2; no es una petición Modbus sobre TCP.",
      },
      {
        name: "FrameID",
        value: "Depende de la relación configurada",
        purpose: "Permite reconocer el tipo de intercambio cíclico asociado a una relación IO.",
      },
      {
        name: "Datos IO",
        value: "Entradas / salidas por módulos",
        purpose: "Orden y longitud dependen de slots, subslots y configuración del dispositivo.",
      },
      {
        name: "Estado y ciclo",
        value: "Status · datos de ciclo",
        purpose: "La codificación concreta depende de la clase RT, del perfil y de la configuración.",
      },
    ];
    explanation =
      "Esquema de aprendizaje, no una captura byte a byte. Una trama PROFINET IO cíclica no tiene una única carga universal: para reconstruirla hacen falta la relación IO y la configuración de módulos.";
    addressSummary =
      "El nombre de dispositivo/IP se usa en tareas de descubrimiento y configuración. El intercambio RT cíclico suele dirigirse en capa 2 mediante MAC y FrameID; no se direcciona como un registro 4xxxx.";
  } else {
    const implicit = cipMessaging === "implicit";
    fields = implicit
      ? [
          {
            name: "Ethernet + IP",
            value: "MAC origen/destino · IP origen/destino",
            purpose: "Direcciones de enlace local y de red; sus valores pertenecen a la instalación.",
          },
          {
            name: "UDP",
            value: "Puerto 2222 · I/O implícito",
            purpose: "Transporte habitual para datos de I/O en tiempo real; la comunicación usa una conexión CIP establecida.",
          },
          {
            name: "Encabezado de transporte",
            value: "Connection ID · secuencia",
            purpose: "Asocia los datos a la conexión de I/O y permite seguir su secuencia.",
          },
          {
            name: "Datos CIP de I/O",
            value: "Datos de proceso + estado",
            purpose: "El tamaño, el orden y el formato se acuerdan al configurar la conexión y los assemblies.",
          },
        ]
      : [
          {
            name: "Ethernet + IP",
            value: "MAC origen/destino · IP origen/destino",
            purpose: "Encapsulan el tráfico hasta el equipo que aloja el servicio EtherNet/IP.",
          },
          {
            name: "TCP",
            value: "Puerto destino 44818",
            purpose: "Transporte habitual de mensajería explícita y servicios de encapsulación.",
          },
          {
            name: "Encapsulation header",
            value: "Command · Length · Session · Status · Context · Options",
            purpose: "Cabecera EtherNet/IP de 24 bytes; identifica la operación y la sesión.",
          },
          {
            name: "CIP",
            value: "Service · clase/instancia/atributo o ruta",
            purpose: "El servicio y el path seleccionan la operación y el objeto; la respuesta incluye estado general y datos.",
          },
        ];
    explanation = implicit
      ? "Vista conceptual de I/O implícito: es tráfico cíclico producido/consumido por una conexión CIP, normalmente sobre UDP/2222. Los bytes exactos dependen de los assemblies y parámetros de conexión."
      : "Vista por capas de mensajería explícita EtherNet/IP. La cabecera de encapsulación precede a los datos CPF/CIP; el contenido exacto cambia según comando, sesión y ruta al objeto.";
    addressSummary = implicit
      ? "Se revisan IP/MAC, el puerto UDP/2222, el Connection ID y los assemblies configurados. No se busca una dirección de registro Modbus."
      : "Se revisan IP y puerto TCP/44818 para llegar al encapsulador; el path CIP direcciona el objeto (clase, instancia, atributo o segmentos de ruta).";
  }

  const hexFrame = frameBytes.map(hexByte).join(" ");

  return (
    <section className="frame-lab" aria-labelledby="frame-lab-title">
      <div className="frame-lab-heading">
        <div>
          <p className="eyebrow">INSPECTOR DE COMUNICACIONES</p>
          <h3 id="frame-lab-title">Construye y lee una trama</h3>
        </div>
        <label className="frame-protocol-select">
          Protocolo
          <select
            value={protocol}
            onChange={(event) => {
              if (isCommunicationProtocol(event.target.value)) {
                setProtocol(event.target.value);
              }
            }}
          >
            <option value="modbus-rtu">Modbus RTU</option>
            <option value="modbus-tcp">Modbus TCP</option>
            <option value="profinet">PROFINET IO</option>
            <option value="ethernet-ip">EtherNet/IP</option>
          </select>
        </label>
      </div>

      {protocol.startsWith("modbus") && (
        <div className="frame-controls">
          <label>
            Unit ID
            <input
              type="number"
              min="1"
              max="247"
              step="1"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            />
          </label>
          <label>
            Offset (decimal)
            <input
              type="number"
              min="0"
              max="65535"
              step="1"
              value={registerOffset}
              onChange={(event) => setRegisterOffset(event.target.value)}
            />
          </label>
          <label>
            Cantidad
            <input
              type="number"
              min="1"
              max="125"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
        </div>
      )}

      {protocol === "ethernet-ip" && (
        <div className="frame-mode-select" role="group" aria-label="Tipo de mensajería CIP">
          <button
            type="button"
            className={cipMessaging === "explicit" ? "is-active" : ""}
            aria-pressed={cipMessaging === "explicit"}
            onClick={() => setCipMessaging("explicit")}
          >
            Explícita · TCP
          </button>
          <button
            type="button"
            className={cipMessaging === "implicit" ? "is-active" : ""}
            aria-pressed={cipMessaging === "implicit"}
            onClick={() => setCipMessaging("implicit")}
          >
            I/O implícito · UDP
          </button>
        </div>
      )}

      {protocol.startsWith("modbus") && !validModbusSettings ? (
        <p className="frame-validation-error" role="alert">
          Revisa los valores: Unit ID entre 1 y 247, offset entero entre 0 y
          65535, cantidad entre 1 y 125 y rango de registros sin desbordamiento.
        </p>
      ) : (
        <>
          {frameBytes.length > 0 ? (
            <div className="frame-byte-view">
              <div className="frame-byte-heading">
                <strong>Bytes transmitidos · hexadecimal</strong>
                <span>{frameBytes.length} bytes</span>
              </div>
              <code>{hexFrame}</code>
              {protocol === "modbus-rtu" && (
                <p>
                  CRC calculado sobre dirección + PDU. Orden de la trama: byte
                  bajo del CRC antes del byte alto.
                </p>
              )}
            </div>
          ) : (
            <div className="frame-byte-view is-schematic">
              <div className="frame-byte-heading">
                <strong>Esquema por campos</strong>
                <span>No es una captura literal</span>
              </div>
              <p>
                En estos protocolos la forma exacta depende de la configuración
                del dispositivo y del tipo de intercambio.
              </p>
            </div>
          )}

          <div className="frame-field-list">
            {fields.map((field, index) => (
              <article className="frame-field" key={field.name}>
                <span className="frame-field-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{field.name}</strong>
                  <code>{field.value}</code>
                  <p>{field.purpose}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="frame-address-note">
            <strong>¿Qué dirección estoy mirando?</strong>
            <p>{addressSummary}</p>
          </div>
        </>
      )}
      <p className="frame-explanation">{explanation}</p>
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [predictionAnswers, setPredictionAnswers] = useState<
    Record<string, number>
  >({});
  const [selectedLevelId, setSelectedLevelId] = useState(courseLevels[0].id);
  const [selectedModuleId, setSelectedModuleId] = useState(
    courseLevels[0].modules[0].id,
  );
  const [problemAnswers, setProblemAnswers] = useState<Record<string, string>>(
    {},
  );
  const [moduleDrafts, setModuleDrafts] = useState<Record<string, string>>({});
  const lessonContentRef = useRef<HTMLElement | null>(null);
  const selectedLevel =
    courseLevels.find((level) => level.id === selectedLevelId) ?? courseLevels[0];
  const selectedModule =
    selectedLevel.modules.find((module) => module.id === selectedModuleId) ??
    selectedLevel.modules[0];
  const startedProblems = selectedModule.problems.filter(
    (_, index) =>
      (problemAnswers[`${selectedModule.id}-${index}`] ?? "").trim().length > 0,
  ).length;
  const prediction = lessonPredictions[selectedModule.id];
  const selectedPrediction = predictionAnswers[selectedModule.id];
  const learningObjective = lessonObjectives[selectedModule.id];

  useEffect(() => {
    lessonContentRef.current?.scrollTo({ top: 0 });
  }, [selectedModule.id]);

  function selectLevel(levelId: string) {
    const level = courseLevels.find((candidate) => candidate.id === levelId);
    if (!level) return;
    setSelectedLevelId(level.id);
    setSelectedModuleId(level.modules[0].id);
  }

  return (
    <main className="classroom-app" data-theme={theme}>
      <header className="classroom-topbar">
        <a className="wordmark" href="#inicio" aria-label="PLC Academy, inicio">
          <span className="wordmark-icon" aria-hidden="true">
            P
          </span>
          <span>PLC Academy</span>
        </a>
        <div className="classroom-breadcrumb">
          <span>Aula</span>
          <span aria-hidden="true">/</span>
          <span>{selectedLevel.title}</span>
          <span aria-hidden="true">/</span>
          <strong>{selectedModule.title}</strong>
        </div>
        <button
          className="theme-toggle"
          type="button"
          aria-label={`Cambiar a modo ${theme === "dark" ? "normal" : "oscuro"}`}
          aria-pressed={theme === "light"}
          onClick={() =>
            setTheme((current) => current === "dark" ? "light" : "dark")
          }
        >
          <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
          {theme === "dark" ? "Modo normal" : "Modo oscuro"}
        </button>
        <span className="release-tag classroom-release">
          <span aria-hidden="true" />
          Entorno de aprendizaje
        </span>
      </header>

      <div className="classroom-layout">
        <aside className="course-sidebar" aria-label="Contenido del curso">
          <div className="sidebar-heading">
            <span>ITINERARIO</span>
            <strong>{selectedLevel.title}</strong>
            <p>{selectedLevel.description}</p>
          </div>
          <nav className="level-navigation" aria-label="Niveles de aprendizaje">
            {courseLevels.map((level) => (
              <section
                className={`level-group${selectedLevel.id === level.id ? " is-active" : ""}`}
                key={level.id}
              >
                <button
                  className="level-select"
                  type="button"
                  aria-expanded={selectedLevel.id === level.id}
                  onClick={() => selectLevel(level.id)}
                >
                  <span className="level-number">{level.number}</span>
                  <span>
                    <strong>{level.title}</strong>
                    <small>{level.modules.length} módulos</small>
                  </span>
                  <span className="level-chevron" aria-hidden="true">
                    {selectedLevel.id === level.id ? "−" : "+"}
                  </span>
                </button>
                {selectedLevel.id === level.id && (
                  <div className="module-navigation">
                    {level.modules.map((module, index) => (
                      <button
                        className={`module-select${selectedModule.id === module.id ? " is-active" : ""}`}
                        type="button"
                        key={module.id}
                        aria-current={selectedModule.id === module.id ? "page" : undefined}
                        onClick={() => setSelectedModuleId(module.id)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <span>
                          <strong>{module.title}</strong>
                          <small>{module.summary}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </nav>
          <div className="sidebar-footnote">
            <span className="status-indicator" aria-hidden="true" />
            Rust · WebAssembly
          </div>
        </aside>

        <section
          className="lesson-content"
          aria-labelledby="lesson-title"
          ref={lessonContentRef}
        >
          <div className="lesson-heading">
            <div className="lesson-breadcrumb">
              {selectedLevel.title} <span>/</span> Módulo {String(
                selectedLevel.modules.findIndex((module) => module.id === selectedModule.id) + 1,
              ).padStart(2, "0")}
            </div>
            <h1 id="lesson-title">{selectedModule.title}</h1>
            <p>{selectedModule.introduction}</p>
            {learningObjective && (
              <p className="lesson-objective">
                <strong>Objetivo práctico</strong>
                <span>{learningObjective}</span>
              </p>
            )}
            <div className="lesson-meta">
              <span>TEORÍA + PRÁCTICA</span>
              <span>{selectedModule.problems.length} retos de aplicación</span>
            </div>
          </div>

          {prediction && (
            <section
              className="lesson-prediction"
              aria-labelledby="prediction-title"
            >
              <div className="lesson-section-heading">
                <span className="lesson-section-index">00</span>
                <div>
                  <p className="eyebrow">ANTES DE LEER LA RESPUESTA</p>
                  <h2 id="prediction-title">Predice qué ocurrirá</h2>
                </div>
              </div>
              <p className="prediction-question">{prediction.question}</p>
              <div className="prediction-options">
                {prediction.options.map((option, index) => (
                  <button
                    className={`prediction-option${selectedPrediction !== undefined && index === prediction.correctOption ? " is-answer" : ""}${selectedPrediction === index ? " is-selected" : ""}${selectedPrediction === index && index === prediction.correctOption ? " is-correct" : ""}${selectedPrediction === index && index !== prediction.correctOption ? " is-incorrect" : ""}`}
                    type="button"
                    key={option}
                    aria-pressed={selectedPrediction === index}
                    onClick={() =>
                      setPredictionAnswers((current) => ({
                        ...current,
                        [selectedModule.id]: index,
                      }))
                    }
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {option}
                  </button>
                ))}
              </div>
              {selectedPrediction !== undefined && (
                <p
                  className={`prediction-feedback${selectedPrediction === prediction.correctOption ? " is-correct" : " is-incorrect"}`}
                  role="status"
                >
                  <strong>
                    {selectedPrediction === prediction.correctOption
                      ? "Buena predicción."
                      : "La opción resaltada es la correcta."}
                  </strong>{" "}
                  {prediction.feedback}
                </p>
              )}
            </section>
          )}

          <section className="lesson-theory" aria-labelledby="theory-title">
            <div className="lesson-section-heading">
              <span className="lesson-section-index">01</span>
              <div>
                <p className="eyebrow">ENTIENDE EL CONCEPTO</p>
                <h2 id="theory-title">La teoría</h2>
              </div>
            </div>
            <div className="theory-list">
              {selectedModule.theory.map((item) => (
                <article className="theory-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            {selectedModule.id === "lenguajes-plc" && <LanguageWalkthrough />}
          </section>

          <section className="lesson-practice" aria-labelledby="practice-title">
            <div className="lesson-section-heading">
              <span className="lesson-section-index">02</span>
              <div>
                <p className="eyebrow">LLÉVALO A LA PRÁCTICA</p>
                <h2 id="practice-title">Prueba y observa</h2>
              </div>
            </div>
            <ol className="practice-steps">
              {selectedModule.procedure.map((step) => <li key={step}>{step}</li>)}
            </ol>
            {selectedModule.kind === "timer" && <TimerPractice />}
            {selectedModule.id === "comunicaciones-industriales" && (
              <CommunicationFrameLab />
            )}
            {selectedModule.kind === "theory" && selectedModule.id === "ciclo-scan" && (
              <ScanCycleAnimation />
            )}
            {selectedModule.kind === "runtime" && (
              <div className="practice-hint">
                <strong>Runtime conectado</strong>
                <p>
                  El taller fijo está cargado con este ejercicio de marcha/paro.
                  Cambia las entradas y ejecuta un scan para seguir la memoria y
                  las salidas en tiempo real.
                </p>
              </div>
            )}
            {selectedModule.kind !== "timer" &&
              selectedModule.kind !== "runtime" &&
              selectedModule.id !== "ciclo-scan" &&
              selectedModule.id !== "comunicaciones-industriales" && (
              <div className="practice-hint is-limited">
                <strong>Práctica conceptual, no simulada</strong>
                <p>
                  Usa el taller fijo para experimentar con marcha/paro, que sí
                  se ejecuta. El borrador de esta lección no se compila: diseña
                  la solución en papel y justifica su comportamiento con los
                  conceptos de la teoría.
                </p>
              </div>
            )}
          </section>

          <section className="lesson-problems" aria-labelledby="problems-title">
            <div className="lesson-section-heading">
              <span className="lesson-section-index">03</span>
              <div>
                <p className="eyebrow">RESUELVE POR TU CUENTA</p>
                <h2 id="problems-title">Problemas del módulo</h2>
              </div>
              <span className="problem-progress">
                {startedProblems}/{selectedModule.problems.length} con borrador
              </span>
            </div>
            <p className="problems-instructions">
              Escribe una solución razonada y contrástala con las condiciones
              del enunciado. La app no marca respuestas como correctas sin
              verificarlas.
            </p>
            <div className="problem-list">
              {selectedModule.problems.map((problem, index) => {
                const problemId = `${selectedModule.id}-${index}`;
                const hasDraft = (problemAnswers[problemId] ?? "").trim().length > 0;
                return (
                  <article className={`problem-card${hasDraft ? " has-draft" : ""}`} key={problem.title}>
                    <div className="problem-card-heading">
                      <span>RETO {String(index + 1).padStart(2, "0")}</span>
                      <h3>{problem.title}</h3>
                    </div>
                    <p className="problem-scenario">{problem.scenario}</p>
                    <h4>Tu solución debe incluir</h4>
                    <ul>
                      {problem.requirements.map((requirement) => (
                        <li key={requirement}>{requirement}</li>
                      ))}
                    </ul>
                    <label className="problem-answer-label" htmlFor={`answer-${problemId}`}>
                      BORRADOR DE SOLUCIÓN · EXPLICACIÓN, ESQUEMA O CÓDIGO
                    </label>
                    <textarea
                      id={`answer-${problemId}`}
                      className="problem-answer"
                      value={problemAnswers[problemId] ?? ""}
                      onChange={(event) =>
                        setProblemAnswers((current) => ({
                          ...current,
                          [problemId]: event.target.value,
                        }))
                      }
                      placeholder="Escribe aquí cómo resolverías el problema y qué estados comprobarías…"
                      rows={4}
                    />
                    <p className="problem-honesty-note">
                      {hasDraft
                        ? "Borrador guardado en esta sesión; la solución todavía no está evaluada."
                        : "Desarrolla el razonamiento antes de pasar al siguiente reto."}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
          <div className="lesson-end">
            FIN DEL MÓDULO <span aria-hidden="true">·</span> Vuelve a sus retos
            hasta poder explicar cada decisión de diseño.
          </div>
        </section>

        <aside className="editor-dock" aria-label="Editor y simulador PLC">
          <div className="editor-dock-heading">
            <div>
              <span>TALLER PLC</span>
              <strong>Editor y simulador</strong>
            </div>
            <span className="editor-dock-status">
              <i aria-hidden="true" /> En línea
            </span>
          </div>
          <p className="editor-dock-note">
            {selectedModule.kind === "runtime"
              ? "El runtime Rust está activo: modifica entradas y ejecuta el programa scan a scan."
              : selectedModule.id === "comunicaciones-industriales"
                ? "Inspecciona las capas y los bytes de cada protocolo en la práctica de comunicaciones."
              : selectedModule.id === "lenguajes-plc"
                ? "Ejemplo guiado: lee primero la explicación. El simulador fijo ejecuta su propia práctica booleana; este borrador no se compila al editar."
              : "El simulador ejecuta la práctica de marcha/paro. El borrador de esta lección es independiente y aún no se ejecuta en el runtime."}
          </p>
          <ScanPreview theme={theme} />
          {selectedModule.kind !== "runtime" && (
            <div className="module-draft-editor">
              <div className="module-draft-editor-heading">
                <span>
                  {selectedModule.id === "lenguajes-plc"
                    ? "STRUCTURED TEXT · EJEMPLO GUIADO"
                    : "STRUCTURED TEXT · BORRADOR"}
                </span>
                <span>
                  {selectedModule.id === "lenguajes-plc"
                    ? "LEE LA EXPLICACIÓN PRIMERO"
                    : selectedLevel.title}
                </span>
              </div>
              <textarea
                aria-label={`${selectedModule.id === "lenguajes-plc" ? "Ejemplo guiado" : "Borrador"} de Structured Text para ${selectedModule.title}`}
                spellCheck={false}
                value={
                  moduleDrafts[selectedModule.id] ??
                  editorStarterCode[selectedModule.id] ??
                  `(* Escribe aquí una propuesta para: ${selectedModule.title} *)`
                }
                onChange={(event) =>
                  setModuleDrafts((current) => ({
                    ...current,
                    [selectedModule.id]: event.target.value,
                  }))
                }
              />
              <p>
                {selectedModule.id === "lenguajes-plc"
                  ? "Es un ejemplo para relacionar con la explicación de arriba; no hace falta modificarlo todavía. El simulador fijo ejecuta su propia versión y no compila este borrador."
                  : "Este borrador cambia con la lección y se conserva al navegar durante esta sesión. No se compila ni se presenta como solución correcta."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
