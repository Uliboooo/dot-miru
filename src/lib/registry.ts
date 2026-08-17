import { parse } from "smol-toml";
import registryToml from "../data/profiles.toml?raw";

export type RegistryEntry = { slug: string; source: string };

const parsed = parse(registryToml) as { profile?: RegistryEntry[] };
export const registry: RegistryEntry[] = (parsed.profile ?? []).filter(
  (entry): entry is RegistryEntry => typeof entry.slug === "string" && typeof entry.source === "string",
);

export function findProfile(slug: string): RegistryEntry | undefined {
  return registry.find((entry) => entry.slug === slug);
}
