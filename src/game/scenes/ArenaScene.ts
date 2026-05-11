import Phaser from 'phaser';

import type { PlatformSpec } from '../../types/realtime';

const SKY_TOP = 0x070b1a;
const SKY_BOTTOM = 0x1e2a55;
const HORIZON_GLOW = 0x312e81;

const GROUND_FILL = 0x111827;
const GROUND_EDGE = 0x475569;
const GROUND_BRICK = 0x1f2937;
const GROUND_HEIGHT = 56;

const PLATFORM_FILL = 0x1e293b;
const PLATFORM_EDGE = 0x64748b;

const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 48;
const PLAYER_SPEED = 260;
const JUMP_VELOCITY = -480;

const PLATFORM_HEIGHT = 14;

const BULLET_SIZE = 6;
const BULLET_SPEED = 900;
const MUZZLE_OFFSET = 22;
const BULLET_DAMAGE = 10;

const MAG_SIZE = 10;
const RELOAD_MS = 1500;

const MAX_HEALTH = 100;
const HEALTH_BAR_WIDTH = 52;
const HEALTH_BAR_HEIGHT = 7;
const HEALTH_BAR_OFFSET_Y = 22;

const HIT_FLASH_MS = 110;

const GAME_UPDATE_INTERVAL_MS = 50;
const ENEMY_LERP = 0.25;

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
  selfPlayerId: string;
  opponentPlayerId: string;
  selfSeat: number;
  stakeSol?: number;
  platforms?: PlatformSpec[];
  sendGameMessage: (payload: Record<string, unknown>) => void;
  subscribeGameMessages: (handler: (msg: GameMessage) => void) => () => void;
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
  private skyLayer!: Phaser.GameObjects.Graphics;
  private parallaxLayer!: Phaser.GameObjects.Graphics;
  private groundLayer!: Phaser.GameObjects.Graphics;
  private platformLayer!: Phaser.GameObjects.Graphics;
  private decorations!: Phaser.GameObjects.Graphics;
  private bulletFx!: Phaser.GameObjects.Graphics;
  private healthBars!: Phaser.GameObjects.Graphics;
  private crosshair!: Phaser.GameObjects.Graphics;
  private ammoIcon!: Phaser.GameObjects.Graphics;

  /** HUD text objects. */
  private ammoText!: Phaser.GameObjects.Text;
  private ammoLabel!: Phaser.GameObjects.Text;
  private bannerBg!: Phaser.GameObjects.Rectangle;
  private bannerText!: Phaser.GameObjects.Text;
  private selfNameText!: Phaser.GameObjects.Text;
  private enemyNameText!: Phaser.GameObjects.Text;

  /** Controls. */
  private cursors!: CursorKeys;
  private keyA!: Key;
  private keyD!: Key;
  private keyW!: Key;
  private keySpace!: Key;

  /** Game state (unchanged from previous iteration). */
  private ammo = MAG_SIZE;
  private reloading = false;
  private playerHealth = MAX_HEALTH;
  private enemyHealth = MAX_HEALTH;
  private matchOver = false;
  private resultGroup?: Phaser.GameObjects.Container;

  /** Multiplayer wiring. */
  private isDemo = true;
  private selfPlayerId = '';
  private opponentPlayerId = '';
  private selfSeat = 0;
  private stakeSol?: number;
  private sendGameMessage?: (payload: Record<string, unknown>) => void;
  private subscribeGameMessages?: (handler: (msg: GameMessage) => void) => () => void;
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
    this.selfPlayerId = data?.selfPlayerId ?? '';
    this.opponentPlayerId = data?.opponentPlayerId ?? '';
    this.selfSeat = data?.selfSeat ?? 0;
    this.stakeSol = data?.stakeSol;
    this.sendGameMessage = data?.sendGameMessage;
    this.subscribeGameMessages = data?.subscribeGameMessages;

    /** Seat 0 wears cyan, seat 1 wears orange — both clients agree on team colors. */
    this.playerPalette = this.selfSeat === 0 ? CYAN_PALETTE : ORANGE_PALETTE;
    this.enemyPalette = this.selfSeat === 0 ? ORANGE_PALETTE : CYAN_PALETTE;

    this.ammo = MAG_SIZE;
    this.reloading = false;
    this.playerHealth = MAX_HEALTH;
    this.enemyHealth = MAX_HEALTH;
    this.matchOver = false;
    this.resultGroup = undefined;
    this.lastUpdateSentAt = 0;
    this.enemyTarget = null;
    this.pendingShot = null;
    this.playerFlashUntil = 0;
    this.enemyFlashUntil = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.jumpsUsed = 0;

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

    const lowestY = rand(0.74, 0.86);
    const middleY = rand(0.46, 0.58);
    const highestMinY = Math.max(0.08, middleY - 0.42);
    const highestMaxY = middleY - 0.28;
    const highestY = rand(highestMinY, highestMaxY);

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
    this.cameras.main.setBackgroundColor(SKY_TOP);
    this.physics.world.setBounds(0, 0, width, height);

    this.createSky(width, height);
    this.createParallax(width, height);
    this.createGround(width, height);
    this.createPlatforms(width, height);

    this.decorations = this.add.graphics().setDepth(5);
    this.bulletFx = this.add.graphics().setDepth(4);
    this.healthBars = this.add.graphics().setDepth(10);
    this.crosshair = this.add.graphics().setDepth(20);

    this.createPlayer(width, height);
    this.createEnemy(width, height);
    this.createBullets();
    this.createHud(width);
    this.setupInput();
    this.setupColliders();

    if (!this.isDemo && this.subscribeGameMessages) {
      this.unsubscribeGame = this.subscribeGameMessages((msg) => this.handleGameMessage(msg));
    }

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  update(): void {
    this.updateMovement();
    this.updateShooting();
    this.lerpEnemy();
    this.drawDecorations();
    this.drawBulletFx();
    this.drawHealthBars();
    this.updateLabelPositions();
    if (this.matchOver) {
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
  /* Background                                                          */
  /* ------------------------------------------------------------------ */

  private createSky(width: number, height: number): void {
    this.skyLayer = this.add.graphics().setDepth(-30);
    this.drawSky(width, height);
  }

  private drawSky(width: number, height: number): void {
    this.skyLayer.clear();
    this.skyLayer.fillGradientStyle(SKY_TOP, SKY_TOP, SKY_BOTTOM, SKY_BOTTOM, 1, 1, 1, 1);
    this.skyLayer.fillRect(0, 0, width, height);
    this.skyLayer.fillGradientStyle(SKY_BOTTOM, SKY_BOTTOM, HORIZON_GLOW, HORIZON_GLOW, 0.0, 0.0, 0.45, 0.45);
    this.skyLayer.fillRect(0, height - GROUND_HEIGHT - 180, width, 180);
  }

  private createParallax(width: number, height: number): void {
    this.parallaxLayer = this.add.graphics().setDepth(-20);
    this.drawParallax(width, height);
  }

  private drawParallax(width: number, height: number): void {
    this.parallaxLayer.clear();
    const horizon = height - GROUND_HEIGHT;

    /** Far skyline (dim). */
    this.parallaxLayer.fillStyle(0x0c1226, 0.85);
    const farCount = Math.max(8, Math.round(width / 80));
    let cursor = 0;
    for (let i = 0; i < farCount; i++) {
      const bw = 70 + ((i * 37) % 60);
      const bh = 40 + ((i * 19) % 90);
      this.parallaxLayer.fillRect(cursor, horizon - bh, bw, bh);
      cursor += bw + 10;
      if (cursor > width) break;
    }

    /** Near skyline (slightly brighter, lower opacity). */
    this.parallaxLayer.fillStyle(0x111c3a, 0.95);
    const nearCount = Math.max(6, Math.round(width / 110));
    cursor = -20;
    for (let i = 0; i < nearCount; i++) {
      const bw = 90 + ((i * 53) % 70);
      const bh = 70 + ((i * 31) % 120);
      this.parallaxLayer.fillRect(cursor, horizon - bh, bw, bh);
      /** A few lit windows for atmosphere. */
      this.parallaxLayer.fillStyle(0x312e81, 0.65);
      for (let wy = horizon - bh + 12; wy < horizon - 8; wy += 14) {
        for (let wx = cursor + 6; wx < cursor + bw - 6; wx += 10) {
          if ((wx * wy) % 7 === 0) this.parallaxLayer.fillRect(wx, wy, 3, 4);
        }
      }
      this.parallaxLayer.fillStyle(0x111c3a, 0.95);
      cursor += bw + 14;
      if (cursor > width) break;
    }
  }

  private createGround(width: number, height: number): void {
    const groundY = height - GROUND_HEIGHT / 2;
    /** Invisible rectangle that owns the static physics body. */
    this.ground = this.add.rectangle(width / 2, groundY, width, GROUND_HEIGHT, 0x000000, 0);
    this.physics.add.existing(this.ground, true);

    this.groundLayer = this.add.graphics().setDepth(-10);
    this.drawGround(width, height);
  }

  private drawGround(width: number, height: number): void {
    this.groundLayer.clear();
    const top = height - GROUND_HEIGHT;

    /** Base fill. */
    this.groundLayer.fillStyle(GROUND_FILL, 1);
    this.groundLayer.fillRect(0, top, width, GROUND_HEIGHT);

    /** Top highlight strip. */
    this.groundLayer.fillStyle(GROUND_EDGE, 1);
    this.groundLayer.fillRect(0, top, width, 2);
    this.groundLayer.fillStyle(0x1f2937, 0.8);
    this.groundLayer.fillRect(0, top + 2, width, 1);

    /** Brick pattern. */
    this.groundLayer.lineStyle(1, GROUND_BRICK, 0.85);
    const brickW = 56;
    const brickH = 14;
    for (let row = 0; row < Math.ceil(GROUND_HEIGHT / brickH); row++) {
      const y = top + 6 + row * brickH;
      this.groundLayer.lineBetween(0, y, width, y);
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      for (let x = offset; x < width; x += brickW) {
        this.groundLayer.lineBetween(x, y, x, y + brickH);
      }
    }
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
      /** Shadow base. */
      this.platformLayer.fillStyle(0x000000, 0.35);
      this.platformLayer.fillRoundedRect(x + 3, y + 5, plat.width, plat.height, 4);
      /** Body. */
      this.platformLayer.fillStyle(PLATFORM_FILL, 1);
      this.platformLayer.fillRoundedRect(x, y, plat.width, plat.height, 4);
      /** Top highlight. */
      this.platformLayer.fillStyle(PLATFORM_EDGE, 1);
      this.platformLayer.fillRoundedRect(x, y, plat.width, 2, 1);
      /** Outline. */
      this.platformLayer.lineStyle(1, 0x0f172a, 1);
      this.platformLayer.strokeRoundedRect(x, y, plat.width, plat.height, 4);
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
    body.setAllowGravity(false);
    body.setImmovable(true);
  }

  private drawDecorations(): void {
    this.decorations.clear();

    const pointer = this.input.activePointer;
    const playerAim = this.matchOver
      ? { x: this.enemy.x, y: this.enemy.y }
      : { x: pointer.worldX, y: pointer.worldY };
    const enemyAim = { x: this.player.x, y: this.player.y };

    this.drawCharacter(this.player.x, this.player.y, this.playerPalette, playerAim, this.playerFlashUntil);
    this.drawCharacter(this.enemy.x, this.enemy.y, this.enemyPalette, enemyAim, this.enemyFlashUntil);
  }

  private drawCharacter(
    cx: number,
    cy: number,
    palette: Palette,
    aim: { x: number; y: number },
    flashUntil: number,
  ): void {
    const flashing = this.time.now < flashUntil;
    const bodyColor = flashing ? 0xffffff : palette.body;
    const headColor = flashing ? 0xffffff : palette.head;
    const trimColor = palette.trim;
    const g = this.decorations;

    /** Drop shadow at the player's feet. */
    g.fillStyle(0x000000, 0.45);
    g.fillEllipse(cx, cy + PLAYER_HEIGHT / 2 - 1, 38, 9);

    /** Legs — two small rounded rects. */
    g.fillStyle(palette.bodyDark, 1);
    g.fillRoundedRect(cx - 9, cy + 6, 7, 16, 2);
    g.fillRoundedRect(cx + 2, cy + 6, 7, 16, 2);

    /** Torso. */
    g.fillStyle(bodyColor, 1);
    g.fillRoundedRect(cx - 12, cy - 14, 24, 24, 6);
    g.lineStyle(2, trimColor, 1);
    g.strokeRoundedRect(cx - 12, cy - 14, 24, 24, 6);

    /** Chest strap (thin diagonal accent). */
    g.lineStyle(2, palette.bodyDark, 0.9);
    g.lineBetween(cx - 8, cy - 8, cx + 8, cy + 2);

    /** Head. */
    g.fillStyle(headColor, 1);
    g.fillCircle(cx, cy - 20, 8);
    g.lineStyle(2, trimColor, 1);
    g.strokeCircle(cx, cy - 20, 8);

    /** Visor — small dark band across head. */
    g.fillStyle(0x0f172a, 0.85);
    g.fillRoundedRect(cx - 7, cy - 22, 14, 4, 1);

    /** Gun arm extending in aim direction. */
    const dx = aim.x - cx;
    const dy = aim.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const shoulderX = cx + nx * 4;
    const shoulderY = cy - 6 + ny * 2;
    const tipX = cx + nx * 22;
    const tipY = cy - 4 + ny * 22;

    /** Arm. */
    g.lineStyle(6, palette.bodyDark, 1);
    g.lineBetween(shoulderX, shoulderY, tipX, tipY);
    /** Gun barrel. */
    g.lineStyle(4, palette.gun, 1);
    g.lineBetween(shoulderX + nx * 6, shoulderY + ny * 6, tipX + nx * 4, tipY + ny * 4);
    /** Muzzle tip highlight. */
    g.fillStyle(palette.gun, 1);
    g.fillCircle(tipX + nx * 4, tipY + ny * 4, 2.5);
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
    if (this.matchOver) {
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
    if (this.matchOver) {
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
      default:
        break;
    }
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
    if (this.matchOver) return;
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
        this.showResult(true);
      }
      return;
    }
    if (this.sendGameMessage && this.opponentPlayerId) {
      this.sendGameMessage({ type: 'game_hit', targetPlayerId: this.opponentPlayerId });
    }
  }

  private onPlayerHit(bullet: Phaser.GameObjects.GameObject): void {
    if (this.matchOver) return;
    if (bullet === this.player || bullet === this.enemy) return;
    const bx = (bullet as Phaser.GameObjects.Rectangle).x;
    const by = (bullet as Phaser.GameObjects.Rectangle).y;
    bullet.destroy();
    this.spawnHitParticles(bx, by, this.playerPalette.body);
    if (this.isDemo) {
      this.playerHealth = Math.max(0, this.playerHealth - BULLET_DAMAGE);
      this.triggerFlash('self');
    }
    /** In live mode, the shooter's client reports the authoritative hit. */
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
    this.input.setDefaultCursor('default');
    this.crosshair.setVisible(false);
    this.playerBullets.clear(true, true);
    this.enemyBullets.clear(true, true);

    const { width, height } = this.scale.gameSize;
    const accuracy =
      this.shotsFired > 0 ? Math.round((100 * this.shotsHit) / this.shotsFired) : 0;
    const remaining = Math.max(0, Math.round(this.playerHealth));

    const backdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000509, 0.82);

    const title = this.add
      .text(width / 2, height / 2 - 90, isVictory ? 'VICTORY' : 'DEFEAT', {
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
        height / 2 - 36,
        isVictory ? 'Opponent eliminated.' : 'You were eliminated.',
        {
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: '15px',
          color: '#94a3b8',
        },
      )
      .setOrigin(0.5);

    const statsBg = this.add
      .rectangle(width / 2, height / 2 + 36, 320, 96, 0x0f172a, 0.92)
      .setStrokeStyle(1, 0x1e293b);
    const statsText = this.add
      .text(
        width / 2,
        height / 2 + 36,
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

    const children: Phaser.GameObjects.GameObject[] = [
      backdrop,
      title,
      subtitle,
      statsBg,
      statsText,
    ];

    if (this.isDemo) {
      const button = this.add
        .text(width / 2, height / 2 + 130, 'Play Again', {
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#e2e8f0',
          backgroundColor: '#0e7490',
          padding: { left: 22, right: 22, top: 10, bottom: 10 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      button.on('pointerover', () => button.setBackgroundColor('#155e75'));
      button.on('pointerout', () => button.setBackgroundColor('#0e7490'));
      button.on('pointerdown', () => this.scene.restart());
      children.push(button);
    } else {
      const note = this.add
        .text(
          width / 2,
          height / 2 + 130,
          isVictory ? 'Returning to room…' : 'Returning to lobby…',
          {
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            fontSize: '13px',
            color: '#94a3b8',
          },
        )
        .setOrigin(0.5);
      children.push(note);
    }

    this.resultGroup = this.add.container(0, 0, children).setDepth(30);

    if (isVictory) this.spawnConfetti();
    else this.spawnSparks();
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

    /** Backgrounds. */
    this.drawSky(width, height);
    this.drawParallax(width, height);

    /** Ground. */
    if (this.ground) {
      this.ground.setPosition(width / 2, height - GROUND_HEIGHT / 2);
      this.ground.setSize(width, GROUND_HEIGHT);
      (this.ground.body as Phaser.Physics.Arcade.StaticBody | null)?.updateFromGameObject();
    }
    this.drawGround(width, height);

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
    if (this.ammoText) {
      this.ammoText.setPosition(width - 18, 44);
      this.ammoLabel.setPosition(width - 18, 68);
      this.repositionAmmoIcon();
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
        Phaser.GameObjects.Text | undefined,
      ];
      backdrop.setPosition(width / 2, height / 2);
      backdrop.setSize(width, height);
      title.setPosition(width / 2, height / 2 - 90);
      subtitle.setPosition(width / 2, height / 2 - 36);
      statsBg.setPosition(width / 2, height / 2 + 36);
      statsText.setPosition(width / 2, height / 2 + 36);
      if (action) action.setPosition(width / 2, height / 2 + 130);
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
