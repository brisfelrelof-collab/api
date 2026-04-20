# 🛰️ GestãoDeFrotas — GPS Fleet Tracker

Recebe coordenadas do **ESP32 + NEO-6M** e exibe em tempo real no mapa.

---

## Estrutura de arquivos

```
gps-fleet/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Dashboard principal
│   └── api/
│       └── gps/
│           └── route.ts    # API: POST (ESP32) + GET (frontend)
├── components/
│   └── FleetMap.tsx        # Mapa Leaflet (client-only)
├── lib/
│   └── store.ts            # Store in-memory (global)
├── types/
│   └── index.ts            # TypeScript types
├── next.config.js
├── tsconfig.json
└── package.json
```

---

## Como rodar

```bash
npm install
npm run dev
# Acesse http://localhost:3000
```

Para produção (Vercel):
```bash
npm run build
# Deploy na Vercel normalmente
```

---

## API

### `POST /api/gps` — ESP32 envia aqui

**Body JSON:**
```json
{
  "nome": "viatura1",
  "lat": -8.838300,
  "lng": 13.234400,
  "spd": 45.2,
  "fix": true
}
```

**Resposta:**
```json
{ "ok": true }
```

### `GET /api/gps` — Frontend faz poll aqui

**Resposta:**
```json
[
  {
    "nome": "viatura1",
    "lat": -8.838300,
    "lng": 13.234400,
    "spd": 45.2,
    "fix": true,
    "timestamp": 1710000000000,
    "stale": false,
    "ago": 2
  }
]
```

---

## Configuração no ESP32

No arquivo `.ino`, certifique-se que:

```cpp
const char* VERCEL_URL = "https://SEU-DOMINIO.vercel.app/api/gps";
// ou em desenvolvimento:
// const char* VERCEL_URL = "http://192.168.x.x:3000/api/gps";
```

---

## Notas de produção

O store atual é **in-memory** (perde dados ao reiniciar o servidor).  
Para produção, substitua `lib/store.ts` por:
- **Redis** (Upstash é gratuito e funciona na Vercel)
- **Postgres** (Supabase / Neon)
- **MongoDB Atlas**

Exemplo com Upstash Redis:
```ts
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();
await redis.hset("vehicles", { [nome]: JSON.stringify(entry) });
```
