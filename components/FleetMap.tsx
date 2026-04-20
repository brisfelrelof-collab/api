"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";

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

interface VehicleMarker {
  marker: Marker;
  circle: Circle;
}

interface FleetMapProps {
  vehicles: Vehicle[];
}

export default function FleetMap({ vehicles }: FleetMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, VehicleMarker>>({});
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    const map: LeafletMap = L.map(mapContainerRef.current).setView(
      [-8.8383, 13.2344],
      13
    );

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: "© OpenStreetMap © CARTO",
        maxZoom: 19,
      }
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers whenever vehicles change
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    const map = mapRef.current;
    const COLORS: Record<string, string> = {};
    const palette = ["#00f5d4", "#f72585", "#4cc9f0", "#fee440", "#9b5de5"];
    let colorIdx = 0;

    const getColor = (nome: string) => {
      if (!COLORS[nome]) {
        COLORS[nome] = palette[colorIdx % palette.length];
        colorIdx++;
      }
      return COLORS[nome];
    };

    vehicles.forEach((v) => {
      const pos: [number, number] = [v.lat, v.lng];
      const color = v.stale ? "#666" : getColor(v.nome);

      const svgIcon = L.divIcon({
        className: "",
        html: `<div style="
          width:36px;height:36px;border-radius:50%;
          background:${color}22;border:2px solid ${color};
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 12px ${color}88;
          font-size:18px;
        ">🚗</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const popup = `
        <div style="font-family:monospace;color:#eee;background:#1a1a2e;padding:8px 12px;border-radius:8px;min-width:160px">
          <b style="color:${color};font-size:13px">${v.nome}</b><br/>
          <span style="color:#aaa;font-size:11px">
            ${v.lat.toFixed(6)}, ${v.lng.toFixed(6)}<br/>
            Velocidade: ${v.spd.toFixed(1)} km/h<br/>
            ${v.stale ? `<span style="color:#f44">Sem sinal — ${v.ago}s atrás</span>` : `<span style="color:#4c4">Ao vivo</span>`}
          </span>
        </div>`;

      if (markersRef.current[v.nome]) {
        const { marker, circle } = markersRef.current[v.nome];
        marker.setLatLng(pos).setIcon(svgIcon).bindPopup(popup);
        circle.setLatLng(pos).setStyle({ color, fillColor: color });
      } else {
        const marker = L.marker(pos, { icon: svgIcon })
          .addTo(map)
          .bindPopup(popup);
        const circle = L.circle(pos, {
          radius: 12,
          color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 1,
        }).addTo(map);
        markersRef.current[v.nome] = { marker, circle };
      }
    });

    // Fit bounds if there are vehicles
    if (vehicles.length > 0) {
      const latlngs = vehicles.map((v) => [v.lat, v.lng] as [number, number]);
      if (vehicles.length === 1) {
        map.setView(latlngs[0], 17);
      } else {
        map.fitBounds(latlngs, { padding: [60, 60] });
      }
    }
  }, [vehicles]);

  return (
    <div
      ref={mapContainerRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
