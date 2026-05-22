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
  /** Server-reported flag — true once this player has registered a Solana wallet. */
  hasWallet?: boolean;
};

export type PayoutStatus = {
  matchId: string;
  ok: boolean;
  amount: number;
  reason?: string;
  signature?: string;
  recipientWallet?: string;
  message?: string;
};

export type RoomPhase =
  | 'waiting_opponent'
  | 'ready_up'
  /** Both players ready — waiting on stake transfers to confirm on-chain. */
  | 'stake_pending'
  | 'countdown'
  | 'starting'
  /** Both players seated; stakes locked for active match (game viewport). */
  | 'in_match';

export type StakeStatusValue = 'pending' | 'paid' | 'failed';
export type StakeStatusMap = Record<string, StakeStatusValue>;

/** Per-player flag for the optional 20-round magazine upgrade. */
export type ExtendedMagMap = Record<string, boolean>;

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
  /** Per-player stake status during the stake_pending phase (null outside that phase). */
  stakeStatus?: StakeStatusMap | null;
  /** Unix ms when the stake submission window expires (server clock). */
  stakePendingEndsAt?: number | null;
  /** Per-player flag for the 20-round mag upgrade — present until the match starts. */
  extendedMag?: ExtendedMagMap | null;
};
