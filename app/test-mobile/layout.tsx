import type React from "react"
export default function TestMobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-gray-50 pt-20">{children}</div>
}
