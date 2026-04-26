import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Pedido {
  id: string;
  tipo: "taxi" | "transporte";
  status: "a_aceitar" | "em_andamento" | "finalizado" | "cancelado" | "expirado";
  // Cliente
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  // Localização
  origemLat: number;
  origemLng: number;
  destinoLat: number;
  destinoLng: number;
  origemNome: string;
  destinoNome: string;
  // Valor
  distanciaKm: number;
  valorTotal: number;
  // Motorista (preenchido quando aceite)
  motoristaId?: string;
  motoristaNome?: string;
  // Timestamps
  criadoEm: number;      // Date.now()
  expiraEm: number;      // criadoEm + 3 min
  aceitoEm?: number;
  finalizadoEm?: number;
}

interface PedidosStore {
  [id: string]: Pedido;
}

// ─── Store global ─────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var pedidosStore: PedidosStore | undefined;
}
if (!global.pedidosStore) global.pedidosStore = {};
const store: PedidosStore = global.pedidosStore;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

// Limpa pedidos expirados do store
function limparExpirados() {
  const now = Date.now();
  for (const id of Object.keys(store)) {
    const p = store[id];
    if (p.status === "a_aceitar" && now > p.expiraEm) {
      store[id] = { ...p, status: "expirado" };
    }
    // Remove completamente pedidos finalizados/cancelados/expirados há mais de 10 min
    const idade = now - p.criadoEm;
    if (
      ["finalizado", "cancelado", "expirado"].includes(p.status) &&
      idade > 10 * 60 * 1000
    ) {
      delete store[id];
    }
  }
}

// ─── GET /api/pedidos ─────────────────────────────────────────────────────────
// Parâmetros opcionais: ?status=a_aceitar  |  ?clienteId=xxx  |  ?motoristaId=xxx
export async function GET(req: NextRequest) {
  limparExpirados();

  const { searchParams } = new URL(req.url);
  const statusFilter    = searchParams.get("status");
  const clienteIdFilter = searchParams.get("clienteId");
  const motoristaIdFilter = searchParams.get("motoristaId");

  let pedidos = Object.values(store);

  if (statusFilter)     pedidos = pedidos.filter((p) => p.status === statusFilter);
  if (clienteIdFilter)  pedidos = pedidos.filter((p) => p.clienteId === clienteIdFilter);
  if (motoristaIdFilter) pedidos = pedidos.filter((p) => p.motoristaId === motoristaIdFilter);

  // Ordenar mais recentes primeiro
  pedidos.sort((a, b) => b.criadoEm - a.criadoEm);

  // Enriquecer com tempo restante
  const now = Date.now();
  const enriched = pedidos.map((p) => ({
    ...p,
    segundosRestantes: p.status === "a_aceitar"
      ? Math.max(0, Math.floor((p.expiraEm - now) / 1000))
      : 0,
  }));

  return NextResponse.json(enriched, { headers: CORS });
}

// ─── POST /api/pedidos ────────────────────────────────────────────────────────
// Cria um novo pedido (chamado pelo utilizador)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tipo, clienteId, clienteNome, clienteTelefone,
      origemLat, origemLng, destinoLat, destinoLng,
      origemNome, destinoNome, distanciaKm, valorTotal,
    } = body;

    if (!clienteId || !origemLat || !origemLng || !destinoLat || !destinoLng) {
      return NextResponse.json(
        { error: "Campos obrigatórios: clienteId, origemLat, origemLng, destinoLat, destinoLng" },
        { status: 400, headers: CORS }
      );
    }

    // Verificar se o cliente já tem pedido activo
    const jaTemPedido = Object.values(store).some(
      (p) => p.clienteId === clienteId && p.status === "a_aceitar"
    );
    if (jaTemPedido) {
      return NextResponse.json(
        { error: "Já tem um pedido activo. Cancele o anterior primeiro." },
        { status: 409, headers: CORS }
      );
    }

    const agora = Date.now();
    const id = `pedido-${agora}-${Math.random().toString(36).slice(2, 7)}`;

    const pedido: Pedido = {
      id,
      tipo: tipo ?? "taxi",
      status: "a_aceitar",
      clienteId,
      clienteNome:      clienteNome     ?? "Cliente",
      clienteTelefone:  clienteTelefone ?? "",
      origemLat,  origemLng,
      destinoLat, destinoLng,
      origemNome:  origemNome  ?? `${origemLat.toFixed(5)}, ${origemLng.toFixed(5)}`,
      destinoNome: destinoNome ?? `${destinoLat.toFixed(5)}, ${destinoLng.toFixed(5)}`,
      distanciaKm: distanciaKm ?? 0,
      valorTotal:  valorTotal  ?? 0,
      criadoEm: agora,
      expiraEm: agora + 3 * 60 * 1000, // 3 minutos
    };

    store[id] = pedido;

    console.log(`[PEDIDO] Novo pedido ${id} de ${clienteNome} (${tipo})`);

    return NextResponse.json({ ok: true, pedido }, { status: 201, headers: CORS });
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }
}

// ─── PATCH /api/pedidos ───────────────────────────────────────────────────────
// Aceitar, finalizar ou cancelar pedido
// Body: { id, action: "aceitar"|"finalizar"|"cancelar", motoristaId?, motoristaNome? }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, motoristaId, motoristaNome } = body;

    if (!id || !action) {
      return NextResponse.json(
        { error: "Campos obrigatórios: id, action" },
        { status: 400, headers: CORS }
      );
    }

    const pedido = store[id];
    if (!pedido) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404, headers: CORS });
    }

    const now = Date.now();

    if (action === "aceitar") {
      // Race condition: só aceitar se ainda estiver disponível e não expirado
      if (pedido.status !== "a_aceitar") {
        return NextResponse.json(
          { error: "Pedido já foi aceite ou expirou.", status: pedido.status },
          { status: 409, headers: CORS }
        );
      }
      if (now > pedido.expiraEm) {
        store[id] = { ...pedido, status: "expirado" };
        return NextResponse.json(
          { error: "Pedido expirou.", status: "expirado" },
          { status: 410, headers: CORS }
        );
      }
      store[id] = {
        ...pedido,
        status: "em_andamento",
        motoristaId,
        motoristaNome,
        aceitoEm: now,
      };
      console.log(`[PEDIDO] ${id} aceite por motorista ${motoristaId}`);
      return NextResponse.json({ ok: true, pedido: store[id] }, { headers: CORS });
    }

    if (action === "finalizar") {
      if (pedido.status !== "em_andamento") {
        return NextResponse.json({ error: "Pedido não está em andamento." }, { status: 409, headers: CORS });
      }
      store[id] = { ...pedido, status: "finalizado", finalizadoEm: now };
      return NextResponse.json({ ok: true, pedido: store[id] }, { headers: CORS });
    }

    if (action === "cancelar") {
      if (["finalizado", "cancelado"].includes(pedido.status)) {
        return NextResponse.json({ error: "Pedido já finalizado ou cancelado." }, { status: 409, headers: CORS });
      }
      store[id] = { ...pedido, status: "cancelado" };
      console.log(`[PEDIDO] ${id} cancelado`);
      return NextResponse.json({ ok: true, pedido: store[id] }, { headers: CORS });
    }

    return NextResponse.json({ error: "Action inválida. Use: aceitar, finalizar, cancelar" }, { status: 400, headers: CORS });
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }
}

// ─── OPTIONS — CORS preflight ─────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}