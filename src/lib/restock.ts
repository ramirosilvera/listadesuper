// Texto corto para explicar por qué product_replenishment sugiere reponer
// un producto — usado en los chips de Lista y Comprar. Ver la vista
// product_replenishment (columna restock_reason) para la lógica real.
//
// "ciclo_de_compra" muestra el número exacto de días en vez de un "hace
// tiempo" vago -- a pedido del usuario, para poder juzgar la urgencia real
// de un vistazo en vez de una frase genérica igual para 8 días que para 80.
export function restockReasonLabel(
  reason: string | null,
  daysSinceLastRestock: number | null,
): string {
  switch (reason) {
    case "marcado_manual":
      return "lo marcaste para reponer";
    case "prediccion":
      return "se está por acabar";
    case "umbral_manual":
      return "queda poco stock";
    case "ciclo_de_compra":
      return daysSinceLastRestock != null
        ? `hace ${daysSinceLastRestock} día${daysSinceLastRestock === 1 ? "" : "s"} que no lo comprás`
        : "hace tiempo no lo comprás";
    default:
      return "";
  }
}
