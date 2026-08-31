import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Berlin Roleplay",
  description: "Professionelles Discord Roleplay mit ER:LC-Integration, Ticket-System, Giveaways und Components V2.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
