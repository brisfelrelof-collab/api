import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
//  TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type StatusAluguer =
  | "pendente"      // utilizador criou, aguarda aprovação
  | "aprovado"      // central aprovou, carro a ser utilizado
  | "recusado"      // central recusou
  | "activo"        // tempo a correr
  | "expirado"      // ultrapassou o tempo (com penalização de 10%)
  | "finalizado";   // terminado e pago

export type ComandoMotor = "arranque" | "parado" | null;

export interface Aluguer {
  id: string;
  // Viatura
  viaturaId: string;
  viaturaPlaca: string;
  viaturaNome: string;
  // Cliente
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  // Tempo e valor
  horasContratadas: number;        // horas que o cliente pediu
  valorPorHora: number;            // 1000 Kz/hora
  valorTotal: number;              // horasContratadas × valorPorHora
  penalizacao: number;             // 10% do valorTotal se exceder
  valorFinal: number;              // valorTotal + penalizacao (se houver)
  // Datas/Timestamps
  criadoEm: number;                // Date.now()
  aprovadoEm?: number;
  inicioEm?: number;               // quando o relógio começa
  fimPrevistaEm?: number;          // inicioEm + horasContratadas * 3600000
  fimRealEm?: number;
  // Estado
  status: StatusAluguer;
  motivoRecusa?: string;
  // Controlo do motor (por viatura)
  comandoMotor: ComandoMotor;      // último comando enviado à viatura
  comandoLidoEm?: number;          // quando o ESP32 leu o último comando
}

// ─────────────────────────────────────────────────────────────────────────────
//  STORE GLOBAL IN-MEMORY
//  ⚠️  Para produção real substitui por Redis (Upstash) ou Postgres
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  var _alugueresStore: Record<string, Aluguer> | undefined;
}
if (!global._alugueresStore) global._alugueresStore = {};
const store: Record<string, Aluguer> = global._alugueresStore;

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const VALOR_POR_HORA = 1000; // Kz

