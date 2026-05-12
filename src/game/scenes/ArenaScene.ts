import Phaser from 'phaser';

import type { PlatformSpec } from '../../types/realtime';

const GROUND_HEIGHT = 56;

const SOLDIER_KEY = 'soldier';
const SOLDIER_URL = '/assets/characters/soldier.png';

/** Known background list — see public/assets/backgrounds. Each scene start picks one at random. */
const BACKGROUND_KEYS: readonly string[] = [
  'photo_2026-04-28_15-07-51',
  'photo_2026-04-28_15-07-53',
  'photo_2026-04-28_15-07-55',
  'photo_2026-04-28_15-07-57',
  'photo_2026-04-28_15-08-01',
  'photo_2026-04-28_15-08-04',
  'photo_2026-04-28_15-08-06',
  'photo_2026-04-28_15-08-11',
  'photo_2026-04-28_15-08-13',
  'photo_2026-04-28_15-08-16',
  'photo_2026-04-28_15-08-18',
  'photo_2026-04-28_15-08-21',
  'photo_2026-04-28_15-08-23',
  'photo_2026-04-28_15-08-26',
  'photo_2026-04-28_15-08-31',
  'photo_2026-04-28_15-08-34',
  'photo_2026-04-28_15-08-37',
  'photo_2026-04-28_15-08-39',
  'photo_2026-04-28_15-08-41',
  'photo_2026-04-28_15-08-43',
  'photo_2026-04-28_15-08-45',
  'photo_2026-04-28_15-08-49',
  'photo_2026-04-28_15-08-51',
  'photo_2026-04-28_15-08-54',
];

const PLAYER_WIDTH = 48;
const PLAYER_HEIGHT = 72;
const PLAYER_SPEED = 260;
/**
 * Jump physics (gravity 800 in PhaserGame config):
 *   single jump apex height = v² / (2g) = 580² / 1600 ≈ 210 px
 *   double jump apex height = v² / g     = 580² / 800  ≈ 420 px
 * Tuned so the new platform yFractions (0.65 / 0.45 / 0.25 mid-bands) are reachable
 * on the ≈ 600 px reference canvas with single + double jump.
 */
const JUMP_VELOCITY = -580;

const PLATFORM_HEIGHT = 16;

const BULLET_SIZE = 6;
const BULLET_SPEED = 900;
const MUZZLE_OFFSET = 30;
const BULLET_DAMAGE = 10;

const MAG_SIZE = 10;
const RELOAD_MS = 1500;

const MAX_HEALTH = 100;
const HEALTH_BAR_WIDTH = 60;
const HEALTH_BAR_HEIGHT = 7;
const HEALTH_BAR_OFFSET_Y = 24;

const HIT_FLASH_MS = 110;

const GAME_UPDATE_INTERVAL_MS = 50;
const ENEMY_LERP = 0.25;

const ROUNDS_TO_WIN_MATCH = 2;
const INTER_ROUND_MS = 2000;

const AI_SPEED = 220;
const AI_SHOOT_RANGE = 320;
const AI_TOO_CLOSE = 140;
const AI_SHOT_INTERVAL_MIN_MS = 900;
const AI_SHOT_INTERVAL_MAX_MS = 1900;
const AI_AIM_NOISE_X = 70;
const AI_AIM_NOISE_Y = 50;

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys;
type Key = Phaser.Input.Keyboard.Key;

type GameMessage = Record<string, unknown> & { type: string };

type Palette = {
  body: number;
  bodyDark: number;
  head: number;
  gun: number;
  trim: number;
  bullet: number;
  bulletGlow: number;
  hexColor: string;
};

const CYAN_PALETTE: Palette = {
  body: 0x22d3ee,
  bodyDark: 0x0e7490,
  head: 0xa5f3fc,
  gun: 0x0f172a,
  trim: 0x155e75,
  bullet: 0xfde047,
  bulletGlow: 0xfacc15,
  hexColor: '#22d3ee',
};

const ORANGE_PALETTE: Palette = {
  body: 0xf97316,
  bodyDark: 0xc2410c,
  head: 0xfed7aa,
  gun: 0x1f2937,
  trim: 0x9a3412,
  bullet: 0xfb7185,
  bulletGlow: 0xef4444,
  hexColor: '#f97316',
};

export interface ArenaSceneInitData {
  isDemo: boolean;
  matchId: string;
  selfPlayerId: string;
  opponentPlayerId: string;
  selfSeat: number;
  stakeSol?: number;
  platforms?: PlatformSpec[];
  sendGameMessage: (payload: Record<string, unknown>) => void;
  subscribeGameMessages: (handler: (msg: GameMessage) => void) => () => void;
  exitToLobby: () => void;
  /** Notifies the host (MatchPage) when pausing should be enabled / disabled. */
  onPauseAllowedChange?: (allowed: boolean) => void;
}

export class ArenaScene extends Phaser.Scene {
  /** Physics objects (game-logic anchors; player/enemy are alpha=0). */
  private ground!: Phaser.GameObjects.Rectangle;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private player!: Phaser.GameObjects.Rectangle;
  private enemy!: Phaser.GameObjects.Rectangle;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;

  /** Visual layers (drawn from low to high depth). */
  private backgroundImage?: Phaser.GameObjects.Image;
  private platformLayer!: Phaser.GameObjects.Graphics;
  private decorations!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemySprite!: Phaser.GameObjects.Sprite;
  private bulletFx!: Phaser.GameObjects.Graphics;
  private healthBars!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private ammoIcon!: Phaser.GameObjects.Graphics;
  private selectedBackgroundKey = '';

  /** HUD text objects. */
  private ammoText!: Phaser.GameObjects.Text;
  private ammoLabel!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private selfNameText!: Phaser.GameObjects.Text;
  private enemyNameText!: Phaser.GameObjects.Text;
  private roundScoreText!: Phaser.GameObjects.Text;

  /** Controls. */
  private cursors!: CursorKeys;
  private keyA!: Key;
  private keyD!: Key;
  private keyW!: Key;
  private keySpace!: Key;

  /** Game state. */
  private ammo = MAG_SIZE;
  private reloading = false;
  private playerHealth = MAX_HEALTH;
  private enemyHealth = MAX_HEALTH;
  private matchOver = false;
  private inInterRound = false;
  private interRoundGroup?: Phaser.GameObjects.Container;
  private resultGroup?: Phaser.GameObjects.Container;
  private resultActionContainer?: Phaser.GameObjects.Container;

  /** Round bookkeeping (best of 3). */
  private roundsWonSelf = 0;
  private roundsWonEnemy = 0;
  private roundNumber = 1;

  /** Rematch UI state (only meaningful after match end in live mode). */
  private weAcceptedRematch = false;
  private opponentAcceptedRematch = false;

  /** Demo AI state. */
  private aiAmmo = MAG_SIZE;
  private aiReloading = false;
  private aiReloadUntil = 0;
  private aiNextShotAt = 0;
  private aiNextJumpAt = 0;
  private aiJumpsUsed = 0;

  /** Multiplayer wiring. */
  private isDemo = true;
  private matchId = '';
  private selfPlayerId = '';
  private opponentPlayerId = '';
  private selfSeat = 0;
  private stakeSol?: number;
  private sendGameMessage?: (payload: Record<string, unknown>) => void;
  private subscribeGameMessages?: (handler: (msg: GameMessage) => void) => () => void;
  private exitToLobbyCallback?: () => void;
  private onPauseAllowedChange?: (allowed: boolean) => void;
  private lastPauseAllowed = true;
  private unsubscribeGame?: () => void;
  private lastUpdateSentAt = 0;
  private enemyTarget: { x: number; y: number } | null = null;
  private pendingShot: { x: number; y: number } | null = null;
  private nativeMouseDownHandler?: (event: MouseEvent) => void;

  /** Visual state. */
  private playerPalette: Palette = CYAN_PALETTE;
  private enemyPalette: Palette = ORANGE_PALETTE;
  private playerFlashUntil = 0;
  private enemyFlashUntil = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private jumpsUsed = 0;
  private platformSpecs: PlatformSpec[] = [];

  constructor() {
    super('ArenaScene');
  }

