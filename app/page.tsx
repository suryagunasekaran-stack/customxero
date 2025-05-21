'use client';

export default function Home() {
  return (
    <main className="p-10 space-y-6">
      <h1 className="text-3xl font-bold text-black">Welcome to Xero OAuth Demo</h1>
      <a
        href="/api/connect"
        className="inline-block px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Connect to Xero
      </a>
    </main>
  );
}
