/**
 * Crisis resources by country. Shown in-app; no data is sent anywhere when shown.
 * VERIFY these numbers before every release — helplines change.
 * Last reviewed: 2026-10 (India: Tele-MANAS, national emergency 112).
 */
export interface Resource {
  name: string;
  detail: string;
  tel: string;
  display: string;
}

export interface CountryResources {
  country: string;
  emergency: Resource;
  helplines: Resource[];
}

export const RESOURCES: Record<string, CountryResources> = {
  IN: {
    country: "India",
    emergency: { name: "Emergency", detail: "Police, ambulance, fire", tel: "112", display: "112" },
    helplines: [
      {
        name: "Tele-MANAS",
        detail: "Free, 24×7 mental-health support from the Government of India, in many Indian languages",
        tel: "14416",
        display: "14416",
      },
      {
        name: "Tele-MANAS (toll-free)",
        detail: "Same service, alternate number",
        tel: "18008914416",
        display: "1-800-891-4416",
      },
    ],
  },
};

export function resourcesFor(country: string): CountryResources {
  return RESOURCES[country] ?? RESOURCES.IN!;
}
