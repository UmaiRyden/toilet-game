import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import type { GameMessage } from '../contexts/GameRealtimeContext';
import type { PlatformSpec } from '../types/realtime';
import { ArenaScene, type ArenaSceneInitData } from './scenes/ArenaScene';

type PhaserGameProps = {
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

    const initialWidth = Math.max(1, container.clientWidth);
    const initialHeight = Math.max(1, container.clientHeight);

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: '#0b1220',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: initialWidth,
        height: initialHeight,
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
      sendGameMessage: (payload) => propsRef.current.sendGameMessage(payload),
      subscribeGameMessages: (handler) => propsRef.current.subscribeGameMessages(handler),
      exitToLobby: () => propsRef.current.exitToLobby(),
    };
    game.scene.add('ArenaScene', ArenaScene, true, init);

    /**
     * Phaser.Scale.RESIZE only polls the parent on window-level events. Flex-driven
     * size changes (devtools dock, sidebar toggle, layout shifts after image load,
     * orientation change) can leave the canvas stuck at a stale size. A
     * ResizeObserver on the container is the canonical fix.
     */
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) continue;
        const scale = game.scale;
        if (Math.abs(scale.width - width) > 0.5 || Math.abs(scale.height - height) > 0.5) {
          scale.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="flex w-full flex-1" />;
}
