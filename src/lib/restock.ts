// Texto corto para explicar por qué product_replenishment sugiere reponer
// un producto — usado en los chips de Lista y Comprar. Ver la vista
// product_replenishment (columna restock_reason) para la lógica real.
//
// "ciclo_de_compra" muestra el número exacto de días en vez de un "hace
// tiempo" vago -- a pedido del usuario, para poder juzgar la urgencia real
// de un vistazo en vez de una frase genérica igual para 8 días que para 80.
//
// "umbral_manual" también suma la fecha de la última compra cuando se
// conoce -- reportado por el usuario: el motivo es la cantidad (quedó por
// debajo del umbral configurado), no el tiempo transcurrido, así que la
// última compra puede ser reciente (compraste hace 3 días y ya está bajo
// igual, por ej. porque se consume rápido o el umbral quedó alto). Por
// eso NO reusa el "hace X días que no lo comprás" de ciclo_de_compra --
// esa frase asume que hace tiempo que no se compra, que acá no siempre es
// cierto -- sino una nota neutral con el hecho ("lo compraste hace X
// días") que no da a entender abandono cuando no lo hay.
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
      return daysSinceLastRestock != null
        ? `queda poco stock (lo compraste hace ${daysSinceLastRestock} día${daysSinceLastRestock === 1 ? "" : "s"})`
        : "queda poco stock";
    case "ciclo_de_compra":
      return daysSinceLastRestock != null
        ? `hace ${daysSinceLastRestock} día${daysSinceLastRestock === 1 ? "" : "s"} que no lo comprás`
        : "hace tiempo no lo comprás";
    default:
      return "";
  }
}
