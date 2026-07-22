import { ClientSearchView } from "@/components/search/ClientSearchView";

export default function ClientSearchEmbed() {
  return (
    <div className="eclipse-public fixed inset-0 bg-background overflow-auto">
      <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">
        <ClientSearchView />
      </div>
    </div>
  );
}
