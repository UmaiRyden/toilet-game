import { useEffect, useRef } from 'react';
import Phaser from 'phaser';

import type { GameMessage } from '../contexts/GameRealtimeContext';
import type { PlatformSpec } from '../types/realtime';
import { ArenaScene, type ArenaSceneInitData } from './scenes/ArenaScene';

type PhaserGameProps = {
  isDemo: boolean;
  selfPlayerId: string;
  opponentPlayerId: string;
  selfSeat: number;
  stakeSol?: number;
  platforms?: PlatformSpec[];
  sendGameMessage: (payload: Record<string, unknown>) => void;
  subscribeGameMessages: (handler: (msg: GameMessage) => void) => () => void;
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

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#0b1220',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
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
      selfPlayerId: propsRef.current.selfPlayerId,
      opponentPlayerId: propsRef.current.opponentPlayerId,
      selfSeat: propsRef.current.selfSeat,
      stakeSol: propsRef.current.stakeSol,
      platforms: propsRef.current.platforms,
      sendGameMessage: (payload) => propsRef.current.sendGameMessage(payload),
      subscribeGameMessages: (handler) => propsRef.current.subscribeGameMessages(handler),
    };
    game.scene.add('ArenaScene', ArenaScene, true, init);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-[min(420px,55vh)] flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950"
    />
  );
}
