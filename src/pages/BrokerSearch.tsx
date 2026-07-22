import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { BrokerSearchView } from "@/components/search/BrokerSearchView";

export default function BrokerSearch() {
  return (
    <DashboardLayout>
      <PageHeader
        title="Broker Search"
        description="Search empty legs with full operator and pricing details"
      />
      <BrokerSearchView />
    </DashboardLayout>
  );
}