  init(data: Partial<ArenaSceneInitData> | undefined): void {
    this.isDemo = data?.isDemo ?? true;
    this.matchId = data?.matchId ?? '';
    this.selfPlayerId = data?.selfPlayerId ?? '';
    this.opponentPlayerId = data?.opponentPlayerId ?? '';
    this.selfSeat = data?.selfSeat ?? 0;
    this.stakeSol = data?.stakeSol;
    this.sendGameMessage = data?.sendGameMessage;
    this.subscribeGameMessages = data?.subscribeGameMessages;
    this.exitToLobbyCallback = data?.exitToLobby;
    this.onPauseAllowedChange = data?.onPauseAllowedChange;
    /** Seed to the opposite so the first notifyPauseAllowed in create() always fires. */
    this.lastPauseAllowed = false;

    /** Seat 0 wears cyan, seat 1 wears orange — both clients agree on team colors. */
    this.playerPalette = this.selfSeat === 0 ? CYAN_PALETTE : ORANGE_PALETTE;
    this.enemyPalette = this.selfSeat === 0 ? ORANGE_PALETTE : CYAN_PALETTE;

    this.ammo = MAG_SIZE;
    this.reloading = false;
    this.playerHealth = MAX_HEALTH;
    this.enemyHealth = MAX_HEALTH;
    this.matchOver = false;
    this.inInterRound = false;
    this.interRoundGroup = undefined;
    this.resultGroup = undefined;
    this.resultActionContainer = undefined;
    this.lastUpdateSentAt = 0;
    this.enemyTarget = null;
    this.pendingShot = null;
    this.playerFlashUntil = 0;
    this.enemyFlashUntil = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.jumpsUsed = 0;
    this.roundsWonSelf = 0;
    this.roundsWonEnemy = 0;
    this.roundNumber = 1;
    this.weAcceptedRematch = false;
    this.opponentAcceptedRematch = false;
    this.aiAmmo = MAG_SIZE;
    this.aiReloading = false;
    this.aiReloadUntil = 0;
    this.aiNextShotAt = 0;
    this.aiNextJumpAt = 0;
    this.aiJumpsUsed = 0;

    /** Each scene start (incl. demo Play Again) rolls a new background. */
    this.selectedBackgroundKey =
      BACKGROUND_KEYS[Math.floor(Math.random() * BACKGROUND_KEYS.length)] ?? '';

    /**
     * Live matches use the server-shared layout so both clients see the same arena.
     * Demo / dev-skip re-roll every time the scene starts (covers scene.restart from Play Again).
     */
    if (!this.isDemo && data?.platforms && data.platforms.length > 0) {
      this.platformSpecs = data.platforms.map((p) => ({
        xFraction: p.xFraction,
        yFraction: p.yFraction,
        wFraction: p.wFraction,
      }));
    } else {
      this.platformSpecs = this.generateRandomLayout();
    }
  }

  preload(): void {
    /** Soldier avatar — Phaser de-dupes loads by key, so scene.restart is a no-op here. */
    if (!this.textures.exists(SOLDIER_KEY)) {
      this.load.image(SOLDIER_KEY, SOLDIER_URL);
    }
    if (this.selectedBackgroundKey && !this.textures.exists(this.selectedBackgroundKey)) {
      this.load.image(
        this.selectedBackgroundKey,
        `/assets/backgrounds/${this.selectedBackgroundKey}.jpg`,
      );
    }
  }

  private generateRandomLayout(): PlatformSpec[] {
    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const shuffle = <T,>(arr: T[]): T[] => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    /**
     * yFractions are within the bands the client requested:
     *   lowest 0.65-0.70, middle 0.45-0.50, highest 0.25-0.30.
     * Min gap between bands is 0.15, matching the no-overlap rule.
     */
    const lowestY = rand(0.65, 0.7);
    const middleY = rand(0.45, 0.5);
    const highestY = rand(0.25, 0.3);

    const thirds = shuffle<[number, number]>([
      [0.15, 0.32],
      [0.4, 0.6],
      [0.68, 0.85],
    ]);

    return [
      { xFraction: rand(thirds[0][0], thirds[0][1]), yFraction: lowestY, wFraction: 0.22 },
      { xFraction: rand(thirds[1][0], thirds[1][1]), yFraction: middleY, wFraction: 0.2 },
      { xFraction: rand(thirds[2][0], thirds[2][1]), yFraction: highestY, wFraction: 0.18 },
    ];
  }

  create(): void {
    const { width, height } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor(0x000000);
    this.physics.world.setBounds(0, 0, width, height);

    this.createBackground(width, height);
    this.createGround(width, height);
    this.createPlatforms(width, height);

    this.decorations = this.add.graphics().setDepth(5);
    this.bulletFx = this.add.graphics().setDepth(4);
    this.healthBars = this.add.graphics().setDepth(10);
    this.crosshair = this.add.graphics().setDepth(20);

    this.createPlayer(width, height);
    this.createEnemy(width, height);
    this.createCharacterSprites();
    this.createBullets();
    this.createHud(width);
    this.setupInput();
    this.setupColliders();

    if (!this.isDemo && this.subscribeGameMessages) {
      this.unsubscribeGame = this.subscribeGameMessages((msg) => this.handleGameMessage(msg));
    }

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    /** Seed the host with the initial pause-allowed value for this scene instance. */
    this.notifyPauseAllowed();
  }

  private notifyPauseAllowed(): void {
    const allowed = !this.matchOver && !this.inInterRound;
    if (allowed === this.lastPauseAllowed) return;
    this.lastPauseAllowed = allowed;
    this.onPauseAllowedChange?.(allowed);
  }

  update(): void {
    this.updateMovement();
    this.updateShooting();
    this.updateAI();
    this.lerpEnemy();
    this.drawDecorations();
    this.updateSprites();
    this.drawBulletFx();
    this.drawHealthBars();
    this.updateLabelPositions();
    if (this.matchOver || this.inInterRound) {
      this.crosshair.clear();
    } else {
      const pointer = this.input.activePointer;
      this.drawCrosshair(pointer.worldX, pointer.worldY);
    }
    this.cullBullets(this.playerBullets);
    this.cullBullets(this.enemyBullets);
    this.maybeSendGameUpdate();
  }

  /* ------------------------------------------------------------------ */
  /* Background + ground                                                  */
  /* ------------------------------------------------------------------ */

  private createBackground(width: number, height: number): void {
    if (!this.selectedBackgroundKey || !this.textures.exists(this.selectedBackgroundKey)) return;
    this.backgroundImage = this.add.image(width / 2, height / 2, this.selectedBackgroundKey);
    this.backgroundImage.setDepth(-100);
    this.fitBackground(width, height);
  }

  private fitBackground(width: number, height: number): void {
    if (!this.backgroundImage) return;
    this.backgroundImage.setPosition(width / 2, height / 2);
    const srcW = this.backgroundImage.width;
    const srcH = this.backgroundImage.height;
    if (srcW <= 0 || srcH <= 0) return;
    /** Cover mode: scale to the larger ratio so the canvas is fully covered (edges may crop). */
    const scale = Math.max(width / srcW, height / srcH);
    this.backgroundImage.setScale(scale);
  }

  private createGround(width: number, height: number): void {
    const groundY = height - GROUND_HEIGHT / 2;
    /** Invisible rectangle — the background image visualizes the ground. */
    this.ground = this.add.rectangle(width / 2, groundY, width, GROUND_HEIGHT, 0x000000, 0);
    this.physics.add.existing(this.ground, true);
  }

  /* ------------------------------------------------------------------ */
  /* Platforms                                                            */
  /* ------------------------------------------------------------------ */

  private createPlatforms(width: number, height: number): void {
    this.platforms = this.physics.add.staticGroup();
    this.platformLayer = this.add.graphics().setDepth(-5);

    /**
     * platformSpecs is already populated in init() (server layout in live mode,
     * locally-generated in demo). Each spec uses 0..1 fractions of the canvas.
     */
    for (const spec of this.platformSpecs) {
      const x = spec.xFraction * width;
      const y = this.platformCenterY(height, spec);
      const w = Math.max(60, spec.wFraction * width);
      const plat = this.add.rectangle(x, y, w, PLATFORM_HEIGHT, 0x000000, 0);
      this.physics.add.existing(plat, true);
      this.platforms.add(plat);
    }

    this.drawPlatforms();
  }

