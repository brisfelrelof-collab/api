import { VehicleStore } from "@/types";

// Global in-memory store (persists between requests in the same process)
// For production, replace with a real database (Redis, Postgres, etc.)
declare global {
  // eslint-disable-next-line no-var
  var vehicleStore: VehicleStore | undefined;
}

if (!global.vehicleStore) {
  global.vehicleStore = {};
}

export const store: VehicleStore = global.vehicleStore;
