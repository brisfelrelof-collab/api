"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";

// Load map only on client (Leaflet requires window)
const FleetMap = dynamic(() => import("@/components/FleetMap"), { ssr: false });

interface Vehicle {
  nome: string;
  lat: number;
  lng: number;
  spd: number;
  fix: boolean;
  timestamp: number;
  stale: boolean;
  ago: number;
}

const PALETTE = ["#00f5d4", "#f72585", "#4cc9f0", "#fee440", "#9b5de5"];
let colorIdx = 0;
const nameColors: Record<string, string> = {};
const getColor = (nome: string) => {
  if (!nameColors[nome]) {
    nameColors[nome] = PALETTE[colorIdx % PALETTE.length];
    colorIdx++;
  }
  return nameColors[nome];
};

function timeAgo(ago: number): string {
  if (ago < 5) return "agora";
  if (ago < 60) return `${ago}s atrás`;
  return `${Math.floor(ago / 60)}m atrás`;
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch("/api/gps");
      if (!res.ok) return;
      const data: Vehicle[] = await res.json();
      setVehicles(data);
      setLastUpdate(new Date());
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    const interval = setInterval(fetchVehicles, 2000);
    return () => clearInterval(interval);
  }, [fetchVehicles]);

  const selectedVehicle = selected
    ? vehicles.find((v) => v.nome === selected)
    : null;

  return (
    <>
      {/* Leaflet loaded via layout.tsx */}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          background: "#0d0d1a",
          color: "#e0e0f0",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          overflow: "hidden",
        }}
      >
        {/* ── TOP BAR ── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 20px",
            background: "#0a0a18",
            borderBottom: "1px solid #1e1e3a",
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🛰️</span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#00f5d4",
                textTransform: "uppercase",
              }}
            >
              GestãoDeFrotas
            </span>
          </div>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            {/* live dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: loading ? "#888" : "#00f5d4",
                  display: "inline-block",
                  boxShadow: loading ? "none" : "0 0 8px #00f5d4",
                  animation: loading ? "none" : "pulse 1.5s infinite",
                }}
              />
              <span style={{ fontSize: 11, color: "#888" }}>
                {loading
                  ? "conectando..."
                  : `${vehicles.length} viatura${vehicles.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {lastUpdate && (
              <span style={{ fontSize: 11, color: "#555" }}>
                sync{" "}
                {lastUpdate.toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </div>
        </header>

        {/* ── BODY ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* SIDEBAR */}
          <aside
            style={{
              width: 260,
              background: "#0a0a18",
              borderRight: "1px solid #1e1e3a",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: "12px 16px 8px",
                fontSize: 10,
                letterSpacing: "0.15em",
                color: "#555",
                textTransform: "uppercase",
                borderBottom: "1px solid #1a1a2e",
              }}
            >
              Viaturas
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {vehicles.length === 0 && !loading && (
                <div
                  style={{
                    padding: 20,
                    color: "#555",
                    fontSize: 12,
                    textAlign: "center",
                    lineHeight: 1.8,
                  }}
                >
                  Nenhuma viatura
                  <br />
                  conectada.
                  <br />
                  <span style={{ color: "#333" }}>
                    Aguardando dados
                    <br />
                    do ESP32...
                  </span>
                </div>
              )}

              {vehicles.map((v) => {
                const color = v.stale ? "#444" : getColor(v.nome);
                const isSelected = selected === v.nome;
                return (
                  <div
                    key={v.nome}
                    onClick={() =>
                      setSelected(isSelected ? null : v.nome)
                    }
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #12121f",
                      cursor: "pointer",
                      background: isSelected ? "#131326" : "transparent",
                      borderLeft: `3px solid ${isSelected ? color : "transparent"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color,
                        }}
                      >
                        {v.nome}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          padding: "2px 6px",
                          borderRadius: 10,
                          background: v.stale ? "#1a1a1a" : "#001a14",
                          color: v.stale ? "#555" : "#00f5d4",
                          border: `1px solid ${v.stale ? "#333" : "#00f5d422"}`,
                        }}
                      >
                        {v.stale ? "offline" : "ao vivo"}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: "#666" }}>
                      {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 4,
                        fontSize: 11,
                        color: "#888",
                      }}
                    >
                      <span>⚡ {v.spd.toFixed(1)} km/h</span>
                      <span>🕐 {timeAgo(v.ago)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DETAIL PANEL */}
            {selectedVehicle && (
              <div
                style={{
                  borderTop: "1px solid #1e1e3a",
                  padding: "14px 16px",
                  background: "#0c0c1e",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    color: "#555",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  Detalhes
                </div>
                {[
                  ["Nome", selectedVehicle.nome],
                  ["Latitude", selectedVehicle.lat.toFixed(6)],
                  ["Longitude", selectedVehicle.lng.toFixed(6)],
                  ["Velocidade", `${selectedVehicle.spd.toFixed(1)} km/h`],
                  [
                    "Status",
                    selectedVehicle.stale ? "Sem sinal" : "GPS Fix OK",
                  ],
                  ["Último sinal", `${selectedVehicle.ago}s atrás`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      padding: "3px 0",
                      borderBottom: "1px solid #12121f",
                    }}
                  >
                    <span style={{ color: "#555" }}>{label}</span>
                    <span
                      style={{
                        color:
                          label === "Status"
                            ? selectedVehicle.stale
                              ? "#f44"
                              : "#4f4"
                            : "#ccc",
                        fontWeight: 500,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* MAP */}
          <main style={{ flex: 1, position: "relative" }}>
            <FleetMap vehicles={vehicles} />

            {/* overlay hint when empty */}
            {vehicles.length === 0 && !loading && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                  zIndex: 1000,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    background: "#0d0d1aee",
                    border: "1px solid #1e1e3a",
                    borderRadius: 12,
                    padding: "20px 32px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#aaa",
                      marginBottom: 4,
                    }}
                  >
                    Aguardando dados do ESP32
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    POST {" → "}
                    <code style={{ color: "#00f5d4" }}>/api/gps</code>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .leaflet-popup-content-wrapper {
          background: #1a1a2e !important;
          border: 1px solid #2a2a4a !important;
          color: #eee !important;
          box-shadow: 0 4px 24px #00000088 !important;
        }
        .leaflet-popup-tip { background: #1a1a2e !important; }
        .leaflet-container { background: #0d0d1a !important; }
      `}</style>
    </>
  );
}