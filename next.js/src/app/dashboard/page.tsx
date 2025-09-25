export const dynamic = 'force-dynamic';
export const revalidate = 0;

import NextDynamic from 'next/dynamic';
const DashboardClient = NextDynamic(() => import('./DashboardClient'), { ssr: false });

export default function Page() {
  return <DashboardClient />;
}

