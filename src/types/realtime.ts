export type RoomSummary = {
  id: string;
  stakeSol: number;
  stakeLabel: string;
  hostDisplay: string;
  seatsFilled: number;
  seatsTotal: number;
  /** True while no one has joined from `/room/:id` yet (table exists but empty). */
  awaitingHost?: boolean;
};

export type RoomPlayer = {
  playerId: string;
  seat: number;
  ready: boolean;
  connected?: boolean;
  label: string;
  isHost: boolean;
};

export type RoomPhase =
  | 'waiting_opponent'
  | 'ready_up'
  | 'countdown'
  | 'starting'
  /** Both players seated; stakes locked for active match (game viewport). */
  | 'in_match';

/** Server-generated platform layout for a single match. All values are 0..1 fractions of the canvas. */
export type PlatformSpec = {
  xFraction: number;
  yFraction: number;
  wFraction: number;
};

export type RoomStatePayload = {
  roomId: string;
  stakeSol: number;
  players: RoomPlayer[];
  phase: RoomPhase;
  /** Unix ms when the ready countdown ends (server clock). */
  countdownEndsAt: number | null;
  /** Present on server broadcasts so the client always knows the local player id. */
  selfPlayerId?: string;
};
