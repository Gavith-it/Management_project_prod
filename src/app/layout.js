import "./globals.css";

export const metadata = {
  title: "Zari Tracker",
  description: "Zari Tracker Application",
};

export const viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div id="app">
          {children}
        </div>
      </body>
    </html>
  );
}
