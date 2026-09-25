export function generateStaticParams() {
  return [{ id: "demo" }, { id: "1" }]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
