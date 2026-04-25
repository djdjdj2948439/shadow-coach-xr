import { TripoPromptPreset } from "@/lib/types";

export const TRIPO_PROMPT_PRESETS: Record<string, TripoPromptPreset> = {
  ISS_MODULE: {
    id: "ISS_MODULE",
    label: "ISS Module",
    prompt:
      "A realistic International Space Station module interior with white curved walls, handrails, control panels, cable details, storage bags, soft lighting, optimized as a low-poly GLB asset for WebXR.",
  },
  ISS_TOOL_KIT: {
    id: "ISS_TOOL_KIT",
    label: "ISS Tool Kit",
    prompt:
      "A compact astronaut tool kit floating in zero gravity, including wrench, screwdriver, tether hooks and small labeled equipment, clean sci-fi style, low-poly game-ready 3D model.",
  },
  ISS_CONTROL_PANEL: {
    id: "ISS_CONTROL_PANEL",
    label: "ISS Control Panel",
    prompt:
      "A futuristic ISS control panel with screens, switches, warning labels, cables and modular surface details, low-poly 3D asset for a browser-based WebXR scene.",
  },
  ISS_STORAGE_BAG: {
    id: "ISS_STORAGE_BAG",
    label: "ISS Storage Bag",
    prompt:
      "A soft white fabric storage bag used inside a space station, with straps, zippers, label patches and velcro texture, low-poly 3D model.",
  },
  ASSISTANT_ROBOT: {
    id: "ASSISTANT_ROBOT",
    label: "Assistant Robot",
    prompt:
      "A small friendly assistant robot designed for an ISS training module, white shell, blue sensor eye, compact body, floating in microgravity, low-poly game-ready 3D model.",
  },
  ISS_HANDRAIL: {
    id: "ISS_HANDRAIL",
    label: "ISS Handrail",
    prompt:
      "A curved white ISS interior handrail with mounting brackets, subtle wear, clean aerospace finish and low-poly geometry optimized for a browser-based WebXR training scene.",
  },
  ISS_FLOATING_TABLET: {
    id: "ISS_FLOATING_TABLET",
    label: "ISS Floating Tablet",
    prompt:
      "A compact astronaut tablet floating in microgravity, protected corners, tether loop, simple mission UI and a clean low-poly sci-fi aesthetic for a WebXR training environment.",
  },
  ISS_EMERGENCY_PANEL: {
    id: "ISS_EMERGENCY_PANEL",
    label: "ISS Emergency Panel",
    prompt:
      "An ISS emergency response panel with warning stripes, labeled toggles, alarm indicator lights and compact low-poly geometry for an interactive XR safety simulation.",
  },
  ISS_CABLE_BUNDLE: {
    id: "ISS_CABLE_BUNDLE",
    label: "ISS Cable Bundle",
    prompt:
      "A tidy bundle of ISS utility cables with clips, connectors and soft bends, designed as a low-poly modular prop for a space-station WebXR scene.",
  },
  ISS_WINDOW_CUPOLA: {
    id: "ISS_WINDOW_CUPOLA",
    label: "Cupola Window",
    prompt:
      "A low-poly ISS cupola observation window assembly with shutters, framing, bolts and a soft Earthlight reflection style for a browser-based WebXR training module.",
  },
};

export const TRIPO_PROMPT_PRESET_ORDER = [
  "ISS_MODULE",
  "ISS_TOOL_KIT",
  "ISS_CONTROL_PANEL",
  "ISS_STORAGE_BAG",
  "ASSISTANT_ROBOT",
  "ISS_HANDRAIL",
  "ISS_CABLE_BUNDLE",
  "ISS_WINDOW_CUPOLA",
] as const;
