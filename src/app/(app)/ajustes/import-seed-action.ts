"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { getActiveHousehold } from "@/lib/household";

// Parser CSV minimo (RFC4180: comillas dobles para campos con comas,
// "" para escapar una comilla dentro de un campo). Alcanza para los
// archivos que generamos nosotros mismos en data/seed/, no pretende ser
// un parser CSV genérico.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  return body.map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])),
  );
}

export async function importSeedCatalog(): Promise<{
  ok: boolean;
  message: string;
}> {
  const { user, household } = await getActiveHousehold();
  if (!user || !household) {
    return { ok: false, message: "No hay hogar activo." };
  }

  const supabase = await createClient();
  const seedDir = path.join(process.cwd(), "data", "seed");

  const [categoriasRaw, productosRaw] = await Promise.all([
    readFile(path.join(seedDir, "categorias.csv"), "utf-8"),
    readFile(path.join(seedDir, "productos_historico.csv"), "utf-8"),
  ]);

  const categoriaRows = parseCsv(categoriasRaw);
  const productoRows = parseCsv(productosRaw);

  const { data: insertedCategories, error: catError } = await supabase
    .from("categories")
    .upsert(
      categoriaRows.map((r) => ({
        household_id: household.id,
        name: r.nombre,
        sort_order: parseInt(r.orden, 10) || 0,
      })),
      { onConflict: "household_id,name", ignoreDuplicates: true },
    )
    .select("id, name");

  if (catError) return { ok: false, message: catError.message };

  // upsert con ignoreDuplicates no devuelve las filas que ya existían, asi
  // que volvemos a leer todas las categorias del hogar para el mapeo.
  const { data: allCategories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("household_id", household.id);

  const categoryIdByName = new Map(
    (allCategories ?? insertedCategories ?? []).map((c) => [c.name, c.id]),
  );

  const productRowsToInsert = productoRows.map((r) => {
    const shelfLife = parseInt(r.vida_util_estimada_dias, 10);
    const isFlagged = r.a_confirmar?.trim().toLowerCase() === "si";
    return {
      household_id: household.id,
      category_id: categoryIdByName.get(r.categoria) ?? null,
      name: r.nombre,
      unit_label: r.unidad_referencia || "unidad",
      default_shelf_life_days: Number.isFinite(shelfLife) ? shelfLife : null,
      notes: isFlagged ? (r.notas ?? null) : null,
    };
  });

  const { error: prodError, count } = await supabase
    .from("products")
    .upsert(productRowsToInsert, {
      onConflict: "household_id,name",
      ignoreDuplicates: true,
      count: "exact",
    });

  if (prodError) return { ok: false, message: prodError.message };

  return {
    ok: true,
    message: `Catálogo importado: ${allCategories?.length ?? categoriaRows.length} categorías, ${count ?? productRowsToInsert.length} productos nuevos.`,
  };
}
