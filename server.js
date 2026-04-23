import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const preguntas = [
  {
    pregunta: "¿Dónde registras un pago CDA?",
    respuesta: "módulo de caja"
  },
  {
    pregunta: "Paciente sin cita pero ya pagó, ¿qué haces?",
    respuesta: "verificar pago y asignar cita"
  },
  {
    pregunta: "¿Dónde ves el saldo del paciente?",
    respuesta: "estado de cuenta"
  }
];

let estadoJuego = {
  equipos: [],
  turnoIndex: 0,
  activo: false,
  preguntaIndex: 0
};

let scores = {};

function siguienteEquipo(){
  estadoJuego.turnoIndex =
    (estadoJuego.turnoIndex + 1) % estadoJuego.equipos.length;
  return estadoJuego.equipos[estadoJuego.turnoIndex];
}

async function evaluarRespuesta(pregunta, correcta, usuario, estado) {

const prompt = `
Eres conductor de concurso estilo TV.

Pregunta: ${pregunta}
Respuesta correcta: ${correcta}
Respuesta: ${usuario}
Equipo: ${estado.turno}

Evalúa y responde JSON:

{
 "resultado":"correcta|parcial|incorrecta",
 "puntos":10,
 "mensaje":"texto corto con emoción y suspenso",
 "siguiente":"nombre equipo"
}
`;

const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.AI_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  })
});

const data = await res.json();

try{
  return JSON.parse(data.choices[0].message.content);
}catch{
  return {resultado:"incorrecta", puntos:0, mensaje:"Error", siguiente:estado.equipos[0]};
}
}

// CHAT
app.post("/chat", async (req,res)=>{
  const { mensaje } = req.body;
  const txt = mensaje.toLowerCase();

  // registrar equipo
  if(txt.startsWith("registrar:")){
    const nombre = mensaje.split(":")[1].trim();

    if(!estadoJuego.equipos.includes(nombre)){
      estadoJuego.equipos.push(nombre);
      scores[nombre]=0;
    }

    return res.json({
      respuesta:`Equipo ${nombre} registrado\nEquipos: ${estadoJuego.equipos.join(", ")}`
    });
  }

  // iniciar
  if(txt === "iniciar"){
    estadoJuego.activo = true;
    estadoJuego.turnoIndex = 0;
    estadoJuego.preguntaIndex = 0;

    return res.json({
      respuesta:`🎮 Iniciamos\n\nTurno: ${estadoJuego.equipos[0]}\n\n${preguntas[0].pregunta}`
    });
  }

  // evaluar
  if(estadoJuego.activo){
    const equipo = estadoJuego.equipos[estadoJuego.turnoIndex];
    const actual = preguntas[estadoJuego.preguntaIndex];

    const ev = await evaluarRespuesta(
      actual.pregunta,
      actual.respuesta,
      mensaje,
      {equipos:estadoJuego.equipos, turno:equipo}
    );

    scores[equipo]+=ev.puntos;

    estadoJuego.preguntaIndex++;

    if(estadoJuego.preguntaIndex >= preguntas.length){
      estadoJuego.activo=false;

      return res.json({
        respuesta:`${ev.mensaje}\n\nFin del juego`
      });
    }

    const next = siguienteEquipo();

    return res.json({
      respuesta:
      `${ev.mensaje}\n\n`+
      `🏆 ${equipo}: ${scores[equipo]} pts\n\n`+
      `👉 Turno: ${next}\n\n${preguntas[estadoJuego.preguntaIndex].pregunta}`
    });
  }

  res.json({respuesta:"Escribe registrar: Equipo o iniciar"});
});

// VOZ
app.post("/voz", async (req,res)=>{
  const { texto } = req.body;

  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method:"POST",
    headers:{
      "Authorization":`Bearer ${process.env.AI_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4o-mini-tts",
      voice:"alloy",
      input:texto
    })
  });

  const buffer = await r.arrayBuffer();

  res.set({"Content-Type":"audio/mpeg"});
  res.send(Buffer.from(buffer));
});

app.listen(3000, ()=>console.log("OK"));
