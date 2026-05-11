import { Navigate, Route, Routes } from 'react-router-dom';

import { ActiveRoomRedirect } from './components/ActiveRoomRedirect';
import { GameShellLayout } from './layouts/GameShellLayout';
import { HubMenuLayout } from './layouts/HubMenuLayout';
import { HomePage } from './pages/HomePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LobbyPage } from './pages/LobbyPage';
import { MatchPage } from './pages/MatchPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RoomPage } from './pages/RoomPage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';

export function App() {
  return (
    <>
      <ActiveRoomRedirect />
      <Routes>
      <Route element={<HubMenuLayout />}>
        <Route index element={<HomePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<GameShellLayout />}>
        <Route path="lobby" element={<LobbyPage />} />
        <Route path="room/:roomId" element={<RoomPage />} />
        <Route path="match/:matchId" element={<MatchPage />} />
      </Route>
    </Routes>
    </>
  );
}
