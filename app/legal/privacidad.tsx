import React from 'react';

import { LegalDocument } from '@/components/legal/legal-document';
import legal from '@/constants/legal.json';

export default function PrivacyPolicyScreen() {
  return <LegalDocument content={legal.documents.privacidad} updatedAt={legal.updatedAt} />;
}
