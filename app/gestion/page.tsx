import { redirect } from 'next/navigation'

// La puerta de entrada del sistema es la agenda del día, no la lista completa
// de operaciones ordenada por fecha de alta.
export default function GestionPage() {
  redirect('/gestion/inicio')
}