  private platformCenterY(height: number, spec: { yFraction: number }): number {
    /** Clamp so the highest platform doesn't escape the canvas top on a short viewport. */
    return Math.max(30 + PLATFORM_HEIGHT / 2, spec.yFraction * height);
  }

  private drawPlatforms(): void {
    this.platformLayer.clear();
    const children = this.platforms.getChildren() as Phaser.GameObjects.Rectangle[];
    for (const plat of children) {
      const x = plat.x - plat.width / 2;
      const y = plat.y - plat.height / 2;
      /** Soft outer glow so the platform stays legible against busy photo backgrounds. */
      this.platformLayer.fillStyle(0xffffff, 0.1);
      this.platformLayer.fillRoundedRect(x - 6, y - 5, plat.width + 12, plat.height + 10, 8);
      this.platformLayer.fillStyle(0xffffff, 0.16);
      this.platformLayer.fillRoundedRect(x - 3, y - 3, plat.width + 6, plat.height + 6, 6);
      /** Body — dark slate, fully opaque. */
      this.platformLayer.fillStyle(0x0f172a, 0.95);
      this.platformLayer.fillRoundedRect(x, y, plat.width, plat.height, 5);
      /** Bright top edge. */
      this.platformLayer.fillStyle(0xffffff, 0.85);
      this.platformLayer.fillRoundedRect(x, y, plat.width, 2, 1);
      /** Crisp white outline. */
      this.platformLayer.lineStyle(1.5, 0xffffff, 0.75);
      this.platformLayer.strokeRoundedRect(x, y, plat.width, plat.height, 5);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Characters                                                          */
  /* ------------------------------------------------------------------ */

  private createPlayer(width: number, height: number): void {
    const startX =
      this.selfSeat === 0
        ? Math.max(80, width * 0.18)
        : Math.min(width - 80, width * 0.82);
    const startY = height - GROUND_HEIGHT - PLAYER_HEIGHT / 2 - 8;
    /** Physics anchor — rendered as alpha 0 so visual layer can take over. */
    this.player = this.add.rectangle(startX, startY, PLAYER_WIDTH, PLAYER_HEIGHT, 0x000000, 0);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(PLAYER_SPEED, 1200);
  }

  private createEnemy(width: number, height: number): void {
    const startX =
      this.selfSeat === 0
        ? Math.min(width - 80, width * 0.82)
        : Math.max(80, width * 0.18);
    const startY = height - GROUND_HEIGHT - PLAYER_HEIGHT / 2 - 8;
    this.enemy = this.add.rectangle(startX, startY, PLAYER_WIDTH, PLAYER_HEIGHT, 0x000000, 0);
    this.physics.add.existing(this.enemy);
    const body = this.enemy.body as Phaser.Physics.Arcade.Body;
    if (this.isDemo) {
      /** AI-controlled — needs gravity + collisions, must not be immovable. */
      body.setCollideWorldBounds(true);
      body.setMaxVelocity(AI_SPEED * 1.5, 1200);
    } else {
      /** Live mode: position is driven by lerpEnemy from opponent's game_update. */
      body.setAllowGravity(false);
      body.setImmovable(true);
    }
  }

  private createCharacterSprites(): void {
    /**
     * Soldier avatar serves both players; team identity comes from the multiply-tint.
     * setDisplaySize fits the sprite to the existing 32×48 hitbox; the rect underneath
     * stays alpha-0 and owns the arcade body, so collisions are unchanged.
     */
    this.playerSprite = this.add.sprite(this.player.x, this.player.y, SOLDIER_KEY);
    this.playerSprite.setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT);
    this.playerSprite.setTint(this.playerPalette.body);
    this.playerSprite.setDepth(6);

    this.enemySprite = this.add.sprite(this.enemy.x, this.enemy.y, SOLDIER_KEY);
    this.enemySprite.setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT);
    this.enemySprite.setTint(this.enemyPalette.body);
    this.enemySprite.setDepth(6);
  }

  private drawDecorations(): void {
    this.decorations.clear();
    /** Thin elliptical shadow under each character — sprite renders above on depth 6. */
    this.drawCharacterShadow(this.player.x, this.player.y);
    this.drawCharacterShadow(this.enemy.x, this.enemy.y);
  }

  private drawCharacterShadow(cx: number, cy: number): void {
    this.decorations.fillStyle(0x000000, 0.5);
    this.decorations.fillEllipse(cx, cy + PLAYER_HEIGHT / 2 - 2, 38, 9);
  }

  private updateSprites(): void {
    const now = this.time.now;

    if (this.playerSprite) {
      this.playerSprite.setPosition(this.player.x, this.player.y);
      const pointer = this.input.activePointer;
      /** Player faces the cursor while alive; once the round ends, freeze the facing toward the enemy. */
      const aimX =
        this.matchOver || this.inInterRound ? this.enemy.x : pointer.worldX;
      this.playerSprite.setFlipX(aimX < this.player.x);
      this.applySpriteTint(this.playerSprite, this.playerPalette.body, now < this.playerFlashUntil);
    }

    if (this.enemySprite) {
      this.enemySprite.setPosition(this.enemy.x, this.enemy.y);
      /** Enemy always tracks the player visually (live + demo). */
      this.enemySprite.setFlipX(this.player.x < this.enemy.x);
      this.applySpriteTint(this.enemySprite, this.enemyPalette.body, now < this.enemyFlashUntil);
    }
  }

  /**
   * Apply a multiply-mode team tint, or a solid-white "fill" tint when flashing.
   * The bundled Phaser typings declare setTintFill()/tintFill incompletely, hence the
   * narrow cast — the runtime API matches the official Phaser 3 docs.
   */
  private applySpriteTint(
    sprite: Phaser.GameObjects.Sprite,
    teamColor: number,
    flashing: boolean,
  ): void {
    sprite.setTint(flashing ? 0xffffff : teamColor);
    (sprite as unknown as { tintFill: boolean }).tintFill = flashing;
  }

  /* ------------------------------------------------------------------ */
  /* Bullets                                                              */
  /* ------------------------------------------------------------------ */

  private createBullets(): void {
    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
  }

  private fireBullet(targetX: number, targetY: number): void {
    const dx = targetX - this.player.x;
    const dy = targetY - this.player.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const bx = this.player.x + nx * MUZZLE_OFFSET;
    const by = this.player.y - 4 + ny * MUZZLE_OFFSET;

    this.spawnBullet(this.playerBullets, bx, by, nx, ny, this.playerPalette);
    this.spawnMuzzleFlash(bx, by, this.playerPalette);
    this.shotsFired += 1;

    if (!this.isDemo && this.sendGameMessage) {
      this.sendGameMessage({ type: 'game_shoot', x: bx, y: by, dx: nx, dy: ny });
    }
  }

  private spawnBullet(
    group: Phaser.Physics.Arcade.Group,
    x: number,
    y: number,
    nx: number,
    ny: number,
    palette: Palette,
  ): void {
    const bullet = this.add.rectangle(x, y, BULLET_SIZE, BULLET_SIZE, palette.bullet);
    bullet.setAlpha(0); /** Visuals come from bulletFx graphics layer. */
    this.physics.add.existing(bullet);
    group.add(bullet);
    bullet.setData('color', palette.bullet);
    bullet.setData('glow', palette.bulletGlow);
    bullet.setData('prevX', x);
    bullet.setData('prevY', y);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(nx * BULLET_SPEED, ny * BULLET_SPEED);
  }

  private drawBulletFx(): void {
    this.bulletFx.clear();
    const drawOne = (bullet: Phaser.GameObjects.Rectangle) => {
      const color = (bullet.getData('color') as number) ?? 0xfde047;
      const glow = (bullet.getData('glow') as number) ?? color;
      const prevX = (bullet.getData('prevX') as number) ?? bullet.x;
      const prevY = (bullet.getData('prevY') as number) ?? bullet.y;

      /** Trail. */
      this.bulletFx.lineStyle(4, glow, 0.35);
      this.bulletFx.lineBetween(prevX, prevY, bullet.x, bullet.y);
      this.bulletFx.lineStyle(2, color, 0.7);
      this.bulletFx.lineBetween(prevX, prevY, bullet.x, bullet.y);

      /** Glow halo. */
      this.bulletFx.fillStyle(glow, 0.15);
      this.bulletFx.fillCircle(bullet.x, bullet.y, 10);
      this.bulletFx.fillStyle(color, 0.4);
      this.bulletFx.fillCircle(bullet.x, bullet.y, 5);

      /** Core. */
      this.bulletFx.fillStyle(0xffffff, 1);
      this.bulletFx.fillCircle(bullet.x, bullet.y, 2);

      bullet.setData('prevX', bullet.x);
      bullet.setData('prevY', bullet.y);
    };

    this.playerBullets.getChildren().forEach((c) => drawOne(c as Phaser.GameObjects.Rectangle));
    this.enemyBullets.getChildren().forEach((c) => drawOne(c as Phaser.GameObjects.Rectangle));
  }

