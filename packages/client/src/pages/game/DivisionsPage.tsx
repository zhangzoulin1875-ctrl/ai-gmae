import React from 'react';
import DivisionPanel from '../../components/DivisionPanel';
import { useGame } from '../../contexts/GameContext';

const DivisionsPage: React.FC = () => {
  const { militaryState, fetchMilitaryState, goToTab } = useGame();
  return (
    <DivisionPanel
      militaryState={militaryState}
      onRefresh={fetchMilitaryState}
      onSwitchTab={(tab) => goToTab(tab)}
    />
  );
};

export default DivisionsPage;
