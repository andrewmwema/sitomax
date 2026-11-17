export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="platform-ui platform-auth flex min-h-screen flex-1 flex-col">
    {/* eslint-disable-next-line @next/next/no-page-custom-font -- scoped to platform authentication */}
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&display=swap" />
    {children}
  </div>;
}
