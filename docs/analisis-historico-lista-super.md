# Análisis del histórico de Google Keep — catálogo inicial de ListaSuper

Este documento resume la normalización del historial de la lista de súper (Google Keep, ~366 ítems tildados a lo largo del tiempo) en un catálogo estandarizado, pensado como **seed inicial** de la tabla `products` para la Fase 1 de la app.

Archivos generados:
- `data/seed/categorias.csv` — 12 categorías de supermercado.
- `data/seed/productos_historico.csv` — 140 productos normalizados, con categoría, unidad de referencia, vida útil estimada (para el default de vencimiento) y frecuencia histórica de compra.

> **Actualización:** tras una ronda de preguntas al usuario se resolvieron 4 de las ambigüedades de mayor frecuencia (ver sección "Resueltas con el usuario" más abajo). Quedan 9 sin resolver, de baja frecuencia (1-2 apariciones cada una), documentadas para corregir directamente en la app.

## Metodología

1. Se extrajeron los 366 ítems tildados (`[x]`) y no tildados de la lista pegada.
2. Se contaron ocurrencias exactas (case-insensitive) para no perder frecuencia real.
3. Se agruparon variantes de escritura del mismo producto: errores de tipeo (`Ciff pisos` → `Cif pisos`, `Vierulana` → `Virulana`, `Raid liquidó` → `Raid líquido`), alias conocidos por anotación explícita en la propia lista (`Echo (Blem)` confirma que "Echo" es el apodo que usan para Blem pisos) y singular/plural o mayúsculas.
4. **No se fusionaron productos que son genuinamente distintos** aunque compartan familia: `Queso crema`, `Queso cremoso`, `Queso para rallar`, `Queso rallado` y `Queso duro` quedaron separados porque son compras diferentes en la práctica. Lo mismo con `Fideos largos` / `Fideos cortos` / `Fideos sopa`, o `Sal` / `Sal fina` / `Sal parrillera`.
5. Cuando un ítem del historial era ambiguo (no se podía inferir el producto exacto), se dejó una entrada con `a_confirmar = si` y una nota explicando la duda, en vez de adivinar y contaminar el catálogo.

## Frecuencia por categoría

| Categoría | Compras históricas | Productos distintos |
|---|---:|---:|
| Almacén | 96 | 52 |
| Limpieza del hogar | 81 | 21 |
| Lácteos, huevos y fiambres | 65 | 13 |
| Higiene y cuidado personal | 40 | 14 |
| Descartables y hogar | 36 | 13 |
| Panadería | 17 | 4 |
| Insecticidas y repelentes | 10 | 9 |
| Bebidas e infusiones | 6 | 4 |
| Bebé | 6 | 5 |
| Verdulería | 4 | 3 |
| Mascotas | 3 | 1 |
| Congelados y otros | 1 | 1 |

La casi ausencia de Verdulería (4) y Fiambrería/Congelados (1-2) probablemente no refleja el consumo real, sino que esos productos no se anotaban en Keep (se compran "a ojo" sin necesidad de recordatorio). Vale la pena confirmarlo: si es así, el catálogo inicial de esas categorías va a quedar corto y conviene cargarlo a mano al principio.

## Top 20 productos más comprados (candidatos a "reposición frecuente")

1. Manteca — 20
2. Detergente (lavavajillas) — 16
3. Leche — 13
4. Blem pisos — 13
5. Huevos — 12
6. Pan — 12
7. Lavandina — 12
8. Bolsas de basura — 9
9. Arroz — 8
10. Rollo de cocina (papel toalla) — 8
11. Azúcar — 7
12. Algodón — 7
13. Queso crema — 6
14. Aceite de oliva — 6
15. Mermelada — 6
16. Antigrasa (desengrasante) — 6
17. Jabón de tocador (pan, para bañarse) — 5
18. Papel higiénico — 5
19. Pasta dental — 4
20. Crema de enjuague (acondicionador) — 4

Estos son los mejores candidatos para tener, desde el día 1, un umbral manual de "avisame cuando quede poco" (Fase 4 del plan), porque ya sabemos que se compran seguido.

## Resueltas con el usuario (4)

| Duda original | Frecuencia | Resolución | Producto final en el catálogo |
|---|---:|---|---|
| "Jabón" a secas | 5 | El jabón de manos y el de ropa ya se anotaban por separado (líquidos); "Jabón" a secas es el pan de jabón de tocador | Jabón de tocador (pan, para bañarse) |
| "Cif" a secas | 3 | El hogar compra ambos (crema y pisos) indistintamente; no se puede reasignar el historial con certeza a uno u otro, así que estas 3 compras quedan sin volcar a un producto puntual — a futuro cada compra se va a registrar contra `Cif crema` o `Cif pisos` según corresponda | *(sin entrada propia — se descartó del seed)* |
| "Aceite"/"Óleo" a secas | 2 | Son dos productos completamente distintos: "Aceite" es aceite de oliva de uso diario; "Óleo" es óleo calcáreo (higiene/piel), no aceite de cocina | Aceite de oliva (+1) y Óleo calcáreo (nuevo producto) |
| "Aceite de oliva suelo" / "Aceite suelo" | 2 | "Suelo" es "Zuelo", una marca de aceite de oliva premium que compran para ocasiones especiales, distinta del aceite de uso diario | Aceite de oliva premium (marca Zuelo) |

## Ítems que quedan marcados "a confirmar" (9)

Todos de baja frecuencia (1-2 apariciones). No se adivinaron para no ensuciar el catálogo; se pueden corregir directamente en la app cuando aparezcan en una próxima compra real, no hace falta resolverlos ahora:

| Producto (tentativo) | Frecuencia | Duda |
|---|---:|---|
| Queso (sin especificar) | 2 | ¿Cuál de los 5 tipos de queso que aparecen en la lista? |
| Espirales | 1 | ¿Fideos tipo espiral (pasta) o espiral repelente de mosquitos? |
| Coco | 1 | ¿Coco rallado (almacén) o coco fresco (verdulería)? |
| Shampoo y crema de enjuague (envase chico) | 1 | ¿Para bebé o para viaje? |
| Pañales (sin especificar) | 1 | Marca/talle no indicados |
| Raid (sin especificar) | 1 | ¿Pulgas, casa y jardín o líquido? |
| Fuyi (sin especificar) | 1 | ¿Líquido o pastillas? |
| Aparato eléctrico repelente | 1 | Es un bien durable, no un consumible — no debería generar recordatorio de reposición como los demás |
| Crema (de leche) | 1 | ¿Crema de leche (cocina) o crema corporal? |

## Cómo se usa esto en la app

- `productos_historico.csv` se importa como seed de la tabla `products`, con `default_shelf_life_days` = la columna `vida_util_estimada_dias` (usada en Fase 2 para el default de vencimiento cuando no se carga fecha exacta).
- `frecuencia_historica` sirve como punto de partida para `consumption_estimates` (Fase 4): no reemplaza el cálculo real basado en `stock_movements`, pero evita arrancar de cero — los 20 productos del ranking pueden tener activado desde el día 1 un recordatorio manual básico.
- El "Aparato eléctrico repelente" no debería tratarse como consumible en el modelo de datos (no tiene sentido pedir "reponer" un dispositivo); se carga en el catálogo pero sin recordatorio de reposición asociado.
