# Análisis del histórico de Google Keep — catálogo inicial de ListaSuper

Este documento resume la normalización del historial de la lista de súper (Google Keep, ~366 ítems tildados a lo largo del tiempo) en un catálogo estandarizado, pensado como **seed inicial** de la tabla `products` para la Fase 1 de la app.

Archivos generados:
- `data/seed/categorias.csv` — 12 categorías de supermercado.
- `data/seed/productos_historico.csv` — 141 productos normalizados, con categoría, unidad de referencia, vida útil estimada (para el default de vencimiento) y frecuencia histórica de compra.

## Metodología

1. Se extrajeron los 366 ítems tildados (`[x]`) y no tildados de la lista pegada.
2. Se contaron ocurrencias exactas (case-insensitive) para no perder frecuencia real.
3. Se agruparon variantes de escritura del mismo producto: errores de tipeo (`Ciff pisos` → `Cif pisos`, `Vierulana` → `Virulana`, `Raid liquidó` → `Raid líquido`), alias conocidos por anotación explícita en la propia lista (`Echo (Blem)` confirma que "Echo" es el apodo que usan para Blem pisos) y singular/plural o mayúsculas.
4. **No se fusionaron productos que son genuinamente distintos** aunque compartan familia: `Queso crema`, `Queso cremoso`, `Queso para rallar`, `Queso rallado` y `Queso duro` quedaron separados porque son compras diferentes en la práctica. Lo mismo con `Fideos largos` / `Fideos cortos` / `Fideos sopa`, o `Sal` / `Sal fina` / `Sal parrillera`.
5. Cuando un ítem del historial era ambiguo (no se podía inferir el producto exacto), se dejó una entrada con `a_confirmar = si` y una nota explicando la duda, en vez de adivinar y contaminar el catálogo.

## Frecuencia por categoría

| Categoría | Compras históricas | Productos distintos |
|---|---:|---:|
| Almacén | 95 | 52 |
| Limpieza del hogar | 86 | 23 |
| Lácteos, huevos y fiambres | 65 | 13 |
| Higiene y cuidado personal | 39 | 13 |
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
14. Mermelada — 6
15. Antigrasa (desengrasante) — 6
16. Aceite de oliva — 5
17. Jabón (sin especificar) — 5
18. Papel higiénico — 5
19. Pasta dental — 4
20. Crema de enjuague (acondicionador) — 4

Estos son los mejores candidatos para tener, desde el día 1, un umbral manual de "avisame cuando quede poco" (Fase 4 del plan), porque ya sabemos que se compran seguido.

## Ítems que quedaron marcados "a confirmar" (13)

No se adivinaron para no ensuciar el catálogo. Se puede corregir directamente en la app una vez cargada, pero conviene resolver las de mayor frecuencia antes de importar:

| Producto (tentativo) | Frecuencia | Duda |
|---|---:|---|
| Jabón (sin especificar) | 5 | ¿Tocador, para platos o para ropa? |
| Cif (sin especificar) | 3 | ¿Cif crema o Cif pisos? |
| Queso (sin especificar) | 2 | ¿Cuál de los 5 tipos de queso que aparecen en la lista? |
| Aceite (sin especificar) | 2 | ¿De oliva o de girasol? |
| Aceite para pisos de madera | 2 | Interpretación tentativa de "Aceite de oliva suelo" / "Aceite suelo" — podría ser un error de tipeo que mezcló dos ítems distintos |
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
