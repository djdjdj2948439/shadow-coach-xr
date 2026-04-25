import Link from "next/link";
import { Chakra_Petch, IBM_Plex_Sans } from "next/font/google";

import TripoAssetGenerator from "@/components/tripo/TripoAssetGenerator";

const displayFont = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-tripo-display",
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-tripo-body",
});

export const metadata = {
  title: "Tripo3D Asset Generator",
  description:
    "Generate ISS-themed WebXR assets through secure server-side Tripo API routes.",
};

export default function TripoPage() {
  return (
    <main
      className={`${displayFont.variable} ${bodyFont.variable} min-h-screen bg-[linear-gradient(180deg,#020617_0%,#071326_46%,#020617_100%)] text-white`}
      style={{
        fontFamily: "var(--font-tripo-body)",
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-sky-100">
              Tripo3D Asset Generator
            </div>
            <h1
              className="mt-4 text-4xl font-semibold tracking-[0.02em] text-white sm:text-5xl"
              style={{ fontFamily: "var(--font-tripo-display)" }}
            >
              Generate ISS-themed WebXR assets securely
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
              Generate ISS-themed WebXR assets through secure server-side Tripo
              API routes. Presets, prompt editing, polling, and result links all
              live here, while the API key stays in the backend only.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-white/12 bg-white/6 px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/10"
          >
            Back Home
          </Link>
        </div>

        <TripoAssetGenerator />
      </div>
    </main>
  );
}
