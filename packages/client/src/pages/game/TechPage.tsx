import React from 'react';
import TechTreePanel from '../../components/TechTreePanel';
import { useGame } from '../../contexts/GameContext';

const TechPage: React.FC = () => {
  const { gameId, notificationTrigger } = useGame();
  return (
    <div className="card">
      <TechTreePanel gameId={gameId} refreshTrigger={notificationTrigger} />
    </div>
  );
};

export default TechPage;
