import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruffle — Indian Rummy",
  description: "Play Indian Rummy online with friends. Real-time multiplayer, private rooms, no sign-up required.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
