const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** Money is stored as integer paise. Format only at the edge. */
export function formatPaise(paise: number) {
  return inr.format(paise / 100);
}