  /* ------------------------------------------------------------------ */
  /* Effects                                                              */
  /* ------------------------------------------------------------------ */

  private spawnMuzzleFlash(x: number, y: number, palette: Palette): void {
    const flash = this.add.graphics().setDepth(6);
    flash.fillStyle(0xfff8d6, 0.95);
    flash.fillCircle(0, 0, 10);
    flash.fillStyle(palette.bullet, 0.85);
    flash.fillCircle(0, 0, 6);
    flash.fillStyle(0xffffff, 1);
    flash.fillCircle(0, 0, 2.5);
    flash.setPosition(x, y);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.6,
      duration: 110,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  private spawnHitParticles(x: number, y: number, color: number): void {
    const pieces = 10;
    for (let i = 0; i < pieces; i++) {
      const particle = this.add.graphics().setDepth(7);
      particle.fillStyle(color, 1);
      const radius = 1.5 + Math.random() * 2;
      particle.fillCircle(0, 0, radius);
      particle.setPosition(x, y);
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 110;
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed * 0.45,
        y: y + Math.sin(angle) * speed * 0.45,
        alpha: 0,
        scale: 0.4,
        duration: 320 + Math.random() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
    /** Central white pop. */
    const pop = this.add.graphics().setDepth(7);
    pop.fillStyle(0xffffff, 0.9);
    pop.fillCircle(0, 0, 6);
    pop.setPosition(x, y);
    this.tweens.add({
      targets: pop,
      scale: 2,
      alpha: 0,
      duration: 160,
      ease: 'Cubic.easeOut',
      onComplete: () => pop.destroy(),
    });
  }

  private triggerFlash(target: 'self' | 'enemy'): void {
    if (target === 'self') this.playerFlashUntil = this.time.now + HIT_FLASH_MS;
    else this.enemyFlashUntil = this.time.now + HIT_FLASH_MS;
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                                */
  /* ------------------------------------------------------------------ */

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      /** A previous showResult may have disabled this. */
      keyboard.enabled = true;
      this.cursors = keyboard.createCursorKeys();
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    /**
     * Native mousedown bypasses Phaser's input plugin so the KeyboardPlugin's
     * captured keydown can't drop the click in the same input tick.
     */
    const canvas = this.game.canvas;
    if (canvas) {
      this.nativeMouseDownHandler = (event: MouseEvent) => {
        if (event.button !== 0) return;
        if (this.matchOver) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const { width, height } = this.scale.gameSize;
        const wx = ((event.clientX - rect.left) / rect.width) * width;
        const wy = ((event.clientY - rect.top) / rect.height) * height;
        this.pendingShot = { x: wx, y: wy };
      };
      canvas.addEventListener('mousedown', this.nativeMouseDownHandler, { capture: true });
    }
  }

  private updateShooting(): void {
    if (this.matchOver || this.inInterRound) {
      this.pendingShot = null;
      return;
    }
    if (!this.pendingShot) return;
    const { x, y } = this.pendingShot;
    this.pendingShot = null;
    this.tryShoot(x, y);
  }

  private updateMovement(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.matchOver || this.inInterRound) {
      body.setVelocityX(0);
      return;
    }

    const left = this.cursors.left?.isDown || this.keyA.isDown;
    const right = this.cursors.right?.isDown || this.keyD.isDown;

    if (left && !right) body.setVelocityX(-PLAYER_SPEED);
    else if (right && !left) body.setVelocityX(PLAYER_SPEED);
    else body.setVelocityX(0);

    const onGround = body.blocked.down || body.touching.down;
    if (onGround && this.jumpsUsed > 0) this.jumpsUsed = 0;

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up as Key) ||
      Phaser.Input.Keyboard.JustDown(this.keyW) ||
      Phaser.Input.Keyboard.JustDown(this.keySpace);
    if (jumpPressed && this.jumpsUsed < 2) {
      body.setVelocityY(JUMP_VELOCITY);
      this.jumpsUsed += 1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shooting + multiplayer                                               */
  /* ------------------------------------------------------------------ */

  private tryShoot(targetX: number, targetY: number): void {
    if (this.reloading) return;
    if (this.ammo <= 0) {
      this.startReload();
      return;
    }
    this.fireBullet(targetX, targetY);
    this.ammo -= 1;
    this.updateAmmoText();
  }

  private updateAI(): void {
    if (!this.isDemo || this.matchOver || this.inInterRound) return;
    const body = this.enemy.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const now = this.time.now;
    const dx = this.player.x - this.enemy.x;
    const distance = Math.abs(dx);
    const direction = Math.sign(dx) || 1;

    /** Stand-off behaviour: rush in when too far, retreat when too close. */
    if (distance > AI_SHOOT_RANGE) {
      body.setVelocityX(direction * AI_SPEED);
    } else if (distance < AI_TOO_CLOSE) {
      body.setVelocityX(-direction * AI_SPEED);
    } else {
      body.setVelocityX(direction * AI_SPEED * 0.25);
    }

    /** Jump management — random hops + occasional double jump to mix vertical reads. */
    const onGround = body.blocked.down || body.touching.down;
    if (onGround) this.aiJumpsUsed = 0;
    if (now >= this.aiNextJumpAt && this.aiJumpsUsed < 2) {
      if (onGround && Math.random() < 0.45) {
        body.setVelocityY(JUMP_VELOCITY);
        this.aiJumpsUsed = 1;
        this.aiNextJumpAt = now + 1100 + Math.random() * 1400;
      } else if (!onGround && this.aiJumpsUsed === 1 && Math.random() < 0.25) {
        body.setVelocityY(JUMP_VELOCITY);
        this.aiJumpsUsed = 2;
        this.aiNextJumpAt = now + 1100 + Math.random() * 1400;
      }
    }

    /** Reload completion. */
    if (this.aiReloading && now >= this.aiReloadUntil) {
      this.aiAmmo = MAG_SIZE;
      this.aiReloading = false;
    }

    /** Shooting cadence with aim noise — keeps the AI threatening but not perfect. */
    if (!this.aiReloading && this.aiAmmo > 0 && now >= this.aiNextShotAt) {
      const aimX = this.player.x + (Math.random() - 0.5) * AI_AIM_NOISE_X;
      const aimY = this.player.y + (Math.random() - 0.5) * AI_AIM_NOISE_Y;
      const adx = aimX - this.enemy.x;
      const ady = aimY - this.enemy.y;
      const len = Math.hypot(adx, ady) || 1;
      const nx = adx / len;
      const ny = ady / len;
      const bx = this.enemy.x + nx * MUZZLE_OFFSET;
      const by = this.enemy.y - 4 + ny * MUZZLE_OFFSET;

      this.spawnBullet(this.enemyBullets, bx, by, nx, ny, this.enemyPalette);
      this.spawnMuzzleFlash(bx, by, this.enemyPalette);
      this.aiAmmo -= 1;
      this.aiNextShotAt =
        now + AI_SHOT_INTERVAL_MIN_MS + Math.random() * (AI_SHOT_INTERVAL_MAX_MS - AI_SHOT_INTERVAL_MIN_MS);

      if (this.aiAmmo <= 0) {
        this.aiReloading = true;
        this.aiReloadUntil = now + RELOAD_MS;
      }
    }
  }

  private maybeSendGameUpdate(): void {
    if (this.isDemo || this.matchOver || !this.sendGameMessage) return;
    const now = this.time.now;
    if (now - this.lastUpdateSentAt < GAME_UPDATE_INTERVAL_MS) return;
    this.lastUpdateSentAt = now;
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    this.sendGameMessage({
      type: 'game_update',
      x: this.player.x,
      y: this.player.y,
      vx: body?.velocity.x ?? 0,
      vy: body?.velocity.y ?? 0,
    });
  }

  private handleGameMessage(msg: GameMessage): void {
    const fromPid = typeof msg.fromPlayerId === 'string' ? msg.fromPlayerId : '';
    switch (msg.type) {
      case 'game_update':
        if (fromPid && fromPid === this.opponentPlayerId) this.handleOpponentUpdate(msg);
        break;
      case 'game_shoot':
        if (fromPid && fromPid === this.opponentPlayerId) this.handleOpponentShoot(msg);
        break;
      case 'game_hit':
        this.handleAuthoritativeHit(msg);
        break;
      case 'game_over':
        this.handleGameOver(msg);
        break;
      case 'round_ended':
        this.handleServerRoundEnded(msg);
        break;
      case 'rematch_status':
        this.handleRematchStatus(msg);
        break;
      default:
        break;
    }
  }

  private handleServerRoundEnded(msg: GameMessage): void {
    const scores = (msg.scores as Record<string, number> | undefined) ?? null;
    if (scores) {
      this.roundsWonSelf = scores[this.selfPlayerId] ?? this.roundsWonSelf;
      this.roundsWonEnemy = scores[this.opponentPlayerId] ?? this.roundsWonEnemy;
    }
    const next = Number(msg.nextRound);
    this.roundNumber = Number.isFinite(next) && next > 0 ? next : this.roundNumber + 1;
    this.startInterRound();
  }

  private handleRematchStatus(msg: GameMessage): void {
    if (!this.matchOver) return;
    const accepted = Array.isArray(msg.acceptedBy) ? (msg.acceptedBy as string[]) : [];
    this.weAcceptedRematch = accepted.includes(this.selfPlayerId);
    this.opponentAcceptedRematch = accepted.includes(this.opponentPlayerId);
    this.renderResultActions();
  }

  private handleOpponentUpdate(msg: GameMessage): void {
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.enemyTarget = { x, y };
  }

  private handleOpponentShoot(msg: GameMessage): void {
    const x = Number(msg.x);
    const y = Number(msg.y);
    const dx = Number(msg.dx);
    const dy = Number(msg.dy);
    if (![x, y, dx, dy].every(Number.isFinite)) return;
    this.spawnBullet(this.enemyBullets, x, y, dx, dy, this.enemyPalette);
    this.spawnMuzzleFlash(x, y, this.enemyPalette);
  }

  private handleAuthoritativeHit(msg: GameMessage): void {
    const targetPid = typeof msg.targetPlayerId === 'string' ? msg.targetPlayerId : '';
    const targetHealth = Number(msg.targetHealth);
    if (!targetPid || !Number.isFinite(targetHealth)) return;
    if (targetPid === this.selfPlayerId) {
      this.playerHealth = targetHealth;
      this.triggerFlash('self');
    } else if (targetPid === this.opponentPlayerId) {
      this.enemyHealth = targetHealth;
      this.triggerFlash('enemy');
      const shooter = typeof msg.shooterPlayerId === 'string' ? msg.shooterPlayerId : '';
      if (shooter === this.selfPlayerId) this.shotsHit += 1;
    }
  }

  private handleGameOver(msg: GameMessage): void {
    const winnerId = typeof msg.winnerPlayerId === 'string' ? msg.winnerPlayerId : '';
    this.showResult(winnerId === this.selfPlayerId);
  }

  private lerpEnemy(): void {
    if (this.isDemo || !this.enemyTarget) return;
    const nx = Phaser.Math.Linear(this.enemy.x, this.enemyTarget.x, ENEMY_LERP);
    const ny = Phaser.Math.Linear(this.enemy.y, this.enemyTarget.y, ENEMY_LERP);
    this.enemy.setPosition(nx, ny);
    const body = this.enemy.body as Phaser.Physics.Arcade.Body | null;
    body?.reset(nx, ny);
  }

  /* ------------------------------------------------------------------ */
  /* Collisions                                                           */
  /* ------------------------------------------------------------------ */

  private setupColliders(): void {
    this.physics.add.collider(this.player, this.ground);
    this.physics.add.collider(this.player, this.platforms);

    if (this.isDemo) {
      this.physics.add.collider(this.enemy, this.ground);
      this.physics.add.collider(this.enemy, this.platforms);
    }

    const bulletGroundHit = (
      a: unknown,
      b: unknown,
      group: Phaser.Physics.Arcade.Group,
    ): void => {
      const bullet = this.pickBulletInGroup(a, b, group);
      if (!bullet) return;
      this.spawnHitParticles(
        (bullet as Phaser.GameObjects.Rectangle).x,
        (bullet as Phaser.GameObjects.Rectangle).y,
        (bullet.getData('glow') as number) ?? 0xfacc15,
      );
      bullet.destroy();
    };

    this.physics.add.collider(this.playerBullets, this.ground, (a, b) =>
      bulletGroundHit(a, b, this.playerBullets),
    );
    this.physics.add.collider(this.enemyBullets, this.ground, (a, b) =>
      bulletGroundHit(a, b, this.enemyBullets),
    );
    this.physics.add.collider(this.playerBullets, this.platforms, (a, b) =>
      bulletGroundHit(a, b, this.playerBullets),
    );
    this.physics.add.collider(this.enemyBullets, this.platforms, (a, b) =>
      bulletGroundHit(a, b, this.enemyBullets),
    );

    this.physics.add.overlap(
      this.playerBullets,
      this.enemy,
      (a, b) => {
        const bullet = this.pickBullet(a, b, this.enemy);
        if (bullet) this.onEnemyHit(bullet);
      },
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.enemyBullets,
      this.player,
      (a, b) => {
        const bullet = this.pickBullet(a, b, this.player);
        if (bullet) this.onPlayerHit(bullet);
      },
      undefined,
      this,
    );
  }

  private pickBullet(
    a: unknown,
    b: unknown,
    nonBullet: Phaser.GameObjects.GameObject,
  ): Phaser.GameObjects.GameObject | null {
    if (a === nonBullet) return b as Phaser.GameObjects.GameObject;
    if (b === nonBullet) return a as Phaser.GameObjects.GameObject;
    return null;
  }

  private pickBulletInGroup(
    a: unknown,
    b: unknown,
    bulletGroup: Phaser.Physics.Arcade.Group,
  ): Phaser.GameObjects.GameObject | null {
    if (bulletGroup.contains(a as Phaser.GameObjects.GameObject))
      return a as Phaser.GameObjects.GameObject;
    if (bulletGroup.contains(b as Phaser.GameObjects.GameObject))
      return b as Phaser.GameObjects.GameObject;
    return null;
  }

  private onEnemyHit(bullet: Phaser.GameObjects.GameObject): void {
    if (this.matchOver || this.inInterRound) return;
    if (bullet === this.enemy || bullet === this.player) return;
    const bx = (bullet as Phaser.GameObjects.Rectangle).x;
    const by = (bullet as Phaser.GameObjects.Rectangle).y;
    bullet.destroy();
    this.spawnHitParticles(bx, by, this.enemyPalette.body);
    if (this.isDemo) {
      this.enemyHealth = Math.max(0, this.enemyHealth - BULLET_DAMAGE);
      this.shotsHit += 1;
      this.triggerFlash('enemy');
      if (this.enemyHealth <= 0) {
        this.handleRoundEnd(true);
      }
      return;
    }
    if (this.sendGameMessage && this.opponentPlayerId) {
      this.sendGameMessage({ type: 'game_hit', targetPlayerId: this.opponentPlayerId });
    }
  }

  private onPlayerHit(bullet: Phaser.GameObjects.GameObject): void {
    if (this.matchOver || this.inInterRound) return;
    if (bullet === this.player || bullet === this.enemy) return;
    const bx = (bullet as Phaser.GameObjects.Rectangle).x;
    const by = (bullet as Phaser.GameObjects.Rectangle).y;
    bullet.destroy();
    this.spawnHitParticles(bx, by, this.playerPalette.body);
    if (this.isDemo) {
      this.playerHealth = Math.max(0, this.playerHealth - BULLET_DAMAGE);
      this.triggerFlash('self');
      if (this.playerHealth <= 0) {
        this.handleRoundEnd(false);
      }
    }
    /** In live mode, the shooter's client reports the authoritative hit. */
  }

  /**
   * Demo-local round resolution. Live mode routes through handleServerRoundEnded
   * (driven by the server's round_ended broadcast).
   */
  private handleRoundEnd(selfWonRound: boolean): void {
    if (this.matchOver || this.inInterRound) return;
    if (selfWonRound) this.roundsWonSelf += 1;
    else this.roundsWonEnemy += 1;

    if (this.roundsWonSelf >= ROUNDS_TO_WIN_MATCH || this.roundsWonEnemy >= ROUNDS_TO_WIN_MATCH) {
      this.showResult(selfWonRound);
      return;
    }
    this.roundNumber += 1;
    this.startInterRound();
  }

  private startInterRound(): void {
    if (this.matchOver) return;
    this.inInterRound = true;
    this.notifyPauseAllowed();
    this.playerBullets.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.playerHealth = MAX_HEALTH;
    this.enemyHealth = MAX_HEALTH;
    this.ammo = MAG_SIZE;
    this.reloading = false;
    this.updateAmmoText();
    this.updateRoundScoreText();
    this.resetPlayerPositions();
    this.showInterRoundOverlay();

    this.time.delayedCall(INTER_ROUND_MS, () => {
      this.inInterRound = false;
      this.hideInterRoundOverlay();
      this.notifyPauseAllowed();
    });
  }

  private showInterRoundOverlay(): void {
    if (this.interRoundGroup) {
      this.interRoundGroup.destroy();
      this.interRoundGroup = undefined;
    }
    const { width, height } = this.scale.gameSize;
    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000509, 0.55);
    const title = this.add
      .text(width / 2, height / 2, `ROUND ${this.roundNumber}`, {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '64px',
        fontStyle: '900',
        color: '#fbbf24',
        stroke: '#7c2d12',
        strokeThickness: 5,
        shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 10, fill: true },
      })
      .setOrigin(0.5);
    title.setLetterSpacing(6);
    this.interRoundGroup = this.add.container(0, 0, [backdrop, title]).setDepth(35);
    this.interRoundGroup.setAlpha(0);
    this.tweens.add({
      targets: this.interRoundGroup,
      alpha: 1,
      duration: 180,
      ease: 'Cubic.easeOut',
    });
  }

