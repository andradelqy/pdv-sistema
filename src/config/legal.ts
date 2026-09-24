export const legalConfig = {
  nomeOperador: import.meta.env.VITE_LEGAL_NAME?.trim() || 'responsável comercial pelo Órbita',
  documentoOperador: import.meta.env.VITE_LEGAL_DOCUMENT?.trim() || '',
  emailSuporte: import.meta.env.VITE_SUPPORT_EMAIL?.trim() || '',
  emailPrivacidade: import.meta.env.VITE_PRIVACY_EMAIL?.trim() || import.meta.env.VITE_SUPPORT_EMAIL?.trim() || '',
}

export function canalDeContato(email?: string) {
  return email || 'o canal de atendimento informado na contratação'
}

