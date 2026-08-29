import React from 'react';
import PolicyPanel from '../../components/PolicyPanel';
import { useGame } from '../../contexts/GameContext';

const PoliciesPage: React.FC = () => {
  const { state, notificationTrigger } = useGame();
  if (!state) return null;
  return <PolicyPanel currentTurn={state.game.currentTurn} refreshTrigger={notificationTrigger} />;
};

export default PoliciesPage;
