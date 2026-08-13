import React from 'react';

import { LegalDocument } from '@/components/legal/legal-document';
import legal from '@/constants/legal.json';

export default function TermsScreen() {
  return <LegalDocument content={legal.documents.terminos} updatedAt={legal.updatedAt} />;
}
