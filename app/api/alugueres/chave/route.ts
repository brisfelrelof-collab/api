import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
//  TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export interface AluguerChave {
  chave: string;           // ex: ALG-7X3K9P
  clienteNome: string;
  viaturaNome: string;
  // Tempo de uso
  dias: number;
  horas: number;
  minutos: number;
  totalSegundos: number;   // dias*86400 + horas*3600 + minutos*60
  // Timestamps
  criadoEm: number;        // Date.now()
  expiraEm: number;        // criadoEm + totalSegundos * 1000
  // Estado
  activa: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  STORE GLOBAL IN-MEMORY
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  var _chavesStore: Record<string, AluguerChave> | undefined;
}
if (!global._chavesStore) global._chavesStore = {};
const store: Record<string, AluguerChave> = global._chavesStore;

// ─────────────────────────────────────────────────────────────────────────────
//  CORS HEADERS
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Gera chave no formato ALG-XXXXXX (6 chars alfanuméricos maiúsculos) */
function gerarChave(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I, O, 0, 1 (confusos)
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ALG-${codigo}`;
}

/** Garante chave única */
function gerarChaveUnica(): string {
  let chave = gerarChave();
  let tentativas = 0;
  while (store[chave] && tentativas < 100) {
    chave = gerarChave();
    tentativas++;
  }
  return chave;
}

/** Verifica se chave ainda está activa */
function verificarChave(c: AluguerChave): AluguerChave {
  if (!c.activa) return c;
  if (Date.now() > c.expiraEm) {
    const expirada = { ...c, activa: false };
    store[c.chave] = expirada;
    return expirada;
  }
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/alugueres/chave
//  CENTRAL cria um novo aluguer e recebe a chave de acesso
//  Body: { clienteNome, viaturaNome, dias, horas, minutos }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      clienteNome,
      viaturaNome,
      dias = 0,
      horas = 0,
      minutos = 0,
    } = body;

    // Validações
    if (!clienteNome || !clienteNome.trim()) {
      return NextResponse.json(
        { error: "clienteNome é obrigatório." },
        { status: 400, headers: CORS }
      );
    }
    if (!viaturaNome || !viaturaNome.trim()) {
      return NextResponse.json(
        { error: "viaturaNome é obrigatório." },
        { status: 400, headers: CORS }
      );
    }

    const totalSegundos =
      Number(dias) * 86400 +
      Number(horas) * 3600 +
      Number(minutos) * 60;

    if (totalSegundos <= 0) {
      return NextResponse.json(
        { error: "O tempo de uso deve ser maior que zero (dias/horas/minutos)." },
        { status: 400, headers: CORS }
      );
    }

    const agora = Date.now();
    const chave = gerarChaveUnica();

    const aluguerChave: AluguerChave = {
      chave,
      clienteNome: clienteNome.trim(),
      viaturaNome: viaturaNome.trim(),
      dias: Number(dias),
      horas: Number(horas),
      minutos: Number(minutos),
      totalSegundos,
      criadoEm: agora,
      expiraEm: agora + totalSegundos * 1000,
      activa: true,
    };

    store[chave] = aluguerChave;

    console.log(
      `[CHAVE] Nova chave ${chave} → ${viaturaNome} para ${clienteNome} — ${dias}d ${horas}h ${minutos}m`
    );

    return NextResponse.json(
      { ok: true, chave: aluguerChave },
      { status: 201, headers: CORS }
    );
  } catch {
    return NextResponse.json(
      { error: "JSON inválido." },
      { status: 400, headers: CORS }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/alugueres/chave?codigo=ALG-7X3K9P
//  UTILIZADOR consulta o tempo restante com a sua chave
//  Resposta inclui segundosRestantes e estado activa/expirada
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("codigo")?.toUpperCase().trim();

  // Listar todas as chaves (para a central, sem parâmetro)
  if (!codigo) {
    const todas = Object.values(store).map((c) => {
      const verificado = verificarChave(c);
      const agora = Date.now();
      const segundosRestantes = verificado.activa
        ? Math.max(0, Math.floor((verificado.expiraEm - agora) / 1000))
        : 0;
      return { ...verificado, segundosRestantes };
    });
    todas.sort((a, b) => b.criadoEm - a.criadoEm);
    return NextResponse.json(todas, { headers: CORS });
  }

  // Consulta por chave específica
  const chaveData = store[codigo];
  if (!chaveData) {
    return NextResponse.json(
      { error: "Chave não encontrada ou inválida." },
      { status: 404, headers: CORS }
    );
  }

  const verificado = verificarChave(chaveData);
  const agora = Date.now();
  const segundosRestantes = verificado.activa
    ? Math.max(0, Math.floor((verificado.expiraEm - agora) / 1000))
    : 0;

  // Decompor tempo restante em dias/horas/minutos/segundos
  const diasRestantes = Math.floor(segundosRestantes / 86400);
  const horasRestantes = Math.floor((segundosRestantes % 86400) / 3600);
  const minutosRestantes = Math.floor((segundosRestantes % 3600) / 60);
  const segsRestantes = segundosRestantes % 60;

  return NextResponse.json(
    {
      ...verificado,
      segundosRestantes,
      tempoRestante: {
        dias: diasRestantes,
        horas: horasRestantes,
        minutos: minutosRestantes,
        segundos: segsRestantes,
      },
    },
    { headers: CORS }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  OPTIONS — CORS preflight
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
