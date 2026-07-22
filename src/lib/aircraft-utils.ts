const CATEGORY_SEAT_RANGES: Record<string, string> = {
  heavy: "10-16 seats",
  light: "6-8 seats",
  midsize: "7-9 seats",
  super_midsize: "8-10 seats",
  turboprop: "5-8 seats",
  ultra_long_range: "12-16 seats",
  vip_airliner: "15-25 seats",
  vlj: "4-6 seats",
};

export function getCategorySeatRange(categoryId: string | null): string | null {
  if (!categoryId) return null;
  return CATEGORY_SEAT_RANGES[categoryId] ?? null;
}
