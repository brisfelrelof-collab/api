import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/alugueres/comando?viaturaId=xxx
//
//  O ESP32 chama este endpoint a cada 3 segundos.
//  Resposta JSON: { comando: "arranque" | "parado" | null }
//
//  Após leitura, regista comandoLidoEm para a central saber que o ESP32 recebeu.
// ─────────────────────────────────────────────────────────────────────────────

// Definição do tipo Aluguer (deve ser igual ao usado noutros endpoints)
export interface Aluguer {
  id: string;
  viaturaId: string;
  status: "activo" | "expirado" | "aprovado" | "finalizado";
  comandoMotor?: "arranque" | "parado";
  comandoLidoEm?: number;
  fimPrevistaEm?: number;
  // outras propriedades que o aluguer possuir
}

// Declaração global com o tipo correcto
declare global {
  var alugueresStore: Record<string, Aluguer> | undefined;
}

// Inicializar store se não existir
if (!global.alugueresStore) global.alugueresStore = {};
const store = global.alugueresStore;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const viaturaId = searchParams.get("viaturaId");

  if (!viaturaId) {
    return NextResponse.json(
      { error: "viaturaId obrigatório" },
      { status: 400, headers: CORS }
    );
  }

  // Encontrar aluguer activo para esta viatura
  const aluguer = Object.values(store).find(
    (a) =>
      a.viaturaId === viaturaId &&
      ["activo", "expirado", "aprovado"].includes(a.status)
  );

  if (!aluguer) {
    // Sem aluguer activo — motor deve estar parado
    return NextResponse.json(
      { comando: "parado", aluguerActivo: false },
      { headers: CORS }
    );
  }

  // Marcar que o ESP32 leu o comando
  store[aluguer.id] = { ...aluguer, comandoLidoEm: Date.now() };

  return NextResponse.json(
    {
      comando: aluguer.comandoMotor ?? "parado",
      aluguerActivo: true,
      aluguerStatus: aluguer.status,
      fimPrevistaEm: aluguer.fimPrevistaEm ?? null,
    },
    { headers: CORS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}