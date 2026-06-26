import "./globals.css";

export const metadata = {
  title: "Uudam Poster Generator",
  description: "China doc → branded travel poster",
  icons: {
    icon: "/uudam-logo.jpg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="mn">
      <body>{children}</body>
    </html>
  );
}
