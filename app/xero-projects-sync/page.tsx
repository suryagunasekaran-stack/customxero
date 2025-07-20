import { ProjectsSyncButton } from '@/components/xero';

export default function XeroProjectsSyncPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Xero Projects Sync</h1>
      <ProjectsSyncButton />
    </div>
  );
}