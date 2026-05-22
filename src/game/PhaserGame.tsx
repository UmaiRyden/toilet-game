import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import type { GameMessage } from '../contexts/GameRealtimeContext';
import type { CrosshairStyle } from '../contexts/SettingsContext';
import type { PlatformSpec } from '../types/realtime';
import {
  ArenaScene,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type ArenaSceneInitData,
} from './scenes/ArenaScene';

type PhaserGameProps = {
  isDemo: boolean;
  matchId: string;
  selfPlayerId: string;
  opponentPlayerId: string;
  selfSeat: number;
  stakeSol?: number;
  platforms?: PlatformSpec[];
  /** Player IDs that purchased the 20-round magazine upgrade for this match. */
  extendedMagPlayers?: string[];
  paused?: boolean;
  /** Reticle style from user settings — applied live, no scene restart needed. */
  crosshairStyle?: CrosshairStyle;
  /** Whether to show the FPS overlay — applied live. */
  showFps?: boolean;
  sendGameMessage: (payload: Record<string, unknown>) => void;
  subscribeGameMessages: (handler: (msg: GameMessage) => void) => () => void;
  exitToLobby: () => void;
  onPauseAllowedChange?: (allowed: boolean) => void;
};

export function PhaserGame(props: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return;
    }
    const container = containerRef.current;

    /**
     * Fixed-resolution game world. Every client renders an identical 1280×720
     * world, then Phaser's Scale.FIT mode scales the canvas uniformly to fit
     * the container while preserving aspect ratio. All gameplay coordinates
     * (spawns, platforms, physics) operate in this internal space so the two
     * players always agree on world positions regardless of monitor size.
     */
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: '#0b1220',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
      },
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 800 },
          debug: false,
        },
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    const init: ArenaSceneInitData = {
      isDemo: propsRef.current.isDemo,
      matchId: propsRef.current.matchId,
      selfPlayerId: propsRef.current.selfPlayerId,
      opponentPlayerId: propsRef.current.opponentPlayerId,
      selfSeat: propsRef.current.selfSeat,
      stakeSol: propsRef.current.stakeSol,
      platforms: propsRef.current.platforms,
      extendedMagPlayers: propsRef.current.extendedMagPlayers,
      crosshairStyle: propsRef.current.crosshairStyle,
      showFps: propsRef.current.showFps,
      sendGameMessage: (payload) => propsRef.current.sendGameMessage(payload),
      subscribeGameMessages: (handler) => propsRef.current.subscribeGameMessages(handler),
      exitToLobby: () => propsRef.current.exitToLobby(),
      onPauseAllowedChange: (allowed) => propsRef.current.onPauseAllowedChange?.(allowed),
    };
    game.scene.add('ArenaScene', ArenaScene, true, init);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    const sceneManager = game.scene;
    /** ArenaScene must exist by the time the host toggles pause — it's added in the first effect. */
    if (props.paused) {
      if (sceneManager.isActive('ArenaScene') && !sceneManager.isPaused('ArenaScene')) {
        sceneManager.pause('ArenaScene');
      }
    } else if (sceneManager.isPaused('ArenaScene')) {
      sceneManager.resume('ArenaScene');
    }
  }, [props.paused]);

  /**
   * Settings can change mid-match. Forward the latest values to the running scene
   * so toggling crosshair / FPS in another tab updates the canvas without a restart.
   */
  useEffect(() => {
    const scene = gameRef.current?.scene.getScene('ArenaScene') as
      | (ArenaScene & {
          applyCrosshairStyle?: (s: CrosshairStyle) => void;
          applyShowFps?: (v: boolean) => void;
        })
      | undefined;
    if (!scene) return;
    if (props.crosshairStyle) scene.applyCrosshairStyle?.(props.crosshairStyle);
    if (typeof props.showFps === 'boolean') scene.applyShowFps?.(props.showFps);
  }, [props.crosshairStyle, props.showFps]);

  return <div ref={containerRef} className="h-full w-full" />;
}