  private hideInterRoundOverlay(): void {
    if (!this.interRoundGroup) return;
    const grp = this.interRoundGroup;
    this.interRoundGroup = undefined;
    this.tweens.add({
      targets: grp,
      alpha: 0,
      duration: 200,
      ease: 'Cubic.easeIn',
      onComplete: () => grp.destroy(),
    });
  }

  private resetPlayerPositions(): void {
    const { width, height } = this.scale.gameSize;
    const floorY = height - GROUND_HEIGHT - PLAYER_HEIGHT / 2 - 8;

    const selfX =
      this.selfSeat === 0
        ? Math.max(80, width * 0.18)
        : Math.min(width - 80, width * 0.82);
    this.player.setPosition(selfX, floorY);
    const pBody = this.player.body as Phaser.Physics.Arcade.Body | null;
    pBody?.reset(selfX, floorY);
    this.jumpsUsed = 0;

    if (this.isDemo) {
      const enemyX =
        this.selfSeat === 0
          ? Math.min(width - 80, width * 0.82)
          : Math.max(80, width * 0.18);
      this.enemy.setPosition(enemyX, floorY);
      (this.enemy.body as Phaser.Physics.Arcade.Body | null)?.reset(enemyX, floorY);
      this.aiAmmo = MAG_SIZE;
      this.aiReloading = false;
      this.aiReloadUntil = 0;
      this.aiNextShotAt = this.time.now + 800;
      this.aiNextJumpAt = this.time.now + 1500;
      this.aiJumpsUsed = 0;
    }
  }

