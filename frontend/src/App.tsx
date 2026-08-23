import React from 'react';
import { WalletProvider } from './context/WalletContext';
import { ContractProvider } from './context/ContractContext';
import { Header } from './components/Header';
import { MedicalDisclaimerBanner } from './components/MedicalDisclaimerBanner';
import { RoundContextRail } from './components/RoundContextRail';
import { MainWorkbench } from './components/MainWorkbench';
import { Inspector } from './components/Inspector';

export const AppContent: React.FC = () => {
  return (
    <div className="workbench-app-container" id="app-workbench-root">
      <a href="#main-workbench-content" className="skip-link">
        Skip to main content
      </a>

      <Header />
      <MedicalDisclaimerBanner />

      <div className="workbench-layout" id="main-workbench-content">
        <RoundContextRail />
        <MainWorkbench />
      </div>

      <Inspector />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <WalletProvider>
      <ContractProvider>
        <AppContent />
      </ContractProvider>
    </WalletProvider>
  );
};

export default App;
