import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** Web document shell — sets RAGSuite branding instead of default localhost title. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>RAGSuite</title>
        <meta name="application-name" content="RAGSuite" />
        <meta name="apple-mobile-web-app-title" content="RAGSuite" />
        <meta name="description" content="The Sovereign Enterprise AI Platform — an innovation by NITSAN." />
        <meta name="theme-color" content="#F4F1EA" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#16271F" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="48x48" href="/assets/images/favicon.png" />
        <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
