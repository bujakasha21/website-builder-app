import { Geist } from "next/font/google";

// app chrome font (bundled); the site fonts below are loaded by the browser from the stylesheet link in the root layout
export const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

/** every family a site can choose. For production these should be self-hosted (no request to Google from visitors). */
export const FONTS: Record<string, { label: string; family: string }> = {
  geist: { label: "Geist", family: geist.style.fontFamily },
  inter: { label: "Inter", family: "'Inter', system-ui, sans-serif" },
  manrope: { label: "Manrope", family: "'Manrope', system-ui, sans-serif" },
  dmsans: { label: "DM Sans", family: "'DM Sans', system-ui, sans-serif" },
  serif: { label: "Source Serif", family: "'Source Serif 4', Georgia, serif" },
  barlow: { label: "Barlow", family: "'Barlow', 'Arial Narrow', sans-serif" },
  outfit: { label: "Outfit", family: "'Outfit', system-ui, sans-serif" },
  merriweather: { label: "Merriweather", family: "'Merriweather', Georgia, serif" },
  fraunces: { label: "Fraunces", family: "'Fraunces', Georgia, serif" },
  grotesk: { label: "Space Grotesk", family: "'Space Grotesk', system-ui, sans-serif" },
  bricolage: { label: "Bricolage Grotesque", family: "'Bricolage Grotesque', system-ui, sans-serif" },
  lora: { label: "Lora", family: "'Lora', Georgia, serif" },
};
export const FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Space+Grotesk:wght@400..700&family=Barlow:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Lora:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&family=Merriweather:wght@400;700&family=Outfit:wght@400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap";
