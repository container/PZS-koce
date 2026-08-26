export type AccommodationUnit = {
  bentralUnitId: string;
  name: string;
  capacity?: number;
  availableUnitCount?: number;
  maxAdults?: number;
  maxChildren?: number;
};

export type Hut = {
  id: string;
  pzsId: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  pzsUrl: string;
  mapzsUrl?: string;
  photoUrl?: string;
  bentralIframeUrl: string;
  bentralBuildingId: string;
  bentralKey: string;
  defaultUnitId?: string;
};

export type AvailabilitySearchInput = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: { age: number }[];
};

export type AvailabilityStatus =
  | "available"
  | "unavailable"
  | "unknown"
  | "error";

export type UnitAvailability = {
  bentralUnitId: string;
  unitName: string;
  status: AvailabilityStatus;
  price?: number;
  priceDisplay?: string;
  raw?: unknown;
  errorMessage?: string;
  cached?: boolean;
  cachedAt?: string;
  stale?: boolean;
};

export type UnitsResponse = {
  hutId: string;
  units: AccommodationUnit[];
  fetchedAt: string;
  cached: boolean;
};

export type AvailabilityResponse = {
  hutId: string;
  hutName: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: { age: number }[];
  results: UnitAvailability[];
  checkedAt: string;
  stale?: boolean;
  refreshPending?: boolean;
  sourceUrl?: string;
};

export type HutAvailabilitySummary = {
  hut: Hut;
  results: UnitAvailability[];
  status: "checked" | "pending" | "error";
  availableCount: number;
  unavailableCount: number;
  unresolvedCount: number;
  lowestPrice?: number;
  lowestPriceDisplay?: string;
  checkedAt: string;
  stale?: boolean;
  mode?: "quick" | "full";
  errorMessage?: string;
  sourceUrl?: string;
};

export type MultiHutAvailabilityResponse = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: { age: number }[];
  checkedAt: string;
  huts: HutAvailabilitySummary[];
};
