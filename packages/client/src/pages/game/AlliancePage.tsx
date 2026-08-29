import React from 'react';
import AlliancePanel from '../../components/AlliancePanel';
import { useGame } from '../../contexts/GameContext';

const AlliancePage: React.FC = () => {
  const { gameId, state, notificationTrigger } = useGame();
  return (
    <div className="card">
      <AlliancePanel gameId={gameId} myCountryId={state?.myCountryId || ''} refreshTrigger={notificationTrigger} />
    </div>
  );
};

export default AlliancePage;
