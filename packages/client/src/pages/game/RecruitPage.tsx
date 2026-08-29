import React from 'react';
import RecruitPanel from '../../components/RecruitPanel';
import { useGame } from '../../contexts/GameContext';

const RecruitPage: React.FC = () => {
  const { militaryState, fetchMilitaryState } = useGame();
  return <RecruitPanel militaryState={militaryState} onRefresh={fetchMilitaryState} />;
};

export default RecruitPage;
