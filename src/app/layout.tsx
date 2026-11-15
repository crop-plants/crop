import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "C.R.O.P. — Climate and Resource Optimization for Plants",
  description:
    "Agricultural decision support for a one-acre vegetable farm in Al Ain, UAE. NASA Earth data, low-cost field sensors and an explainable rotation engine.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
