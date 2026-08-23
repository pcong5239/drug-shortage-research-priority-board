import React from 'react';

export const MedicalDisclaimerBanner: React.FC = () => {
  return (
    <aside className="medical-disclaimer-banner" aria-label="Mandatory Medical and Research Limitations">
      <div className="disclaimer-inner">
        <div className="disclaimer-badge">NON-MEDICAL RESEARCH WORKBENCH</div>
        <p className="disclaimer-text">
          <strong>Mandatory Notice:</strong> This board operates solely for non-medical public research prioritization.
          It does not provide medical advice, clinical diagnosis, treatment recommendations, drug substitution, clinical priority rankings, procurement directives, or medication distribution decisions.
          Data sourced from openFDA and external research citations may be unvalidated and must never guide clinical care.
        </p>
      </div>
    </aside>
  );
};