function uid(): string {
  return `alug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Verifica se um aluguer activo ultrapassou o tempo e aplica penalização */
function verificarExpiracao(a: Aluguer): Aluguer {
  if (a.status !== "activo" || !a.fimPrevistaEm) return a;
  if (Date.now() > a.fimPrevistaEm) {
    return {
      ...a,
      status: "expirado",
      penalizacao: a.valorTotal * 0.1,
      valorFinal: a.valorTotal + a.valorTotal * 0.1,
    };
  }
  return a;
}

function enrichAluguer(a: Aluguer) {
  const agora = Date.now();
  const verificado = verificarExpiracao(a);
  // Actualiza store se mudou de estado
  if (verificado.status !== a.status) {
    store[a.id] = verificado;
  }
  const segundosRestantes =
    verificado.status === "activo" && verificado.fimPrevistaEm
      ? Math.max(0, Math.floor((verificado.fimPrevistaEm - agora) / 1000))
      : 0;
  return { ...verificado, segundosRestantes };
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/alugueres
//  Query params opcionais: ?status=pendente | ?viaturaId=xxx | ?clienteId=xxx
//  Usado pela central e pelo app Flutter
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const statusFilter   = searchParams.get("status");
  const viaturaFilter  = searchParams.get("viaturaId");
  const clienteFilter  = searchParams.get("clienteId");

  let lista = Object.values(store).map(enrichAluguer);

  if (statusFilter)  lista = lista.filter((a) => a.status === statusFilter);
  if (viaturaFilter) lista = lista.filter((a) => a.viaturaId === viaturaFilter);
  if (clienteFilter) lista = lista.filter((a) => a.clienteId === clienteFilter);

  lista.sort((a, b) => b.criadoEm - a.criadoEm);

  return NextResponse.json(lista, { headers: CORS });
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/alugueres
//  Utilizador cria pedido de aluguer
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      viaturaId, viaturaPlaca, viaturaNome,
      clienteId, clienteNome, clienteTelefone,
      horasContratadas,
    } = body;

    if (!viaturaId || !clienteId || !horasContratadas) {
      return NextResponse.json(
        { error: "Campos obrigatórios: viaturaId, clienteId, horasContratadas" },
        { status: 400, headers: CORS }
      );
    }

    // Normalizar para inteiro (Flutter pode enviar double)
    const horas = Math.ceil(Number(horasContratadas));

    if (horas < 1) {
      return NextResponse.json(
        { error: "Mínimo de 1 hora." },
        { status: 400, headers: CORS }
      );
    }

    // ── FIX BUG 2: Conflito 409 ──────────────────────────────────────────────
    // Se vier do fluxo da central (clienteId começa com "central-"), finaliza
    // automaticamente qualquer aluguer anterior da viatura que ainda esteja
    // pendente/aprovado/activo em vez de rejeitar com 409.
    // Se vier do app do utilizador, mantém o comportamento original (409).
    const isCentral = typeof clienteId === "string" && clienteId.startsWith("central-");
    const conflito = Object.values(store).find(
      (a) =>
        a.viaturaId === viaturaId &&
        ["pendente", "aprovado", "activo"].includes(a.status)
    );
    if (conflito) {
      if (isCentral) {
        // Fechar o aluguer anterior automaticamente
        store[conflito.id] = {
          ...conflito,
          status: "finalizado",
          fimRealEm: Date.now(),
          comandoMotor: "parado",
        };
        console.log(`[ALUGUER] Conflito resolvido — aluguer ${conflito.id} fechado automaticamente pela central`);
      } else {
        return NextResponse.json(
          { error: "Esta viatura já tem um aluguer activo ou pendente." },
          { status: 409, headers: CORS }
        );
      }
    }

    const agora = Date.now();
    const valorTotal = horas * VALOR_POR_HORA;

    // ── FIX BUG 1: Comando/Status ─────────────────────────────────────────────
    // Quando vem da central, cria já como "activo" com comandoMotor "arranque"
    // para que o ESP32 receba imediatamente o comando correcto no polling.
    // Quando vem do app do utilizador, cria como "pendente" (fluxo normal).
    const statusInicial: StatusAluguer = isCentral ? "activo" : "pendente";
    const comandoInicial: ComandoMotor = isCentral ? "arranque" : null;

    const aluguer: Aluguer = {
      id: uid(),
      viaturaId,
      viaturaPlaca: viaturaPlaca ?? "",
      viaturaNome:  viaturaNome  ?? viaturaId,
      clienteId,
      clienteNome:     clienteNome     ?? "Cliente",
      clienteTelefone: clienteTelefone ?? "",
      horasContratadas: horas,
      valorPorHora: VALOR_POR_HORA,
      valorTotal,
      penalizacao: 0,
      valorFinal: valorTotal,
      criadoEm: agora,
      aprovadoEm: isCentral ? agora : undefined,
      inicioEm:   isCentral ? agora : undefined,
      fimPrevistaEm: isCentral ? agora + horas * 3600 * 1000 : undefined,
      status: statusInicial,
      comandoMotor: comandoInicial,
    };

    store[aluguer.id] = aluguer;
    console.log(`[ALUGUER] Novo pedido ${aluguer.id} — ${viaturaNome} — ${horas}h — ${valorTotal} Kz — status: ${statusInicial}`);

    return NextResponse.json({ ok: true, aluguer }, { status: 201, headers: CORS });
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/alugueres
//  Central: aprovar | recusar | iniciar | finalizar | comando_motor
//  Body: { id, action, ...dados_opcionais }
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, motivoRecusa, comando } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "Campos obrigatórios: id, action" },
        { status: 400, headers: CORS }
      );
    }

    const aluguer = store[id];
    if (!aluguer) {
      return NextResponse.json(
        { error: "Aluguer não encontrado." },
        { status: 404, headers: CORS }
      );
    }

    const agora = Date.now();

    // ── APROVAR ──────────────────────────────────────────────────────────────
    if (action === "aprovar") {
      if (aluguer.status !== "pendente") {
        return NextResponse.json(
          { error: `Não é possível aprovar aluguer com status '${aluguer.status}'.` },
          { status: 409, headers: CORS }
        );
      }
      store[id] = {
        ...aluguer,
        status: "aprovado",
        aprovadoEm: agora,
        comandoMotor: "arranque", // ao aprovar, arranca automaticamente
      };
      // Iniciar contagem imediatamente após aprovação
      store[id] = {
        ...store[id],
        status: "activo",
        inicioEm: agora,
        fimPrevistaEm: agora + aluguer.horasContratadas * 3600 * 1000,
      };
      console.log(`[ALUGUER] ${id} APROVADO e ACTIVO — fim previsto: ${new Date(store[id].fimPrevistaEm!).toISOString()}`);
      return NextResponse.json({ ok: true, aluguer: enrichAluguer(store[id]) }, { headers: CORS });
    }

    // ── RECUSAR ───────────────────────────────────────────────────────────────
    if (action === "recusar") {
      if (aluguer.status !== "pendente") {
        return NextResponse.json(
          { error: "Só é possível recusar pedidos pendentes." },
          { status: 409, headers: CORS }
        );
      }
      store[id] = { ...aluguer, status: "recusado", motivoRecusa: motivoRecusa ?? "" };
      return NextResponse.json({ ok: true, aluguer: store[id] }, { headers: CORS });
    }

    // ── FINALIZAR ─────────────────────────────────────────────────────────────
    if (action === "finalizar") {
      if (!["activo", "expirado"].includes(aluguer.status)) {
        return NextResponse.json(
          { error: "Só é possível finalizar alugueres activos ou expirados." },
          { status: 409, headers: CORS }
        );
      }
      const verificado = verificarExpiracao(aluguer);
      store[id] = {
        ...verificado,
        status: "finalizado",
        fimRealEm: agora,
        comandoMotor: "parado",
      };
      return NextResponse.json({ ok: true, aluguer: enrichAluguer(store[id]) }, { headers: CORS });
    }

    // ── COMANDO MOTOR ─────────────────────────────────────────────────────────
    // action: "comando_motor", comando: "arranque" | "parado"
    if (action === "comando_motor") {
      if (!["arranque", "parado"].includes(comando)) {
        return NextResponse.json(
          { error: "Comando inválido. Use: arranque | parado" },
          { status: 400, headers: CORS }
        );
      }
      store[id] = { ...aluguer, comandoMotor: comando as ComandoMotor };
      console.log(`[MOTOR] Viatura ${aluguer.viaturaId} → ${comando.toUpperCase()}`);
      return NextResponse.json({ ok: true, aluguer: store[id] }, { headers: CORS });
    }

    return NextResponse.json(
      { error: "Action inválida. Use: aprovar | recusar | finalizar | comando_motor" },
      { status: 400, headers: CORS }
    );
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/alugueres/comando?viaturaId=xxx
//  Endpoint exclusivo para o ESP32 fazer polling do comando do motor.
//  Após leitura, regista o timestamp e devolve o comando actual.
// ─────────────────────────────────────────────────────────────────────────────
//  NOTA: Este endpoint deve estar em app/api/alugueres/comando/route.ts
//  Separado aqui apenas para documentação conjunta.
//
//  Resposta: { comando: "arranque" | "parado" | null, aluguerActivo: boolean }
// ─────────────────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}