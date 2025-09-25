export const dynamic = 'force-dynamic';
export const revalidate = 0;
import DashboardClient from './DashboardClient'; // ✅ importe direto

export default function Page() {
  return <DashboardClient />; // Client Component renderiza no cliente automaticamente
}
