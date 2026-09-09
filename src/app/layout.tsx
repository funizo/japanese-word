import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
    title: "japanese-word | 나의 일본어 노트",
    description: "한 단어씩, 천천히 쌓아가는 나만의 일본어 학습 공간.",
    applicationName: "japanese-word",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
        { media: "(prefers-color-scheme: dark)", color: "#101827" },
    ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
            <body className="min-h-full">
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    );
}
