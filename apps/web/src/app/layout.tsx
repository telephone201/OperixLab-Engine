import React from 'react';
import './globals.css';

export const metadata = {
    title: 'Operix AI',
    description: 'Operix AI — operating assistant for Operix Labs',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
