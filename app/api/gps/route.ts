import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { VehicleData } from "@/types";

// ─────────────────────────────────────────────────────
//  POST /api/gps  — ESP32 sends location here
// ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { nome, lat, lng, spd, fix } = body;

    if (!nome || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "Missing fields: nome, lat, lng required" },
        { status: 400 }
      );
    }

    const entry: VehicleData = {
      nome: String(nome),
      lat,
      lng,
      spd: typeof spd === "number" ? spd : 0,
      fix: fix === true,
      timestamp: Date.now(),
    };

    store[entry.nome] = entry;

    console.log(
      `[GPS] ${entry.nome}  lat=${entry.lat.toFixed(6)}  lng=${entry.lng.toFixed(6)}  spd=${entry.spd.toFixed(1)} km/h`
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

// ─────────────────────────────────────────────────────
//  GET /api/gps  — Frontend polls for all vehicles
// ─────────────────────────────────────────────────────
export async function GET() {
  const vehicles = Object.values(store);

  // Mark as stale if last update > 30 seconds ago
  const now = Date.now();
  const enriched = vehicles.map((v) => ({
    ...v,
    stale: now - v.timestamp > 30_000,
    ago: Math.floor((now - v.timestamp) / 1000),
  }));

  return NextResponse.json(enriched, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

// ─────────────────────────────────────────────────────
//  OPTIONS  — CORS preflight
// ─────────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
