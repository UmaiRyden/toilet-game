ToiletWifHat — Node backend

Layout
  main.js              Entry (thin): starts the app.
  src/app.js           Wires HTTP + WebSocket and listens.
  src/config/env.js    Loads repo-root .env, resolves PORT.
  src/http/create-server.js   REST: GET /health, GET /rooms, OPTIONS.
  src/services/room-store.js   Lobby + room state, WS message dispatch.
  src/ws/attach.js      WebSocketServer on path /ws.

Run
  cd server && npm install && npm run dev

From repo root
  npm run dev:server

Configuration
  Copy repo-root .env.example → .env (PORT, VITE_* for the frontend).

Protocol (JSON over WS /ws)
  welcome { playerId }
  lobby_subscribe | list_rooms → rooms_snapshot { rooms } (rooms[].awaitingHost when empty table)
  create_room { stakeSol, clientSessionId? } — reuses same browser’s empty table when stake matches
  join_room { roomId }
  leave_room | set_ready { ready }
  Both ready → room_state phase countdown + countdownEndsAt for ~5s → match_started { roomId, matchId }
  Any disconnect or leave_room removes that seat only; room stays listed until empty (both gone).
  join_match { matchId } → match_joined { matchId, roomId, stakeSol }
  room_state includes phase (waiting_opponent | ready_up | countdown | starting), players[].isHost
