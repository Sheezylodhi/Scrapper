import "./globals.css";

export const metadata = { title: "Scrapper", description: "Scrapper Dashboard" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body >
        {children}
      </body>
    </html>
  );
}
