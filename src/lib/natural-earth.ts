import type { StyleSpecification } from "maplibre-gl";

const data = (name: string) => `/maps/natural-earth/${name}.json`;
export const naturalEarthStyle: StyleSpecification = {
  version: 8,
  sources: {
    countries: { type: "geojson", data: data("countries") },
    regions: { type: "geojson", data: data("regions"), tolerance: 0.7 },
    lakes: { type: "geojson", data: data("lakes") },
  },
  layers: [
    { id: "water", type: "background", paint: { "background-color": "#000000" } },
    { id: "land", type: "fill", source: "countries", paint: { "fill-color": "#111111" } },
    { id: "regions", type: "line", source: "regions", minzoom: 4, paint: { "line-color": "#272727", "line-width": 0.6 } },
    { id: "lakes", type: "fill", source: "lakes", paint: { "fill-color": "#000000" } },
    { id: "countries", type: "line", source: "countries", paint: { "line-color": "#3c3c3c", "line-width": 0.8 } },
  ],
};
export type PlaceLabel = { name: string; position: [number, number]; rank: number; population: number; kind: "country" | "city" };
export const naturalEarthLabels = data("labels");
