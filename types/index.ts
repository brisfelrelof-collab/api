export interface VehicleData {
  nome: string;
  lat: number;
  lng: number;
  spd: number;
  fix: boolean;
  timestamp: number;
}

export interface VehicleStore {
  [nome: string]: VehicleData;
}
