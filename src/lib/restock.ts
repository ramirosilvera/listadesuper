// Texto corto para explicar por qué product_replenishment sugiere reponer
// un producto — usado en los chips de Lista y Comprar. Ver la vista
// product_replenishment (columna restock_reason) para la lógica real.
export function restockReasonLabel(reason: string | null): string {
  switch (reason) {
    case "prediccion":
      return "se está por acabar";
    case "umbral_manual":
      return "queda poco stock";
    case "ciclo_de_compra":
      return "hace tiempo no lo comprás";
    default:
      return "";
  }
}