  private cullBullets(group: Phaser.Physics.Arcade.Group): void {
    const { width, height } = this.scale.gameSize;
    group.getChildren().forEach((child) => {
      const bullet = child as Phaser.GameObjects.Rectangle;
      if (
        bullet.x < -50 ||
        bullet.x > width + 50 ||
        bullet.y < -50 ||
        bullet.y > height + 50
      ) {
        bullet.destroy();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Reload + ammo HUD                                                    */
  /* ------------------------------------------------------------------ */

  private startReload(): void {
    if (this.reloading) return;
    this.reloading = true;
    this.updateAmmoText();
    this.time.delayedCall(RELOAD_MS, () => {
      this.ammo = MAG_SIZE;
      this.reloading = false;
      this.updateAmmoText();
    });
  }

  private createHud(width: number): void {
    /** Top banner. */
    const bannerLabel = this.bannerLabelText();
    this.bannerBg = this.add.rectangle(width / 2, 18, 240, 24, 0x0f172a, 0.78);
    this.bannerBg.setStrokeStyle(1, 0x1e293b);
    this.bannerBg.setDepth(14);
    this.bannerText = this.add.text(width / 2, 18, bannerLabel, {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#cbd5f5',
    });
    this.bannerText.setLetterSpacing(3);
    this.bannerText.setOrigin(0.5);
    this.bannerText.setDepth(15);

    /** Round score (top-left): "self — enemy". */
    this.roundScoreText = this.add.text(20, 14, '', {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#e2e8f0',
    });
    this.roundScoreText.setLetterSpacing(4);
    this.roundScoreText.setOrigin(0, 0);
    this.roundScoreText.setDepth(15);
    this.updateRoundScoreText();

    /** Ammo readout (icon + count + label). */
    this.ammoIcon = this.add.graphics();
    this.ammoIcon.setDepth(15);
    this.drawAmmoIcon();

    this.ammoText = this.add.text(width - 18, 44, '', {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#e2e8f0',
    });
    this.ammoText.setOrigin(1, 0);
    this.ammoText.setDepth(15);
    this.ammoText.setScrollFactor(0);

    this.ammoLabel = this.add.text(width - 18, 68, 'AMMO', {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '10px',
      color: '#64748b',
    });
    this.ammoLabel.setLetterSpacing(2);
    this.ammoLabel.setOrigin(1, 0);
    this.ammoLabel.setDepth(15);

    this.updateAmmoText();

    /** Player name labels above each character. */
    this.selfNameText = this.add.text(0, 0, this.selfSeat === 0 ? 'P1' : 'P2', {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: this.playerPalette.hexColor,
    });
    this.selfNameText.setLetterSpacing(2);
    this.selfNameText.setOrigin(0.5, 1);
    this.selfNameText.setDepth(11);

    this.enemyNameText = this.add.text(0, 0, this.selfSeat === 0 ? 'P2' : 'P1', {
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: this.enemyPalette.hexColor,
    });
    this.enemyNameText.setLetterSpacing(2);
    this.enemyNameText.setOrigin(0.5, 1);
    this.enemyNameText.setDepth(11);
  }

  private drawAmmoIcon(): void {
    this.ammoIcon.clear();
    /** Single bullet pictogram (casing + tip). */
    this.ammoIcon.fillStyle(0xfacc15, 1);
    this.ammoIcon.fillRoundedRect(0, 0, 16, 7, 1.5);
    this.ammoIcon.fillStyle(0xeab308, 1);
    this.ammoIcon.fillTriangle(16, 0, 22, 3.5, 16, 7);
    this.ammoIcon.lineStyle(1, 0x713f12, 0.9);
    this.ammoIcon.strokeRoundedRect(0, 0, 16, 7, 1.5);
  }

  private updateAmmoText(): void {
    if (this.reloading) {
      this.ammoText.setText('•••');
      this.ammoText.setColor('#fbbf24');
      this.ammoLabel.setText('RELOADING');
    } else {
      this.ammoText.setText(`${this.ammo}/${MAG_SIZE}`);
      this.ammoText.setColor(this.ammo <= 3 ? '#f87171' : '#e2e8f0');
      this.ammoLabel.setText('AMMO');
    }
    this.repositionAmmoIcon();
  }

  private repositionAmmoIcon(): void {
    /** Place icon to the left of the right-aligned ammoText. */
    const textLeft = this.ammoText.x - this.ammoText.width;
    const verticalCenter = this.ammoText.y + this.ammoText.height / 2;
    this.ammoIcon.setPosition(textLeft - 28, verticalCenter - 3.5);
  }

  private updateRoundScoreText(): void {
    if (!this.roundScoreText) return;
    /** Self always reads on the left so the player's own progress stays in the same slot. */
    const tone = this.playerPalette.hexColor;
    this.roundScoreText.setText(`${this.roundsWonSelf}  —  ${this.roundsWonEnemy}`);
    this.roundScoreText.setColor(tone);
  }

  private bannerLabelText(): string {
    if (this.isDemo) return 'DEMO MATCH';
    if (typeof this.stakeSol === 'number' && this.stakeSol > 0) {
      return `STAKE  ${this.stakeSol.toLocaleString()} $TOILET`;
    }
    return 'LIVE MATCH';
  }

  /* ------------------------------------------------------------------ */
  /* Health bars + name labels                                            */
  /* ------------------------------------------------------------------ */

  private drawHealthBars(): void {
    this.healthBars.clear();
    this.drawHealthBarFor(this.player, this.playerHealth, this.playerPalette);
    this.drawHealthBarFor(this.enemy, this.enemyHealth, this.enemyPalette);
  }

  private drawHealthBarFor(
    target: Phaser.GameObjects.Rectangle,
    health: number,
    palette: Palette,
  ): void {
    const x = target.x - HEALTH_BAR_WIDTH / 2;
    const y = target.y - PLAYER_HEIGHT / 2 - HEALTH_BAR_OFFSET_Y;
    const pct = Phaser.Math.Clamp(health / MAX_HEALTH, 0, 1);

    /** Drop shadow. */
    this.healthBars.fillStyle(0x000000, 0.35);
    this.healthBars.fillRoundedRect(x - 1, y + 1, HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2, 3);

    /** Track. */
    this.healthBars.fillStyle(0x0f172a, 0.92);
    this.healthBars.fillRoundedRect(x - 1, y - 1, HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2, 3);

    /** Inner fill. */
    const innerW = HEALTH_BAR_WIDTH * pct;
    const fillStart = this.healthFillColor(pct, 'start');
    const fillEnd = this.healthFillColor(pct, 'end');
    if (innerW > 0) {
      this.healthBars.fillGradientStyle(fillStart, fillEnd, fillStart, fillEnd, 1, 1, 1, 1);
      this.healthBars.fillRoundedRect(x, y, innerW, HEALTH_BAR_HEIGHT, 2);
    }

    /** Border (uses team trim for personality). */
    this.healthBars.lineStyle(1, palette.trim, 0.9);
    this.healthBars.strokeRoundedRect(x - 1, y - 1, HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2, 3);
  }

  private healthFillColor(pct: number, end: 'start' | 'end'): number {
    if (pct > 0.6) return end === 'start' ? 0x34d399 : 0x059669;
    if (pct > 0.3) return end === 'start' ? 0xfbbf24 : 0xd97706;
    return end === 'start' ? 0xf87171 : 0xb91c1c;
  }

  private updateLabelPositions(): void {
    const yOffset = PLAYER_HEIGHT / 2 + HEALTH_BAR_OFFSET_Y + 6;
    this.selfNameText.setPosition(this.player.x, this.player.y - yOffset);
    this.enemyNameText.setPosition(this.enemy.x, this.enemy.y - yOffset);
  }

  /* ------------------------------------------------------------------ */
  /* Crosshair                                                            */
  /* ------------------------------------------------------------------ */

  private drawCrosshair(x: number, y: number): void {
    this.crosshair.clear();
    this.input.setDefaultCursor('none');
    this.crosshair.lineStyle(1.5, this.playerPalette.body, 0.85);
    this.crosshair.strokeCircle(x, y, 10);
    this.crosshair.lineStyle(1, 0xf8fafc, 0.9);
    this.crosshair.beginPath();
    this.crosshair.moveTo(x - 14, y);
    this.crosshair.lineTo(x - 5, y);
    this.crosshair.moveTo(x + 5, y);
    this.crosshair.lineTo(x + 14, y);
    this.crosshair.moveTo(x, y - 14);
    this.crosshair.lineTo(x, y - 5);
    this.crosshair.moveTo(x, y + 5);
    this.crosshair.lineTo(x, y + 14);
    this.crosshair.strokePath();
    this.crosshair.fillStyle(0xf8fafc, 0.9);
    this.crosshair.fillCircle(x, y, 1.2);
  }

  /* ------------------------------------------------------------------ */
  /* Result screen                                                        */
  /* ------------------------------------------------------------------ */

  private showResult(isVictory: boolean): void {
    if (this.matchOver) return;
    this.matchOver = true;
    this.inInterRound = false;
    this.notifyPauseAllowed();
    if (this.interRoundGroup) {
      this.interRoundGroup.destroy();
      this.interRoundGroup = undefined;
    }
    this.input.setDefaultCursor('default');
    this.crosshair.setVisible(false);
    /** Drop keyboard capture so the prompt buttons receive clicks even with keys held. */
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    this.playerBullets.clear(true, true);
    this.enemyBullets.clear(true, true);

    const { width, height } = this.scale.gameSize;
    const accuracy =
      this.shotsFired > 0 ? Math.round((100 * this.shotsHit) / this.shotsFired) : 0;
    const remaining = Math.max(0, Math.round(this.playerHealth));

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000509, 0.82);

    const title = this.add
      .text(width / 2, height / 2 - 110, isVictory ? 'VICTORY' : 'DEFEAT', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '76px',
        fontStyle: '900',
        color: isVictory ? '#22d3ee' : '#f87171',
        stroke: isVictory ? '#0f3a4a' : '#7f1d1d',
        strokeThickness: 6,
        shadow: { offsetX: 0, offsetY: 6, color: '#000000', blur: 16, fill: true },
      })
      .setOrigin(0.5);
    title.setLetterSpacing(6);

    const subtitle = this.add
      .text(
        width / 2,
        height / 2 - 56,
        `Final score  ${this.roundsWonSelf} — ${this.roundsWonEnemy}`,
        {
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: '15px',
          color: '#94a3b8',
        },
      )
      .setOrigin(0.5);

    const statsBg = this.add
      .rectangle(width / 2, height / 2 + 10, 320, 96, 0x0f172a, 0.92)
      .setStrokeStyle(1, 0x1e293b);
    const statsText = this.add
      .text(
        width / 2,
        height / 2 + 10,
        `SHOTS FIRED   ${this.shotsFired}\nACCURACY      ${accuracy}%\nHEALTH         ${remaining} / ${MAX_HEALTH}`,
        {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          color: '#e2e8f0',
          align: 'left',
          lineSpacing: 8,
        },
      )
      .setOrigin(0.5);

    const actionContainer = this.add.container(width / 2, height / 2 + 110);

    this.resultActionContainer = actionContainer;
    this.resultGroup = this.add
      .container(0, 0, [backdrop, title, subtitle, statsBg, statsText, actionContainer])
      .setDepth(30);

    this.renderResultActions();

    if (isVictory) this.spawnConfetti();
    else this.spawnSparks();
  }

  private renderResultActions(): void {
    const action = this.resultActionContainer;
    if (!action) return;
    action.removeAll(true);

    const onExit = () => {
      this.exitToLobbyCallback?.();
    };

    if (this.isDemo) {
      const playBtn = this.makeButton('Play Again', '#0e7490', '#155e75', -95, 0, () => {
        if (this.input.keyboard) this.input.keyboard.enabled = true;
        this.scene.restart();
      });
      const exitBtn = this.makeButton('Exit to Lobby', '#475569', '#334155', 95, 0, onExit);
      action.add([playBtn, exitBtn]);
      return;
    }

    /** Live mode: rematch flow with waiting/accepted states. */
    if (this.weAcceptedRematch) {
      const note = this.add
        .text(
          0,
          -22,
          this.opponentAcceptedRematch
            ? 'Both accepted — starting…'
            : 'Waiting for opponent…',
          {
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: '14px',
            color: '#fbbf24',
          },
        )
        .setOrigin(0.5);
      const exitBtn = this.makeButton('Exit to Lobby', '#475569', '#334155', 0, 22, onExit);
      action.add([note, exitBtn]);
    } else {
      const playLabel = this.opponentAcceptedRematch
        ? 'Play Again  •  opponent ready'
        : 'Play Again';
      const playBg = this.opponentAcceptedRematch ? '#16a34a' : '#0e7490';
      const playHover = this.opponentAcceptedRematch ? '#22c55e' : '#155e75';
      const playBtn = this.makeButton(playLabel, playBg, playHover, -110, 0, () => {
        if (!this.sendGameMessage || !this.matchId) return;
        this.weAcceptedRematch = true;
        this.sendGameMessage({ type: 'request_rematch', matchId: this.matchId });
        this.renderResultActions();
      });
      const exitBtn = this.makeButton('Exit to Lobby', '#475569', '#334155', 110, 0, onExit);
      action.add([playBtn, exitBtn]);
    }
  }

  private makeButton(
    label: string,
    bgColor: string,
    hoverBg: string,
    x: number,
    y: number,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#e2e8f0',
        backgroundColor: bgColor,
        padding: { left: 18, right: 18, top: 10, bottom: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setBackgroundColor(hoverBg));
    btn.on('pointerout', () => btn.setBackgroundColor(bgColor));
    btn.on('pointerdown', onClick);
    return btn;
  }

  private spawnConfetti(): void {
    const { width, height } = this.scale.gameSize;
    const colors = [0x22d3ee, 0xfacc15, 0xa855f7, 0xf472b6, 0x34d399, 0xfb923c];
    for (let i = 0; i < 80; i++) {
      this.time.delayedCall(Math.random() * 900, () => {
        if (!this.scene.isActive()) return;
        const piece = this.add.graphics().setDepth(40);
        const color = colors[Math.floor(Math.random() * colors.length)];
        piece.fillStyle(color, 1);
        const w = 5 + Math.random() * 7;
        const h = 2 + Math.random() * 3;
        piece.fillRect(-w / 2, -h / 2, w, h);
        piece.setPosition(Math.random() * width, -12);
        piece.setRotation(Math.random() * Math.PI * 2);
        this.tweens.add({
          targets: piece,
          y: height + 30,
          rotation: piece.rotation + (Math.random() - 0.5) * 8,
          duration: 2000 + Math.random() * 1400,
          ease: 'Quad.easeIn',
          onComplete: () => piece.destroy(),
        });
        this.tweens.add({
          targets: piece,
          x: piece.x + (Math.random() - 0.5) * 90,
          duration: 700 + Math.random() * 800,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      });
    }
  }

  private spawnSparks(): void {
    const { width, height } = this.scale.gameSize;
    for (let i = 0; i < 24; i++) {
      this.time.delayedCall(Math.random() * 400, () => {
        if (!this.scene.isActive()) return;
        const spark = this.add.graphics().setDepth(40);
        spark.fillStyle(0xf87171, 0.95);
        spark.fillCircle(0, 0, 2);
        spark.setPosition(width / 2 + (Math.random() - 0.5) * 240, height / 2 - 60);
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 140;
        this.tweens.add({
          targets: spark,
          x: spark.x + Math.cos(angle) * dist,
          y: spark.y + Math.sin(angle) * dist,
          alpha: 0,
          duration: 700 + Math.random() * 400,
          ease: 'Cubic.easeOut',
          onComplete: () => spark.destroy(),
        });
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Resize + cleanup                                                     */
  /* ------------------------------------------------------------------ */

  private handleResize = (gameSize: Phaser.Structs.Size): void => {
    const { width, height } = gameSize;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    /** Physics world + camera must agree on the new bounds — RESIZE updates the viewport but not setBounds. */
    this.physics.world.setBounds(0, 0, width, height);
    const camera = this.cameras.main;
    if (camera) {
      camera.setSize(width, height);
      camera.setBounds(0, 0, width, height);
    }

    /** Background image — re-cover the new canvas extents. */
    this.fitBackground(width, height);

    /** Ground physics rectangle still tracks the new floor (invisible). */
    if (this.ground) {
      this.ground.setPosition(width / 2, height - GROUND_HEIGHT / 2);
      this.ground.setSize(width, GROUND_HEIGHT);
      (this.ground.body as Phaser.Physics.Arcade.StaticBody | null)?.updateFromGameObject();
    }

    /** Platforms — reposition by fraction, refresh static bodies. */
    const platChildren = this.platforms?.getChildren() as
      | Phaser.GameObjects.Rectangle[]
      | undefined;
    if (platChildren) {
      platChildren.forEach((plat, idx) => {
        const spec = this.platformSpecs[idx];
        if (!spec) return;
        const w = Math.max(60, spec.wFraction * width);
        plat.setSize(w, PLATFORM_HEIGHT);
        plat.setPosition(spec.xFraction * width, this.platformCenterY(height, spec));
        (plat.body as Phaser.Physics.Arcade.StaticBody | null)?.updateFromGameObject();
      });
    }
    this.drawPlatforms();

    /** Player / enemy clamping into the new bounds. */
    const floorY = height - GROUND_HEIGHT - PLAYER_HEIGHT / 2;
    if (this.player) {
      const clampedX = Phaser.Math.Clamp(
        this.player.x,
        PLAYER_WIDTH / 2,
        Math.max(PLAYER_WIDTH / 2, width - PLAYER_WIDTH / 2),
      );
      const forcedToFloor = this.player.y > floorY;
      const clampedY = forcedToFloor ? floorY : this.player.y;
      if (clampedX !== this.player.x || clampedY !== this.player.y) {
        this.player.setPosition(clampedX, clampedY);
        const pBody = this.player.body as Phaser.Physics.Arcade.Body | null;
        if (pBody) {
          if (forcedToFloor) {
            /** Reset clears velocity — appropriate for a hard teleport onto the new floor. */
            pBody.reset(clampedX, clampedY);
          } else {
            pBody.position.x = clampedX - pBody.halfWidth;
            pBody.position.y = clampedY - pBody.halfHeight;
          }
        }
      }
    }
    if (this.enemy) {
      const clampedX = Phaser.Math.Clamp(
        this.enemy.x,
        PLAYER_WIDTH / 2,
        Math.max(PLAYER_WIDTH / 2, width - PLAYER_WIDTH / 2),
      );
      /** Demo enemy is anchored to the floor; live enemy is driven by lerpEnemy so just clamp out of bounds. */
      const clampedY = this.isDemo ? floorY : Math.min(this.enemy.y, floorY);
      this.enemy.setPosition(clampedX, clampedY);
      (this.enemy.body as Phaser.Physics.Arcade.Body | null)?.reset(clampedX, clampedY);
    }

    /** HUD. */
    if (this.bannerBg) this.bannerBg.setPosition(width / 2, 18);
    if (this.bannerText) this.bannerText.setPosition(width / 2, 18);
    if (this.roundScoreText) this.roundScoreText.setPosition(20, 14);
    if (this.ammoText) {
      this.ammoText.setPosition(width - 18, 44);
      this.ammoLabel.setPosition(width - 18, 68);
      this.repositionAmmoIcon();
    }

    /** Inter-round overlay (if showing). */
    if (this.interRoundGroup) {
      const list = this.interRoundGroup.list as Phaser.GameObjects.GameObject[];
      const [backdrop, title] = list as [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text];
      if (backdrop) {
        backdrop.setPosition(width / 2, height / 2);
        backdrop.setSize(width, height);
      }
      if (title) title.setPosition(width / 2, height / 2);
    }

    /** Result overlay (if showing). */
    if (this.resultGroup) {
      const list = this.resultGroup.list as Phaser.GameObjects.GameObject[];
      const [backdrop, title, subtitle, statsBg, statsText, action] = list as [
        Phaser.GameObjects.Rectangle,
        Phaser.GameObjects.Text,
        Phaser.GameObjects.Text,
        Phaser.GameObjects.Rectangle,
        Phaser.GameObjects.Text,
        Phaser.GameObjects.Container | undefined,
      ];
      backdrop.setPosition(width / 2, height / 2);
      backdrop.setSize(width, height);
      title.setPosition(width / 2, height / 2 - 110);
      subtitle.setPosition(width / 2, height / 2 - 56);
      statsBg.setPosition(width / 2, height / 2 + 10);
      statsText.setPosition(width / 2, height / 2 + 10);
      if (action) action.setPosition(width / 2, height / 2 + 110);
    }
  };

  private cleanup = (): void => {
    this.scale.off('resize', this.handleResize, this);
    this.input.setDefaultCursor('default');
    this.unsubscribeGame?.();
    this.unsubscribeGame = undefined;
    if (this.nativeMouseDownHandler) {
      const canvas = this.game.canvas;
      if (canvas) {
        canvas.removeEventListener('mousedown', this.nativeMouseDownHandler, { capture: true });
      }
      this.nativeMouseDownHandler = undefined;
    }
  };
}
