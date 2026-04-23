import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const preguntas = [
  {
    pregunta: "¿Dónde registras un pago CDA?",
    respuesta: "En el módulo de caja",
    explicacion: "Todos los pagos se registran en caja."
  },
  {
    pregunta: "Paciente llega sin cita pero ya pagó. ¿Qué haces?",
    respuesta: "Verificar pago y asignar cita",
    explicacion: "Siempre validar pago antes de atender."
  },
  {
    pregunta: "¿Dónde ves el saldo de un paciente?",
    respuesta: "Estado de cuenta",
    explicacion: "Ahí está historial completo."
  }
];

const sesiones = {};

async function evaluar(p, r, u) {
  const prompt = `
Evalúa respuesta.

Pregunta: ${p}
Respuesta correcta: ${r}
Respuesta usuario: ${u}

Responde JSON:
{"resultado":"correcta|parcial|incorrecta","explicacion":"breve"}
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { resultado: "incorrecta", explicacion: "error evaluando" };
  }
}

app.post("/chat", async (req, res) => {
  const { userId, mensaje } = req.body;

  if (!sesiones[userId]) {
    sesiones[userId] = { i: 0, pts: 0, activo: false };
  }

  const s = sesiones[userId];

  if (mensaje.toLowerCase().includes("jugar")) {
    s.i = 0;
    s.pts = 0;
    s.activo = true;

    return res.json({
      respuesta: `Va.\n\nPregunta 1:\n${preguntas[0].pregunta}`
    });
  }

  if (!s.activo) {
    return res.json({ respuesta: "Escribe 'jugar'" });
  }

  const actual = preguntas[s.i];
  const ev = await evaluar(actual.pregunta, actual.respuesta, mensaje);

  let puntos = 0;
  if (ev.resultado === "correcta") puntos = 10;
  if (ev.resultado === "parcial") puntos = 5;

  s.pts += puntos;
  s.i++;

  if (s.i >= preguntas.length) {
    s.activo = false;
    return res.json({
      respuesta: `${ev.resultado}\n${ev.explicacion}\n\nTotal: ${s.pts}\n\nFin.`
    });
  }

  return res.json({
    respuesta:
      `${ev.resultado}\n${ev.explicacion}\n\nPuntos: ${s.pts}\n\n` +
      `Pregunta ${s.i + 1}:\n${preguntas[s.i].pregunta}`
  });
});

app.listen(3000, () => console.log("ok"));
